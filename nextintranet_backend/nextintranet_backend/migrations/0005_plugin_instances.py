from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
        ("nextintranet_backend", "0004_useraccesspermission_guest"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PluginInstance",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("definition_key", models.CharField(max_length=150)),
                ("name", models.CharField(max_length=255)),
                ("enabled", models.BooleanField(default=True)),
                ("config", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_plugin_instances",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="PluginInstanceRole",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("instance", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="nextintranet_backend.plugininstance")),
                ("role", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="auth.group")),
            ],
            options={
                "unique_together": {("instance", "role")},
            },
        ),
        migrations.AddField(
            model_name="plugininstance",
            name="roles",
            field=models.ManyToManyField(
                blank=True,
                related_name="plugin_instances",
                through="nextintranet_backend.PluginInstanceRole",
                to="auth.group",
            ),
        ),
    ]
