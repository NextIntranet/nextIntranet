from django.db import migrations, models
import django.core.validators
import nextintranet_warehouse.models.warehouse


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_warehouse', '0040_purchaserequest_item_name_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='warehouse',
            name='map',
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=nextintranet_warehouse.models.warehouse.location_map_upload_path,
                validators=[django.core.validators.FileExtensionValidator(['svg'])],
                verbose_name='Map',
            ),
        ),
    ]
