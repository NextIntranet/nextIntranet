from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_warehouse', '0032_document_access_level'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='is_primary',
            field=models.BooleanField(default=False, verbose_name='Primary image'),
        ),
    ]
