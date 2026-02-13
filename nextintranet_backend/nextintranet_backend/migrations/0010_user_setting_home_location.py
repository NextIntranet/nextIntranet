from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("nextintranet_backend", "0009_service_tokens"),
        ("nextintranet_warehouse", "0044_stocktaking_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="usersetting",
            name="home_location",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="home_location_users",
                to="nextintranet_warehouse.warehouse",
            ),
        ),
    ]
