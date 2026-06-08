from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('nextintranet_production', '0005_manufacturing_bom'),
    ]

    operations = [
        migrations.AddField(
            model_name='template',
            name='series_kind',
            field=models.CharField(
                choices=[('template', 'Template'), ('working', 'Working')],
                default='working',
                help_text='Template series holds imported netlist reference; working series is used for production.',
                max_length=20,
                verbose_name='Series kind',
            ),
        ),
        migrations.AddField(
            model_name='template',
            name='source_template',
            field=models.ForeignKey(
                blank=True,
                help_text='Template series this working copy was created from.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='working_copies',
                to='nextintranet_production.template',
                verbose_name='Source template',
            ),
        ),
    ]
