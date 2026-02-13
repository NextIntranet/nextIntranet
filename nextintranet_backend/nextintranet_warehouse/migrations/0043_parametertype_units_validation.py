from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("nextintranet_warehouse", "0042_packet_is_active"),
    ]

    operations = [
        migrations.AddField(
            model_name="parametertype",
            name="unit",
            field=models.CharField(blank=True, max_length=50, null=True, verbose_name="Unit"),
        ),
        migrations.AddField(
            model_name="parametertype",
            name="value_type",
            field=models.CharField(
                choices=[("text", "Text"), ("number", "Number")],
                default="text",
                max_length=10,
                verbose_name="Value type",
            ),
        ),
        migrations.AddField(
            model_name="parametertype",
            name="validation_min",
            field=models.FloatField(blank=True, null=True, verbose_name="Validation min"),
        ),
        migrations.AddField(
            model_name="parametertype",
            name="validation_max",
            field=models.FloatField(blank=True, null=True, verbose_name="Validation max"),
        ),
        migrations.AddField(
            model_name="parametertype",
            name="validation_regex",
            field=models.CharField(
                blank=True, max_length=255, null=True, verbose_name="Validation regex"
            ),
        ),
        migrations.AddField(
            model_name="parametertype",
            name="validation_values",
            field=models.TextField(blank=True, null=True, verbose_name="Validation values"),
        ),
    ]
