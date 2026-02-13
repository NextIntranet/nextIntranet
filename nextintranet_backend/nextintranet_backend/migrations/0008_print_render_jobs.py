from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("nextintranet_backend", "0007_print_queue_defaults_and_files"),
    ]

    operations = [
        migrations.AddField(
            model_name="printfile",
            name="kind",
            field=models.CharField(
                choices=[("uploaded", "Uploaded"), ("generated", "Generated")],
                default="uploaded",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="printfile",
            name="expires_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="PrintRenderJob",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("queued", "Queued"),
                            ("processing", "Processing"),
                            ("ready", "Ready"),
                            ("failed", "Failed"),
                        ],
                        default="queued",
                        max_length=20,
                    ),
                ),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("error", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "file",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="render_jobs",
                        to="nextintranet_backend.printfile",
                    ),
                ),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="print_render_jobs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "print_list",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="render_jobs",
                        to="nextintranet_backend.printlist",
                    ),
                ),
                (
                    "items",
                    models.ManyToManyField(
                        blank=True,
                        related_name="render_jobs",
                        to="nextintranet_backend.printitem",
                    ),
                ),
            ],
        ),
    ]
