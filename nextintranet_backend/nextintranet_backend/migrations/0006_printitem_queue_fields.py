from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("nextintranet_backend", "0005_plugin_instances"),
    ]

    operations = [
        migrations.AddField(
            model_name="printitem",
            name="kind",
            field=models.CharField(
                choices=[("label", "Label"), ("document", "Document")],
                default="label",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="printitem",
            name="status",
            field=models.CharField(
                choices=[
                    ("queued", "Queued"),
                    ("printing", "Printing"),
                    ("printed", "Printed"),
                    ("failed", "Failed"),
                ],
                default="queued",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="printitem",
            name="payload",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="printitem",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True),
        ),
        migrations.AddField(
            model_name="printitem",
            name="printed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
