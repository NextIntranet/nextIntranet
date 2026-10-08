"""Requests for parts a BOM line is missing in its warehouse.

A request is a PurchaseRequest tagged with `source = {"type": "production", "bom_id", "line_id"}`.
A line has at most one *open* request (not yet assigned to a purchase); requesting again updates
it instead of adding another. Requests already on a purchase count as ordered and are subtracted
from what still needs requesting.
"""
import math

from django.core.exceptions import ValidationError

from nextintranet_warehouse.models.purchase import PurchaseRequest
from nextintranet_warehouse.models.warehouse import Warehouse

from ..models.production import CLOSED_TEMPLATE_STATUSES, TemplateComponent

SOURCE_TYPE = "production"


class RequestError(ValueError):
    pass


def line_requests(template) -> dict[str, dict]:
    """{line_id: {open_id, open_quantity, ordered_quantity, target_location_id, target_location_name}}."""
    result: dict[str, dict] = {}
    requests = PurchaseRequest.objects.filter(
        source__type=SOURCE_TYPE, source__bom_id=str(template.id)
    ).select_related("target_location")
    for request in requests:
        line_id = str((request.source or {}).get("line_id") or "")
        if not line_id:
            continue
        entry = result.setdefault(
            line_id,
            {
                "open_id": None,
                "open_quantity": 0,
                "ordered_quantity": 0,
                "target_location_id": None,
                "target_location_name": None,
            },
        )
        if request.purchase_id is None:
            entry["open_id"] = str(request.id)
            entry["open_quantity"] += request.quantity
            if request.target_location_id:
                entry["target_location_id"] = str(request.target_location_id)
                entry["target_location_name"] = request.target_location.full_path
        else:
            entry["ordered_quantity"] += request.quantity
    return result


def _target_location(location_id):
    try:
        location = Warehouse.objects.filter(id=location_id).first()
    except (ValidationError, ValueError):
        location = None
    if location is None:
        raise RequestError("Target location not found.")
    if not (location.is_warehouse or location.can_store_items):
        raise RequestError(f"Location '{location.full_path}' is neither a warehouse nor a storage position.")
    return location


def _check_template(template):
    if template.status in CLOSED_TEMPLATE_STATUSES:
        raise RequestError("BOM is closed.")
    if template.series_kind == "template":
        raise RequestError("Only working series can request parts. Create a working copy from the template.")


def _shortages(template) -> dict[str, float]:
    """{line_id: quantity still missing in the BOM's warehouse, after already ordered requests}."""
    from .bom import bom_availability_rows

    rows = bom_availability_rows(template)
    return {row["id"]: max(0.0, row["remaining"] - row["in_stock"]) for row in rows}


def request_line(line: TemplateComponent, user=None, quantity=None, target_location_id=None) -> PurchaseRequest:
    """Create or update the open request for a BOM line.

    `quantity` defaults to what is missing in the BOM's warehouse minus what is already ordered;
    `target_location_id` defaults to the BOM's warehouse.
    """
    template = line.template
    _check_template(template)
    if line.component_id is None:
        raise RequestError("Link a component to the line first.")
    if line.dnp:
        raise RequestError("The line is marked DNP.")

    existing = line_requests(template).get(str(line.id), {})
    if quantity is None:
        missing = _shortages(template).get(str(line.id), 0.0) - existing.get("ordered_quantity", 0)
        quantity = math.ceil(missing - 1e-9)
        if quantity <= 0:
            raise RequestError("Nothing is missing for this line.")
    quantity = int(quantity)
    if quantity <= 0:
        raise RequestError("Quantity must be positive.")

    if target_location_id:
        target = _target_location(target_location_id)
    else:
        target = template.stock_warehouse

    request = PurchaseRequest.objects.filter(
        purchase__isnull=True,
        source__type=SOURCE_TYPE,
        source__line_id=str(line.id),
    ).first()
    if request is None:
        request = PurchaseRequest(
            component_id=line.component_id,
            requested_by=user if user is not None and getattr(user, "is_authenticated", False) else None,
            source={
                "type": SOURCE_TYPE,
                "bom_id": str(template.id),
                "line_id": str(line.id),
                "production_id": str(template.production_id),
            },
        )
    request.component_id = line.component_id
    request.quantity = quantity
    request.target_location = target
    request.description = f"{template.production.name} / {template.name} — {line.ref_group or line.value or 'line'}"
    request.save()
    return request


def request_missing(template, user=None) -> list[PurchaseRequest]:
    """Request every line that is short in the BOM's warehouse (skips lines already covered)."""
    _check_template(template)
    shortages = _shortages(template)
    existing = line_requests(template)
    created = []
    lines = template.components.filter(component__isnull=False, dnp=False).select_related("template__production")
    for line in lines:
        missing = shortages.get(str(line.id), 0.0) - existing.get(str(line.id), {}).get("ordered_quantity", 0)
        if math.ceil(missing - 1e-9) <= 0:
            continue
        created.append(request_line(line, user))
    return created
