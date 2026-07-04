# Generated manually for warehouse packet/component activity logging.

import uuid

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("nextintranet_warehouse", "0061_rebuild_category_tree"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="WarehouseActivity",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("occurred_at", models.DateTimeField(default=django.utils.timezone.now, verbose_name="Occurred at")),
                (
                    "activity_type",
                    models.CharField(
                        choices=[
                            ("scan", "Scan"),
                            ("stock_operation", "Stock operation"),
                            ("packet_created", "Packet created"),
                            ("packet_updated", "Packet updated"),
                            ("packet_moved", "Packet moved"),
                            ("packet_status_changed", "Packet status changed"),
                            ("component_created", "Component created"),
                            ("component_updated", "Component updated"),
                            ("identifier_added", "Identifier added"),
                            ("identifier_removed", "Identifier removed"),
                        ],
                        max_length=50,
                        verbose_name="Activity type",
                    ),
                ),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("api", "API"),
                            ("scanner", "Scanner"),
                            ("inventory", "Inventory"),
                            ("production", "Production"),
                            ("stock_operation", "Stock operation"),
                            ("system", "System"),
                        ],
                        default="api",
                        max_length=50,
                        verbose_name="Source",
                    ),
                ),
                ("description", models.TextField(blank=True, null=True, verbose_name="Description")),
                ("metadata", models.JSONField(blank=True, default=dict, null=True, verbose_name="Metadata")),
                ("before", models.JSONField(blank=True, default=dict, null=True, verbose_name="Before")),
                ("after", models.JSONField(blank=True, default=dict, null=True, verbose_name="After")),
                (
                    "component",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="activities",
                        to="nextintranet_warehouse.component",
                        verbose_name="Component",
                    ),
                ),
                (
                    "packet",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="activities",
                        to="nextintranet_warehouse.packet",
                        verbose_name="Packet",
                    ),
                ),
                (
                    "stock_operation",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="activities",
                        to="nextintranet_warehouse.stockoperation",
                        verbose_name="Stock operation",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="warehouse_activities",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="User",
                    ),
                ),
            ],
            options={
                "verbose_name": "Warehouse activity",
                "verbose_name_plural": "Warehouse activities",
                "ordering": ["-occurred_at", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="warehouseactivity",
            index=models.Index(fields=["packet", "-occurred_at"], name="wh_act_packet_time_idx"),
        ),
        migrations.AddIndex(
            model_name="warehouseactivity",
            index=models.Index(fields=["component", "-occurred_at"], name="wh_act_component_time_idx"),
        ),
        migrations.AddIndex(
            model_name="warehouseactivity",
            index=models.Index(fields=["user", "-occurred_at"], name="wh_act_user_time_idx"),
        ),
        migrations.AddIndex(
            model_name="warehouseactivity",
            index=models.Index(fields=["activity_type", "-occurred_at"], name="wh_act_type_time_idx"),
        ),
        migrations.AddIndex(
            model_name="warehouseactivity",
            index=models.Index(fields=["source", "-occurred_at"], name="wh_act_source_time_idx"),
        ),
        migrations.AddIndex(
            model_name="warehouseactivity",
            index=models.Index(fields=["stock_operation"], name="wh_act_stock_op_idx"),
        ),
    ]
