from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("nextintranet_warehouse", "0045_supplier_api_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="supplier",
            name="api_config",
            field=models.JSONField(blank=True, default=dict, null=True),
        ),
    ]
