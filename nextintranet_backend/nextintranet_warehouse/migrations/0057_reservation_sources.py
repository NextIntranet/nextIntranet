# Add structured source references for reservations (e.g. production BOM)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("nextintranet_warehouse", "0056_supplierrelation_api_price_availability"),
    ]

    operations = [
        migrations.AddField(
            model_name="reservation",
            name="sources",
            field=models.JSONField(
                default=list,
                blank=True,
                verbose_name="Sources",
                help_text="Structured list of reservation origins, e.g. [{\"type\": \"production\", \"bom_id\": \"...\", \"line_id\": \"...\"}].",
            ),
        ),
    ]
