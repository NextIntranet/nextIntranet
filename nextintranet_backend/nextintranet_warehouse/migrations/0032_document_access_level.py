from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_warehouse', '0031_alter_stockoperation_reference'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='access_level',
            field=models.CharField(choices=[('public', 'Public'), ('signed', 'Signed (temporary)')], default='public', max_length=20, verbose_name='Access level'),
        ),
    ]
