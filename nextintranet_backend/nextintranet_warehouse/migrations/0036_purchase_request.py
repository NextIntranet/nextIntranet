from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_warehouse', '0035_reservation_description'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PurchaseRequest',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('quantity', models.PositiveIntegerField(default=1, verbose_name='Quantity')),
                ('description', models.TextField(blank=True, verbose_name='Description')),
                ('component', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='purchase_requests', to='nextintranet_warehouse.component', verbose_name='Component')),
                ('purchase', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='requests', to='nextintranet_warehouse.purchase', verbose_name='Purchase')),
                ('requested_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='purchase_requests', to=settings.AUTH_USER_MODEL, verbose_name='Requested by')),
            ],
            options={
                'verbose_name': 'Purchase request',
                'verbose_name_plural': 'Purchase requests',
                'ordering': ['-created_at'],
            },
        ),
    ]
