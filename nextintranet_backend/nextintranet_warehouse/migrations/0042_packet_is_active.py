from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("nextintranet_warehouse", "0041_warehouse_map"),
    ]

    operations = [
        migrations.AddField(
            model_name="packet",
            name="is_active",
            field=models.BooleanField(default=True, verbose_name="Is active"),
        ),
    ]
