from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.utils import timezone


CALCULATED_PACKET_FIELDS = {"count", "itemValue", "totalValue", "last_operation"}
COUNT_ACTIVITY_TYPES = {"stock_operation"}
COUNT_OPERATION_TYPES = {
    "add",
    "remove",
    "adjust",
    "trans_in",
    "trans_out",
    "inventory",
    "service",
    "buy",
    "sell",
}


def actor_from_request(request):
    if request and getattr(request, "user", None) and request.user.is_authenticated:
        return request.user
    return None


def compact_changes(before: dict[str, Any], after: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    changed_before: dict[str, Any] = {}
    changed_after: dict[str, Any] = {}
    for key, before_value in before.items():
        if key in CALCULATED_PACKET_FIELDS:
            continue
        after_value = after.get(key)
        if before_value != after_value:
            changed_before[key] = before_value
            changed_after[key] = after_value
    return changed_before, changed_after


def packet_snapshot(packet) -> dict[str, Any]:
    return {
        "component": str(packet.component_id) if packet.component_id else None,
        "location": str(packet.location_id) if packet.location_id else None,
        "description": packet.description,
        "is_trackable": packet.is_trackable,
        "is_active": packet.is_active,
    }


def component_snapshot(component) -> dict[str, Any]:
    return {
        "name": component.name,
        "description": component.description,
        "category": str(component.category_id) if component.category_id else None,
        "unit_type": component.unit_type,
        "selling_price": component.selling_price,
        "internal_price": component.internal_price,
        "primary_image": component.primary_image,
        "tags": sorted(str(tag_id) for tag_id in component.tags.values_list("id", flat=True)),
    }


def activity_source_for_stock_operation(operation) -> str:
    metadata = operation.metadata or {}
    description = (operation.description or "").lower()
    if metadata.get("production_id"):
        return "production"
    if operation.operation_type == "inventory" or "inventory" in description or metadata.get("counted_quantity") is not None:
        return "inventory"
    return "stock_operation"


def log_activity(
    *,
    activity_type: str,
    source: str = "api",
    packet=None,
    component=None,
    user=None,
    stock_operation=None,
    description: str | None = None,
    metadata: dict[str, Any] | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    dedupe_seconds: int | None = None,
):
    from nextintranet_warehouse.models.component import WarehouseActivity

    if packet is not None and component is None:
        component = packet.component

    payload = {
        "activity_type": activity_type,
        "source": source,
        "packet": packet,
        "component": component,
        "user": user,
        "stock_operation": stock_operation,
        "description": description,
        "metadata": metadata or {},
        "before": before or {},
        "after": after or {},
    }

    if dedupe_seconds:
        cutoff = timezone.now() - timedelta(seconds=dedupe_seconds)
        duplicate = WarehouseActivity.objects.filter(
            activity_type=activity_type,
            source=source,
            packet=packet,
            component=component,
            user=user,
            description=description,
            metadata=payload["metadata"],
            occurred_at__gte=cutoff,
        ).first()
        if duplicate:
            return duplicate

    return WarehouseActivity.objects.create(**payload)


def log_stock_operation_activity(operation):
    if operation.activities.exists():
        return operation.activities.first()
    metadata = operation.metadata or {}
    before = {"quantity": float(metadata["recorded_quantity"])} if metadata.get("recorded_quantity") is not None else {}
    after = {"quantity": float(metadata["counted_quantity"])} if metadata.get("counted_quantity") is not None else {}
    return log_activity(
        activity_type="stock_operation",
        source=activity_source_for_stock_operation(operation),
        packet=operation.packet,
        component=operation.packet.component if operation.packet_id else None,
        user=operation.author,
        stock_operation=operation,
        description=operation.description or operation.get_operation_type_display(),
        metadata={
            "operation_type": operation.operation_type,
            "quantity": operation.quantity,
            "relative_quantity": operation.relative_quantity,
            "unit_price": float(operation.unit_price) if operation.unit_price is not None else None,
            "reference": str(operation.reference) if operation.reference else None,
            **metadata,
        },
        before=before,
        after=after,
    )
