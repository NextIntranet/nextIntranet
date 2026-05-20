# Generated for API mapping: extracted price and availability on supplier relation

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("nextintranet_warehouse", "0055_resource_access_log"),
    ]

    operations = [
        migrations.AddField(
            model_name="supplierrelation",
            name="api_price",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                max_digits=14,
                null=True,
                verbose_name="API price",
                help_text="Price from supplier API (e.g. unit price at min quantity).",
            ),
        ),
        migrations.AddField(
            model_name="supplierrelation",
            name="api_availability",
            field=models.CharField(
                blank=True,
                max_length=255,
                null=True,
                verbose_name="API availability",
                help_text="Availability or stock info from supplier API (e.g. 'In Stock', '94 Dny').",
            ),
        ),
    ]
