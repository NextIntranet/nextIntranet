from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_warehouse', '0036_purchase_request'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchase',
            name='invoice',
            field=models.FileField(blank=True, null=True, upload_to='purchase_invoices/', verbose_name='Invoice'),
        ),
        migrations.AddField(
            model_name='purchaseitem',
            name='description',
            field=models.TextField(blank=True, verbose_name='Description'),
        ),
        migrations.AddField(
            model_name='purchaseitem',
            name='is_manual',
            field=models.BooleanField(default=False, verbose_name='Manual item'),
        ),
        migrations.AddField(
            model_name='purchaseitem',
            name='name',
            field=models.CharField(blank=True, max_length=255, verbose_name='Item name'),
        ),
        migrations.AlterField(
            model_name='purchaseitem',
            name='component',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='orders', to='nextintranet_warehouse.component', verbose_name='Component'),
        ),
        migrations.AlterField(
            model_name='purchaseitem',
            name='supplier_relation',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='orders', to='nextintranet_warehouse.supplierrelation', verbose_name='Supplier item'),
        ),
        migrations.AlterField(
            model_name='purchaseitem',
            name='symbol',
            field=models.CharField(blank=True, max_length=100, null=True, verbose_name='Symbol'),
        ),
    ]
