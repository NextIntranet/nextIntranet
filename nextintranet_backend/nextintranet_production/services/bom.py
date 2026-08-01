"""Shared BOM (Template) business logic used by both the DRF views and the MCP toolset.

Kept separate from views/production.py so the MCP tools don't have to import
private helpers out of a view module.
"""
from decimal import Decimal
from typing import Any

from django.db.models import Sum
from django.utils import timezone

from nextintranet_warehouse.models.component import Component, Packet, Reservation, StockOperation
from nextintranet_warehouse.services.activity import log_activity

from ..models.production import TemplateComponent, TemplateComponentScan


def safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def safe_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def line_needed_total(line: TemplateComponent, qty_planned: int) -> Decimal:
    if line.qty_override_total is not None:
        return safe_decimal(line.qty_override_total)
    return Decimal(line.qty_per_board or 0) * Decimal(qty_planned or 0)


def line_locations(
    component: Component | None,
    home_location_ids: set | None = None,
) -> list[dict[str, Any]]:
    if not component:
        return []
    rows = []
    packets = (
        component.packets.select_related("location")
        .filter(is_active=True)
        .order_by("location__name", "id")
    )
    for packet in packets:
        count = safe_float(packet.count)
        if count <= 0:
            continue
        rows.append(
            {
                "packet_id": str(packet.id),
                "location": packet.location.full_path if packet.location else "Unknown",
                "quantity": count,
                "in_home": bool(home_location_ids and packet.location_id in home_location_ids),
            }
        )
    return rows


def recalculate_scan_totals(line: TemplateComponent) -> tuple[Decimal, Decimal]:
    sourced_only_total = line.scans.filter(mode="sourced").aggregate(total=Sum("qty")).get("total") or Decimal("0")
    placed_total = line.scans.filter(mode="placed").aggregate(total=Sum("qty")).get("total") or Decimal("0")

    # Placed parts are also sourced by definition.
    sourced_total = sourced_only_total + placed_total
    line.sourced_total = sourced_total
    line.placed_total = placed_total
    line.save(update_fields=["sourced_total", "placed_total"])
    return sourced_total, placed_total


def line_deducted_total(line: TemplateComponent) -> float:
    """How much of this line is currently booked out of the warehouse.

    Sums the live (non-returned) placement operations; reverted ones are zeroed, so
    they drop out on their own.
    """
    total = 0.0
    for scan in line.scans.select_related("stock_operation").filter(mode="placed"):
        if scan.stock_operation is not None:
            total += abs(safe_float(scan.stock_operation.quantity))
    return total


def _fallback_packet(component: Component) -> Packet | None:
    """Pick a packet to book a placement against when no bag was scanned.

    Oldest active packet that still has stock (FIFO); when everything is empty, the
    newest active packet so the deduction drives it negative instead of being lost.
    """
    packet = (
        Packet.objects.filter(component=component, is_active=True, count__gt=0)
        .order_by("date_added", "id")
        .first()
    )
    if packet is not None:
        return packet
    return (
        Packet.objects.filter(component=component, is_active=True)
        .order_by("-date_added", "-id")
        .first()
    )


def consume_for_placed_scan(scan, template, line, packet: Packet | None, user) -> StockOperation:
    """Book the scanned quantity out of the bag that was placed.

    Creates exactly one `remove` operation and links it to the scan, so undoing the
    placement is a matter of zeroing that single row. When the barcode resolved to a
    component but not to a bag, falls back to FIFO. A bag holding less than the placed
    quantity goes negative on purpose — the parts are physically gone either way.
    """
    target = packet or _fallback_packet(line.component)
    if target is None:
        raise ValueError(
            f"Component '{line.component.name}' has no packet to deduct {safe_float(scan.qty):.3f} from."
        )

    operation = StockOperation.objects.create(
        packet=target,
        reference=template.id,
        operation_type="remove",
        quantity=-safe_float(scan.qty),
        relative_quantity=True,
        unit_price=float(target.itemValue) if target.itemValue is not None else None,
        description=f"Production placed: {template.name} / {line.ref_group or line.value or line.id}",
        metadata={
            "production_id": str(template.id),
            "line_id": str(line.id),
            "scan_id": str(scan.id),
        },
        author=user,
    )
    scan.stock_operation = operation
    scan.save(update_fields=["stock_operation"])
    return operation


