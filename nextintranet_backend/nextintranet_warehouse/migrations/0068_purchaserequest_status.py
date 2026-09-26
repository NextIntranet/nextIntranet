from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_warehouse', '0067_stockoperation_stockop_time_idx'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchaserequest',
            name='status',
            field=models.CharField(choices=[('open', 'Open'), ('ordered', 'Ordered')], default='open', max_length=20, verbose_name='Status'),
        ),
    ]
