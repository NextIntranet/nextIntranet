from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_warehouse', '0034_reservation_priority'),
    ]

    operations = [
        migrations.AddField(
            model_name='reservation',
            name='description',
            field=models.TextField(blank=True, verbose_name='Description'),
        ),
    ]