def revert_placed_scan_stock(scan, user) -> StockOperation | None:
    """Return the stock a placed scan deducted, keeping the ledger row as evidence.

    The operation is zeroed rather than deleted: something did happen with that part,
    and the packet history should keep saying so. Idempotent.
    """
    operation = scan.stock_operation
    if operation is None or not safe_float(operation.quantity):
        return None

    returned_qty = abs(safe_float(operation.quantity))
    operation.quantity = 0
    if "(returned)" not in (operation.description or ""):
        operation.description = f"{operation.description or ''} (returned)".strip()
    operation.metadata = {
        **(operation.metadata or {}),
        "reverted": True,
        "reverted_at": timezone.now().isoformat(),
        "reverted_by": str(user.id) if user is not None and getattr(user, "is_authenticated", False) else None,
    }
    operation.save()

    # StockOperation.save() only logs activity on create, so record the return explicitly.
    log_activity(
        activity_type="stock_operation",
        source="production",
        packet=operation.packet,
        stock_operation=operation,
        user=user if user is not None and getattr(user, "is_authenticated", False) else None,
        description="Returned production placement",
        metadata={
            "returned_qty": returned_qty,
            **{
                key: value
                for key, value in (operation.metadata or {}).items()
                if key in {"production_id", "line_id", "scan_id"}
            },
        },
    )
    return operation


def bom_availability_rows(template, home_location_ids: set | None = None) -> list[dict[str, Any]]:
    """Per-line needed/in-stock/shortage rows for a BOM (Template).

    Shared by the availability API view and the MCP read tool so shortage math
    (self-reservation aware) lives in exactly one place.
    """
    rows = []
    lines_qs = (
        template.components.select_related("component")
        .prefetch_related("component__packets__location", "component__reservations")
        .order_by("position", "id")
    )
    template_id_str = str(template.id)
    for line in lines_qs:
        needed_total = line_needed_total(line, template.qty_planned)
        locations = line_locations(line.component, home_location_ids)
        total_quantity = sum(safe_float(loc.get("quantity") or 0) for loc in locations)
        if line.component:
            total_reserved = sum(
                safe_float(r.quantity) for r in line.component.reservations.all()
            )
            reserved_for_this_bom = sum(
                safe_float(r.quantity)
                for r in line.component.reservations.all()
                if any(s.get("bom_id") == template_id_str for s in (r.sources or []))
            )
            other_reserved = total_reserved - reserved_for_this_bom
            inventory_total = max(0.0, total_quantity - other_reserved)
        else:
            inventory_total = 0.0
        total_in_home = None
        if home_location_ids and line.component:
            total_in_home = sum(
                safe_float(p.count)
                for p in line.component.packets.all()
                if p.location_id in home_location_ids
            )
        shortage = not line.dnp and (float(needed_total) > inventory_total)
        row = {
            "id": str(line.id),
            "ref_group": line.ref_group,
            "value": line.value,
            "footprint": line.footprint,
            "dnp": line.dnp,
            "exclude_from_bom": line.exclude_from_bom,
            "linked_component": str(line.component_id) if line.component_id else None,
            "linked_component_name": line.component.name if line.component else None,
            "needed_total": float(needed_total),
            "in_stock": inventory_total,
            "total_quantity": total_quantity,
            "locations": locations,
            "shortage": shortage,
            "unlinked": line.component_id is None,
        }
        if total_in_home is not None:
            row["total_in_home"] = total_in_home
        rows.append(row)
    return rows


def merge_lines(target: TemplateComponent, source: TemplateComponent) -> TemplateComponent:
    """Move all of source's ref children + scans into target, then delete source."""
    source.ref_items.update(line=target, template=target.template)
    TemplateComponentScan.objects.filter(template_component=source).update(template_component=target)
    target.sync_ref_cache()
    recalculate_scan_totals(target)
    source.delete()
    return target


