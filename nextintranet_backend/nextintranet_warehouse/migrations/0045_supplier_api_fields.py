from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("nextintranet_backend", "0005_plugin_instances"),
        ("nextintranet_warehouse", "0044_stocktaking_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="supplier",
            name="api_plugin_instance",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="supplier_api",
                to="nextintranet_backend.plugininstance",
            ),
        ),
        migrations.AddField(
            model_name="supplier",
            name="api_mapping",
            field=models.JSONField(blank=True, default=dict, null=True),
        ),
        migrations.AddField(
            model_name="supplier",
            name="api_last_sync_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="supplierrelation",
            name="api_applied_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="supplierrelation",
            name="api_data_hash",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="supplierrelation",
            name="api_fetched_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
