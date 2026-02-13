from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("nextintranet_warehouse", "0043_parametertype_units_validation"),
    ]

    operations = [
        migrations.AddField(
            model_name="stocktaking",
            name="target_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="stocktaking",
            name="is_active",
            field=models.BooleanField(default=False),
        ),
    ]
