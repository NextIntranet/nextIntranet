"""Shared BOM (Template) business logic used by both the DRF views and the MCP toolset.

Kept separate from views/production.py so the MCP tools don't have to import
private helpers out of a view module.
"""
from decimal import Decimal
from typing import Any

from django.db.models import Sum

from nextintranet_warehouse.models.component import Component, Packet, StockOperation

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


def consume_component(component: Component, qty: float, reference, user, description: str):
    remaining = float(qty)
    packets = (
        Packet.objects.filter(component=component, is_active=True, count__gt=0)
        .order_by("date_added", "id")
        .all()
    )

    for packet in packets:
        if remaining <= 0:
            break
        packet_count = safe_float(packet.count)
        if packet_count <= 0:
            continue

        consume_qty = min(packet_count, remaining)
        StockOperation.objects.create(
            packet=packet,
            reference=reference,
            operation_type="remove",
            quantity=-float(consume_qty),
            relative_quantity=True,
            unit_price=packet.itemValue if packet.itemValue is not None else None,
            description=description,
            metadata={"production_id": str(reference)} if reference else {},
            author=user,
        )
        remaining -= consume_qty

    if remaining > 0:
        raise ValueError(f"Insufficient stock for component '{component.name}'. Missing {remaining:.3f}.")


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
