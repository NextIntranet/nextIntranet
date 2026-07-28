# Adds Packet.serial_number (per-component sequential code shown as "S001")
# and backfills existing packets, oldest first, per component.

from django.db import migrations, models


def backfill_packet_serial_numbers(apps, schema_editor):
    Packet = apps.get_model('nextintranet_warehouse', 'Packet')
    component_ids = (
        Packet.objects.filter(serial_number__isnull=True)
        .values_list('component_id', flat=True)
        .distinct()
    )
    for component_id in component_ids:
        highest = (
            Packet.objects.filter(component_id=component_id, serial_number__isnull=False)
            .order_by('-serial_number')
            .values_list('serial_number', flat=True)
            .first()
        ) or 0
        missing = Packet.objects.filter(
            component_id=component_id,
            serial_number__isnull=True,
        ).order_by('date_added', 'id')
        number = highest
        for packet in missing:
            number += 1
            packet.serial_number = number
            packet.save(update_fields=['serial_number'])


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_warehouse', '0063_backfill_stock_operation_activities'),
    ]

    operations = [
        migrations.AddField(
            model_name='packet',
            name='serial_number',
            field=models.PositiveIntegerField(
                blank=True,
                editable=False,
                help_text='Sequential number of the packet within the component (displayed as S001, S002, ...).',
                null=True,
                verbose_name='Serial number',
            ),
        ),
        migrations.AddConstraint(
            model_name='packet',
            constraint=models.UniqueConstraint(
                fields=('component', 'serial_number'),
                name='packet_unique_component_serial',
            ),
        ),
        migrations.RunPython(
            backfill_packet_serial_numbers,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
