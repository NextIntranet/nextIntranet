"""Production as a reservation source.

A reserved BOM holds, per line, what it still needs: `max(0, needed_total − placed_total)`.
Nothing is stored — the figure follows the BOM as parts are placed, quantities change or
the BOM is finished, so there is no reservation row that could drift from it.
"""
from decimal import Decimal

from django.db.models import (
    Case,
    DecimalField,
    ExpressionWrapper,
    F,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Cast, Greatest

from nextintranet_warehouse.services.availability import ReservationEntry

from ..models.production import TemplateComponent
from .bom import line_needed_total, safe_float

SOURCE = "production"

_DECIMAL = DecimalField(max_digits=20, decimal_places=6)


def holding_lines():
    """BOM lines whose BOM currently holds stock."""
    return (
        TemplateComponent.objects.filter(
            component__isnull=False,
            dnp=False,
            template__reserved_at__isnull=False,
        )
        .exclude(template__status="finished")
    )


def line_remaining(line: TemplateComponent) -> float:
    needed = safe_float(line_needed_total(line, line.template.qty_planned))
    return max(0.0, needed - safe_float(line.placed_total))


def line_entry(line: TemplateComponent) -> ReservationEntry:
    template = line.template
    return ReservationEntry(
        source=SOURCE,
        ref_id=str(line.id),
        component_id=line.component_id,
        warehouse_id=template.stock_warehouse_id,
        quantity=line_remaining(line),
        label=f"{template.production.name} / {template.name}",
        meta={
            "bom_id": str(template.id),
            "line_id": str(line.id),
            "production_id": str(template.production_id),
            "planned_date": template.planned_date.isoformat() if template.planned_date else None,
        },
    )


def _remaining_expression():
    needed = Case(
        When(qty_override_total__isnull=False, then=Cast("qty_override_total", output_field=_DECIMAL)),
        default=ExpressionWrapper(
            Cast(F("qty_per_board"), output_field=_DECIMAL) * Cast(F("template__qty_planned"), output_field=_DECIMAL),
            output_field=_DECIMAL,
        ),
        output_field=_DECIMAL,
    )
    return Greatest(
        ExpressionWrapper(needed - Cast("placed_total", output_field=_DECIMAL), output_field=_DECIMAL),
        Value(Decimal("0"), output_field=_DECIMAL),
        output_field=_DECIMAL,
    )


class ProductionReservationProvider:
    source = SOURCE

    def entries(self, component_ids):
        lines = holding_lines().filter(component_id__in=component_ids).select_related(
            "template", "template__production"
        )
        for line in lines:
            yield line_entry(line)

    def total_subquery(self):
        return Subquery(
            holding_lines()
            .filter(component=OuterRef("pk"))
            .values("component")
            .annotate(s=Sum(_remaining_expression()))
            .values("s")[:1]
        )


class ReservationError(ValueError):
    pass


def resolve_stock_warehouse(warehouse_id):
    """Validate a warehouse id for a BOM/reservation: it must be a location flagged as warehouse."""
    from nextintranet_warehouse.models.warehouse import Warehouse

    from django.core.exceptions import ValidationError

    try:
        warehouse = Warehouse.objects.filter(id=warehouse_id).first()
    except (ValidationError, ValueError):
        warehouse = None
    if warehouse is None:
        raise ReservationError("Warehouse not found.")
    if not warehouse.is_warehouse:
        raise ReservationError(f"Location '{warehouse.full_path}' is not a warehouse.")
    return warehouse


def reserve_bom(template, user=None, warehouse_id=None):
    """Make the BOM hold its remaining line demand in its warehouse."""
    from django.utils import timezone

    from nextintranet_warehouse.services.availability import default_warehouse_for_user

    from ..models.production import CLOSED_TEMPLATE_STATUSES

    if template.status in CLOSED_TEMPLATE_STATUSES:
        raise ReservationError("BOM is closed and cannot be reserved.")
    if template.series_kind == "template":
        raise ReservationError("Only working series can be reserved. Create a working copy from the template.")

    if warehouse_id:
        template.stock_warehouse = resolve_stock_warehouse(warehouse_id)
    elif template.stock_warehouse_id is None:
        default_id = default_warehouse_for_user(user)
        if default_id is None:
            raise ReservationError("Choose the warehouse the BOM draws its parts from.")
        template.stock_warehouse_id = default_id

    newly_reserved = template.reserved_at is None
    if newly_reserved:
        template.reserved_at = timezone.now()
        template.reserved_by = user if user is not None and getattr(user, "is_authenticated", False) else None
    template.save(update_fields=["stock_warehouse", "reserved_at", "reserved_by"])
    if newly_reserved:
        _log_bom_hold(template, "bom_reserved", user)
    return template


def unreserve_bom(template, user=None):
    was_reserved = template.reserved_at is not None
    template.reserved_at = None
    template.reserved_by = None
    template.save(update_fields=["reserved_at", "reserved_by"])
    if was_reserved:
        _log_bom_hold(template, "bom_unreserved", user)
    return template


def _log_bom_hold(template, activity_type, user):
    """One activity entry per component the BOM uses, so it shows up in each component's log."""
    from nextintranet_warehouse.services.activity import log_activity

    warehouse = template.stock_warehouse.full_path if template.stock_warehouse_id else "no warehouse"
    verb = "holds parts in" if activity_type == "bom_reserved" else "released its hold in"
    seen = set()
    for line in template.components.filter(component__isnull=False, dnp=False).select_related("component"):
        if line.component_id in seen:
            continue
        seen.add(line.component_id)
        log_activity(
            activity_type=activity_type,
            source="production",
            component=line.component,
            user=user if user is not None and getattr(user, "is_authenticated", False) else None,
            description=f"BOM {template.production.name} / {template.name} {verb} {warehouse}",
            metadata={"bom_id": str(template.id)},
        )


def bom_reserved_quantities(template_ids, component_id) -> dict[str, float]:
    """{bom_id: quantity currently held for the component} for BOMs that hold stock."""
    held: dict[str, float] = {}
    lines = holding_lines().filter(template_id__in=template_ids, component_id=component_id).select_related("template")
    for line in lines:
        key = str(line.template_id)
        held[key] = held.get(key, 0.0) + line_remaining(line)
    return held
