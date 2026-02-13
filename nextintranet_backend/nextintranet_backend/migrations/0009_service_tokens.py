from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("nextintranet_backend", "0008_print_render_jobs"),
    ]

    operations = [
        migrations.CreateModel(
            name="ServiceToken",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("token_prefix", models.CharField(max_length=16, unique=True)),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("scopes", models.JSONField(blank=True, default=list)),
                ("is_active", models.BooleanField(default=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_service_tokens",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "allowed_print_lists",
                    models.ManyToManyField(
                        blank=True,
                        related_name="service_tokens",
                        to="nextintranet_backend.printlist",
                    ),
                ),
            ],
        ),
    ]
