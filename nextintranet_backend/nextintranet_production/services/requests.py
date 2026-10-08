"""Requests for parts a BOM line is missing in its warehouse.

A request is a PurchaseRequest tagged with `source = {"type": "production", "bom_id", "line_id"}`.
A line has at most one *open* request (not yet assigned to a purchase); requesting again updates
it instead of adding another. Requests already on a purchase count as ordered and are subtracted
from what still needs requesting.
"""
import math

from django.core.exceptions import ValidationError

from nextintranet_warehouse.models.purchase import PurchaseRequest
from nextintranet_warehouse.models.transfer import TransferRequest, TransferStatus
from nextintranet_warehouse.models.warehouse import Warehouse

from ..models.production import CLOSED_TEMPLATE_STATUSES, TemplateComponent

SOURCE_TYPE = "production"


class RequestError(ValueError):
    pass


def _empty_line_entry() -> dict:
    return {
        "open_id": None,
        "open_quantity": 0,
        "ordered_quantity": 0,
        "target_location_id": None,
        "target_location_name": None,
        "transfer_quantity": 0,
        "transfers": [],
    }


def line_requests(template) -> dict[str, dict]:
    """Per line: open purchase request, ordered quantity and open transfers.

    {line_id: {open_id, open_quantity, ordered_quantity, target_location_id, target_location_name,
               transfer_quantity, transfers: [{id, quantity, source_warehouse_id, source_warehouse_name}]}}
    """
    result: dict[str, dict] = {}
    requests = PurchaseRequest.objects.filter(
        source__type=SOURCE_TYPE, source__bom_id=str(template.id)
    ).select_related("target_location")
    transfers = TransferRequest.objects.filter(
        source__type=SOURCE_TYPE, source__bom_id=str(template.id), status=TransferStatus.OPEN
    ).select_related("source_warehouse")
    for transfer in transfers:
        line_id = str((transfer.source or {}).get("line_id") or "")
        if not line_id:
            continue
        entry = result.setdefault(line_id, _empty_line_entry())
        entry["transfer_quantity"] += transfer.quantity
        entry["transfers"].append(
            {
                "id": str(transfer.id),
                "quantity": transfer.quantity,
                "source_warehouse_id": str(transfer.source_warehouse_id),
                "source_warehouse_name": transfer.source_warehouse.full_path,
            }
        )
    for request in requests:
        line_id = str((request.source or {}).get("line_id") or "")
        if not line_id:
            continue
        entry = result.setdefault(line_id, _empty_line_entry())
        if request.purchase_id is None:
            entry["open_id"] = str(request.id)
            entry["open_quantity"] += request.quantity
            if request.target_location_id:
                entry["target_location_id"] = str(request.target_location_id)
                entry["target_location_name"] = request.target_location.full_path
        else:
            entry["ordered_quantity"] += request.quantity
    return result


def _covered(entry: dict) -> float:
    """What is already on its way for the line: ordered purchase requests and open transfers."""
    return (entry.get("ordered_quantity") or 0) + (entry.get("transfer_quantity") or 0)


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
        missing = _shortages(template).get(str(line.id), 0.0) - _covered(existing)
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
        missing = shortages.get(str(line.id), 0.0) - _covered(existing.get(str(line.id), {}))
        if math.ceil(missing - 1e-9) <= 0:
            continue
        created.append(request_line(line, user))
    return created


def transfer_line(line: TemplateComponent, user=None, source_warehouse_id=None, quantity=None) -> TransferRequest:
    """Create or update the open transfer of the line's component into the BOM's warehouse.

    `source_warehouse_id` defaults to the other warehouse with the most free stock; `quantity`
    defaults to what is missing (minus what is already ordered or transferring), capped by what is
    free in the source warehouse.
    """
    from nextintranet_warehouse.services.availability import component_availability

    template = line.template
    _check_template(template)
    if line.component_id is None:
        raise RequestError("Link a component to the line first.")
    if line.dnp:
        raise RequestError("The line is marked DNP.")
    if template.stock_warehouse_id is None:
        raise RequestError("Choose the BOM's warehouse first.")

    availability = component_availability([line.component_id], include_incoming=False)[line.component_id]
    existing_transfer = TransferRequest.objects.filter(
        status=TransferStatus.OPEN, source__type=SOURCE_TYPE, source__line_id=str(line.id),
        **({"source_warehouse_id": source_warehouse_id} if source_warehouse_id else {}),
    ).first()

    def free_in(warehouse_id):
        free = availability.in_warehouse(warehouse_id).free
        if existing_transfer and existing_transfer.source_warehouse_id == warehouse_id:
            free += existing_transfer.quantity  # its own hold does not count against it
        return free

    if source_warehouse_id:
        try:
            source = Warehouse.objects.filter(id=source_warehouse_id, is_warehouse=True).first()
        except (ValidationError, ValueError):
            source = None
        if source is None:
            raise RequestError("Source warehouse not found.")
    else:
        candidates = [wid for wid in availability.warehouse_ids() if wid != template.stock_warehouse_id]
        candidates = [wid for wid in candidates if free_in(wid) > 0]
        if not candidates:
            raise RequestError("No other warehouse has free stock of this component.")
        source = Warehouse.objects.get(id=max(candidates, key=free_in))
    if source.id == template.stock_warehouse_id:
        raise RequestError("Source and target warehouse are the same.")

    available = free_in(source.id)
    if quantity is None:
        entry = line_requests(template).get(str(line.id), {})
        own_transfer = existing_transfer.quantity if existing_transfer else 0
        missing = _shortages(template).get(str(line.id), 0.0) - _covered(entry) + own_transfer
        quantity = min(missing, available)
        if quantity <= 0:
            raise RequestError("Nothing is missing for this line, or the source warehouse has no free stock.")
    quantity = float(quantity)
    if quantity <= 0:
        raise RequestError("Quantity must be positive.")
    if quantity > available + 1e-9:
        raise RequestError(f"Only {available:g} free in {source.full_path}.")

    transfer = existing_transfer or TransferRequest(
        component_id=line.component_id,
        requested_by=user if user is not None and getattr(user, "is_authenticated", False) else None,
        source={
            "type": SOURCE_TYPE,
            "bom_id": str(template.id),
            "line_id": str(line.id),
            "production_id": str(template.production_id),
        },
    )
    transfer.source_warehouse = source
    transfer.target_location = template.stock_warehouse
    transfer.quantity = quantity
    transfer.note = f"{template.production.name} / {template.name} — {line.ref_group or line.value or 'line'}"
    transfer.save()
    return transfer

