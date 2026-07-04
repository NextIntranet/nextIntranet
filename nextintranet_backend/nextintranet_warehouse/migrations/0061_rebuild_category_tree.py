from django.db import migrations


def forwards(apps, schema_editor):
    # Category.full_path relies on MPTT's get_ancestors(), which reads the
    # denormalized lft/rght/tree_id fields rather than parent_id. Those fields
    # have drifted out of sync with parent_id (likely from past direct writes
    # that bypassed MPTTModel.save()/move_to()), producing full_path values
    # that splice in ancestors from unrelated branches. rebuild() recomputes
    # lft/rght/tree_id/level from the existing parent_id links without
    # changing parent_id itself.
    from nextintranet_warehouse.models.category import Category

    Category.objects.rebuild()


def backwards(apps, schema_editor):
    # Rebuilding only recomputes derived tree bookkeeping from parent_id;
    # there is no parent_id change to reverse.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_warehouse', '0060_packetrecalcjob'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
