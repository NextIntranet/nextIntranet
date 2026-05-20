from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_warehouse', '0052_purchase_workflow'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='purchasedelivery',
            name='is_stocked',
            field=models.BooleanField(default=False, verbose_name='Stocked'),
        ),
        migrations.AddField(
            model_name='purchasedelivery',
            name='labels_queued_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Labels queued at'),
        ),
        migrations.AddField(
            model_name='purchasedelivery',
            name='packet',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='purchase_deliveries',
                to='nextintranet_warehouse.packet',
                verbose_name='Packet',
            ),
        ),
        migrations.AddField(
            model_name='purchasedelivery',
            name='stock_location',
            field=models.ForeignKey(
                blank=True,
                limit_choices_to={'can_store_items': True},
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='purchase_deliveries',
                to='nextintranet_warehouse.warehouse',
                verbose_name='Stock location',
            ),
        ),
        migrations.AddField(
            model_name='purchasedelivery',
            name='stocked_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Stocked at'),
        ),
        migrations.AddField(
            model_name='purchasedelivery',
            name='stocked_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='stocked_purchase_deliveries',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Stocked by',
            ),
        ),
    ]
