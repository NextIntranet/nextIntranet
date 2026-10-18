"""Overview numbers for one BOM series (Template): parts, cost, progress, files."""
from collections import Counter
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.db.models import Count, Q, Sum

from nextintranet_warehouse.models.component import Packet, StockOperation

from ..models.production import Template
from .bom import bom_availability_rows, line_needed_total, safe_float


def unit_prices(component_ids: set) -> dict[Any, tuple[float | None, str]]:
    """Best known unit price per component: stock value → internal price → last purchase."""
    prices: dict[Any, tuple[float | None, str]] = {}
    stock = (
        Packet.objects.filter(component_id__in=component_ids, is_active=True, count__gt=0)
        .values("component_id")
        .annotate(value=Sum("totalValue"), count=Sum("count"))
    )
    for row in stock:
        count = safe_float(row["count"])
        value = safe_float(row["value"])
        if count > 0 and value > 0:
            prices[row["component_id"]] = (value / count, "stock")

    from nextintranet_warehouse.models.component import Component

    for component in Component.objects.filter(id__in=component_ids - set(prices)):
        if component.internal_price:
            prices[component.id] = (float(component.internal_price), "internal")
            continue
        last = component.last_purchase_price()
        prices[component.id] = (float(last), "purchase") if last else (None, "missing")
    return prices


def consumed_cost(template: Template) -> float:
    """Value of parts actually booked out of stock by placement scans (returned ones are zeroed)."""
    total = 0.0
    operations = StockOperation.objects.filter(
        operation_type="remove", metadata__production_id=str(template.id)
    ).values_list("quantity", "unit_price")
    for quantity, unit_price in operations:
        total += abs(safe_float(quantity)) * safe_float(unit_price)
    return total


def _file_name(field) -> str | None:
    return field.name.rsplit("/", 1)[-1] if field else None


def _file_url(field) -> str | None:
    try:
        return field.url if field else None
    except Exception:
        return None


def template_summary(template: Template, home_location_ids: set | None = None, warehouse_id=None) -> dict[str, Any]:
    from nextintranet_backend.models import Attachment, Note

    lines = list(template.components.select_related("component").order_by("position", "id"))
    active = [line for line in lines if not line.dnp and not line.exclude_from_bom]
    linked = [line for line in active if line.component_id]
    component_ids = {line.component_id for line in linked}
    prices = unit_prices(component_ids)

    parts_per_board = sum(int(line.qty_per_board or 0) for line in active)
    parts_total = sum(float(line_needed_total(line, template.qty_planned)) for line in active)
    sides = Counter(line.side or "both" for line in active)

    cost_per_board = 0.0
    cost_total = 0.0
    priced_lines = 0
    unpriced = []
    price_sources = Counter()
    for line in active:
        price, source = prices.get(line.component_id, (None, "unlinked")) if line.component_id else (None, "unlinked")
        price_sources[source] += 1
        if price is None:
            unpriced.append(
                {
                    "line_id": str(line.id),
                    "ref_group": line.ref_group,
                    "value": line.value,
                    "component": line.component.name if line.component else None,
                }
            )
            continue
        priced_lines += 1
        cost_per_board += price * int(line.qty_per_board or 0)
        cost_total += price * float(line_needed_total(line, template.qty_planned))

    sourced = sum(min(safe_float(line.sourced_total), float(line_needed_total(line, template.qty_planned))) for line in active)
    placed = sum(min(safe_float(line.placed_total), float(line_needed_total(line, template.qty_planned))) for line in active)

    availability = Counter()
    if template.series_kind != "template":
        for row in bom_availability_rows(template, home_location_ids, warehouse_id):
            if row["dnp"] or row["exclude_from_bom"]:
                continue
            availability[row["status"]] += 1

    content_type = ContentType.objects.get_for_model(Template)
    target = {"content_type": content_type, "object_id": str(template.id)}
    attachment_counts = Attachment.objects.filter(**target).aggregate(
        photos=Count("id", filter=Q(kind=Attachment.KIND_PHOTO)),
        files=Count("id", filter=~Q(kind=Attachment.KIND_PHOTO)),
    )

    return {
        "bom_id": str(template.id),
        "status": template.status,
        "series_kind": template.series_kind,
        "qty_planned": template.qty_planned,
        "planned_date": template.planned_date,
        "created_at": template.created_at,
        "locked_at": template.locked_at,
        "locked_by": template.locked_by.get_username() if template.locked_by else None,
        "reserved_at": template.reserved_at,
        "stock_warehouse_name": template.stock_warehouse.full_path if template.stock_warehouse else None,
        "parts": {
            "lines": len(lines),
            "active_lines": len(active),
            "component_types": len(component_ids),
            "unlinked_lines": sum(1 for line in active if not line.component_id),
            "dnp_lines": sum(1 for line in lines if line.dnp),
            "excluded_lines": sum(1 for line in lines if line.exclude_from_bom),
            "needs_review_lines": sum(1 for line in active if line.needs_review),
            "parts_per_board": parts_per_board,
            "parts_total": parts_total,
            "footprints": len({line.footprint for line in active if line.footprint}),
            "sides": dict(sides),
        },
        "cost": {
            "per_board": round(cost_per_board, 4),
            "total": round(cost_total, 2),
            "consumed": round(consumed_cost(template), 2),
            "priced_lines": priced_lines,
            "coverage": round(priced_lines / len(active), 4) if active else 1.0,
            "price_sources": dict(price_sources),
            "unpriced_lines": unpriced[:50],
        },
        "progress": {
            "needed": parts_total,
            "sourced": sourced,
            "placed": placed,
        },
        "availability": dict(availability),
        "files": {
            "source_file_url": _file_url(template.source_file),
            "source_file_name": _file_name(template.source_file),
            "source_url": template.source_url or None,
            "source_hash": template.source_hash or None,
            "source_imported_at": template.source_imported_at,
            "ibom_file_url": _file_url(template.ibom_file),
            "ibom_file_name": _file_name(template.ibom_file),
            "ibom_url": template.ibom_url or None,
            "ibom_updated_at": template.ibom_updated_at,
        },
        "counts": {
            "notes": Note.objects.filter(**target).count(),
            "photos": attachment_counts["photos"],
            "files": attachment_counts["files"],
        },
    }
