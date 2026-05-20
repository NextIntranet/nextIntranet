# Generated manually for resource access logging

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contenttypes", "0002_remove_content_type_name"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("nextintranet_warehouse", "0054_identifier_external_scheme_object_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="ResourceAccessLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("object_id", models.UUIDField(db_index=True)),
                ("accessed_at", models.DateTimeField(auto_now_add=True)),
                (
                    "content_type",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="contenttypes.contenttype",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={
                "ordering": ["-accessed_at"],
                "verbose_name": "Resource access log",
                "verbose_name_plural": "Resource access logs",
            },
        ),
        migrations.AddIndex(
            model_name="resourceaccesslog",
            index=models.Index(
                fields=["content_type", "object_id", "-accessed_at"],
                name="nextintrane_content_8c0b0d_idx",
            ),
        ),
    ]
