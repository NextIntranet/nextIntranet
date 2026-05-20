from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_warehouse', '0051_alter_parametertype_value_type'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='supplier',
            name='purchase_export_config',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Per-supplier configuration for purchase export mapping/CSV format.',
                null=True,
                verbose_name='Purchase export config',
            ),
        ),
        migrations.AddField(
            model_name='purchase',
            name='closed_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Closed at'),
        ),
        migrations.AddField(
            model_name='purchase',
            name='completed_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Completed at'),
        ),
        migrations.AddField(
            model_name='purchase',
            name='export_file',
            field=models.FileField(blank=True, null=True, upload_to='purchase_exports/', verbose_name='Export file'),
        ),
        migrations.AddField(
            model_name='purchase',
            name='export_mode',
            field=models.CharField(
                choices=[('list', 'Generic list'), ('supplier_csv', 'Supplier CSV')],
                default='list',
                max_length=20,
                verbose_name='Export mode',
            ),
        ),
        migrations.AddField(
            model_name='purchase',
            name='exported_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Exported at'),
        ),
        migrations.AddField(
            model_name='purchase',
            name='receiving_started_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Receiving started at'),
        ),
        migrations.AddField(
            model_name='purchase',
            name='stocking_started_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Stocking started at'),
        ),
        migrations.AddField(
            model_name='purchasedelivery',
            name='note',
            field=models.TextField(blank=True, default='', verbose_name='Note'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='purchasedelivery',
            name='received_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='purchase_deliveries',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Received by',
            ),
        ),
        migrations.AddField(
            model_name='purchaseitem',
            name='description',
            field=models.TextField(blank=True, default='', verbose_name='Description'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='purchaseitem',
            name='item_type',
            field=models.CharField(
                choices=[('component', 'Component'), ('non_stock', 'Non-stock')],
                default='component',
                max_length=20,
                verbose_name='Item type',
            ),
        ),
        migrations.AddField(
            model_name='purchaseitem',
            name='name',
            field=models.CharField(blank=True, default='', max_length=255, verbose_name='Item name'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='purchaseitem',
            name='requested_quantity',
            field=models.PositiveIntegerField(default=0, verbose_name='Requested quantity'),
        ),
        migrations.AddField(
            model_name='purchaseitem',
            name='stock_location',
            field=models.ForeignKey(
                blank=True,
                limit_choices_to={'can_store_items': True},
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='purchase_items',
                to='nextintranet_warehouse.warehouse',
                verbose_name='Stock location',
            ),
        ),
        migrations.AddField(
            model_name='purchaseitem',
            name='stocked_quantity',
            field=models.PositiveIntegerField(default=0, verbose_name='Stocked quantity'),
        ),
        migrations.AlterField(
            model_name='purchase',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Draft'),
                    ('items_defined', 'Items defined'),
                    ('priced', 'Priced'),
                    ('closed', 'Closed'),
                    ('exported', 'Exported'),
                    ('receiving', 'Receiving'),
                    ('stocking', 'Stocking'),
                    ('completed', 'Completed'),
                ],
                default='draft',
                max_length=20,
                verbose_name='Status',
            ),
        ),
        migrations.AlterField(
            model_name='purchaseitem',
            name='component',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='orders',
                to='nextintranet_warehouse.component',
                verbose_name='Component',
            ),
        ),
        migrations.AlterField(
            model_name='purchaseitem',
            name='package_size',
            field=models.PositiveIntegerField(default=1, verbose_name='Package size'),
        ),
        migrations.AlterField(
            model_name='purchaseitem',
            name='supplier_relation',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='orders',
                to='nextintranet_warehouse.supplierrelation',
                verbose_name='Supplier item',
            ),
        ),
        migrations.AlterField(
            model_name='purchaseitem',
            name='symbol',
            field=models.CharField(blank=True, max_length=100, null=True, verbose_name='Symbol'),
        ),
        migrations.AlterField(
            model_name='purchaseitem',
            name='unit_price_converted',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=12,
                null=True,
                verbose_name='Unit price (converted currency)',
            ),
        ),
        migrations.AlterField(
            model_name='purchaseitem',
            name='unit_price_original',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=12,
                null=True,
                verbose_name='Unit price (original currency)',
            ),
        ),
    ]