def _release_line_reservations(line: TemplateComponent) -> None:
    """Release stock reservations held specifically for this BOM line.

    Reservations created via "Reserve BOM" tag their `sources` entry with the owning
    `bom_id`/`line_id` (see Reservation.sources help text) precisely so they can be
    cleaned up if the line's component changes later — this is that cleanup.
    """
    bom_id = str(line.template_id)
    line_id = str(line.id)
    for reservation in Reservation.objects.filter(component_id=line.component_id):
        sources = reservation.sources or []
        matches = [
            s
            for s in sources
            if isinstance(s, dict)
            and s.get("type") == "production"
            and s.get("bom_id") == bom_id
            and s.get("line_id") == line_id
        ]
        if not matches:
            continue
        # Only delete when this line is the *sole* reason for the reservation.
        # Stripping just the matching source while leaving others would keep the
        # stock held but drop it out of "Unreserve BOM"'s bom_id-based lookup —
        # an invisible hold, worse than leaving it as-is.
        if len(matches) == len(sources):
            reservation.delete()


def unlink_component(line: TemplateComponent) -> TemplateComponent:
    """Clear the linked component from a BOM line, leaving it unlinked.

    Used when a wrong component was picked and no correct replacement is known yet —
    an empty line is safer than one pointing at the wrong component (availability,
    scanning and finalize all key off `component`). Also releases any stock
    reservation held specifically for this line, so the wrong component doesn't stay
    reserved with no line pointing at it.

    KNOWN LIMITATION: this does not touch sourced_total/placed_total or the line's
    TemplateComponentScan rows. A line can end up unlinked (no component) while still
    showing prior scan progress, since scans represent real physical work already
    done and clearing them isn't obviously safe to do automatically. Revisit once
    it's clear what should happen to that scan history on unlink.
    """
    if line.component_id is not None:
        _release_line_reservations(line)
        line.component = None
        line.save(update_fields=["component"])
    return line


def assign_component_to_refs(
    line: TemplateComponent,
    component: Component | None,
    refs: list[str] | None,
) -> tuple[TemplateComponent, bool]:
    """Assign `component` to the given refs of `line` (default: all refs).

    Implements both split (subset of refs → different component) and auto-merge
    (target component already has a line in this template). Returns the resulting
    line and whether a merge with an existing line happened.

    Scan progress: a whole-line move into an existing line combines scans (merge);
    a partial move leaves scans on the original line (split).
    """
    all_refs = list(line.ref_items.order_by("position", "ref").values_list("ref", flat=True))
    selected = [r for r in (refs or all_refs) if r in all_refs] or all_refs
    is_whole_line = len(selected) >= len(all_refs)

    existing_target = None
    if component is not None:
        existing_target = (
            TemplateComponent.objects.filter(template=line.template, component=component)
            .exclude(id=line.id)
            .order_by("position", "created_at")
            .first()
        )

    # Case 1: a line for this component already exists → move refs into it.
    if existing_target is not None:
        if is_whole_line:
            merge_lines(existing_target, line)
            return existing_target, True
        line.ref_items.filter(ref__in=selected).update(
            line=existing_target, template=existing_target.template
        )
        existing_target.sync_ref_cache()
        line.sync_ref_cache()
        return existing_target, True

    # Case 2: no existing target.
    if is_whole_line:
        if component is not None:
            line.component = component
            line.save(update_fields=["component"])
        return line, False

    # Partial move with no existing target → split into a new line.
    new_line = TemplateComponent.objects.create(
        template=line.template,
        component=component if component is not None else line.component,
        position=line.position,
        notes=line.notes,
        attributes={},
        source_type=line.source_type,
        value=line.value,
        footprint=line.footprint,
        datasheet=line.datasheet,
        bom_description=line.bom_description,
        dnp=line.dnp,
        exclude_from_bom=line.exclude_from_bom,
        needs_review=line.needs_review,
        import_snapshot={},
    )
    line.ref_items.filter(ref__in=selected).update(line=new_line, template=new_line.template)
    new_line.sync_ref_cache()
    line.sync_ref_cache()
    return new_line, False
