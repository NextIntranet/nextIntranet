from django.db import migrations


def _activity_source(operation):
    metadata = operation.metadata or {}
    description = (operation.description or "").lower()
    if metadata.get("production_id"):
        return "production"
    if (
        operation.operation_type == "inventory"
        or "inventory" in description
        or metadata.get("counted_quantity") is not None
    ):
        return "inventory"
    return "stock_operation"


def backfill_stock_operation_activities(apps, schema_editor):
    StockOperation = apps.get_model("nextintranet_warehouse", "StockOperation")
    WarehouseActivity = apps.get_model("nextintranet_warehouse", "WarehouseActivity")

    existing_operation_ids = set(
        WarehouseActivity.objects.filter(stock_operation__isnull=False)
        .values_list("stock_operation_id", flat=True)
    )

    operation_labels = dict(StockOperation.OPERATION_TYPE)
    operations = (
        StockOperation.objects.exclude(id__in=existing_operation_ids)
        .select_related("packet__component", "author")
        .order_by("timestamp", "id")
    )

    batch = []
    for operation in operations.iterator(chunk_size=1000):
        packet = operation.packet
        metadata = operation.metadata or {}
        before = {}
        after = {}
        if metadata.get("recorded_quantity") is not None:
            before["quantity"] = float(metadata["recorded_quantity"])
        if metadata.get("counted_quantity") is not None:
            after["quantity"] = float(metadata["counted_quantity"])

        activity_metadata = {
            "operation_type": operation.operation_type,
            "quantity": operation.quantity,
            "relative_quantity": operation.relative_quantity,
            "unit_price": operation.unit_price,
            "reference": str(operation.reference) if operation.reference else None,
            **metadata,
        }

        batch.append(
            WarehouseActivity(
                packet=packet,
                component=packet.component if packet else None,
                user=operation.author,
                occurred_at=operation.timestamp,
                activity_type="stock_operation",
                source=_activity_source(operation),
                stock_operation=operation,
                description=operation.description or operation_labels.get(operation.operation_type, operation.operation_type),
                metadata=activity_metadata,
                before=before,
                after=after,
                created_at=operation.created_at,
            )
        )
        if len(batch) >= 1000:
            WarehouseActivity.objects.bulk_create(batch, batch_size=1000)
            batch = []

    if batch:
        WarehouseActivity.objects.bulk_create(batch, batch_size=1000)


class Migration(migrations.Migration):
    dependencies = [
        ("nextintranet_warehouse", "0062_warehouseactivity"),
    ]

    operations = [
        migrations.RunPython(backfill_stock_operation_activities, migrations.RunPython.noop),
    ]
