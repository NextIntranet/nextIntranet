from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("nextintranet_backend", "0006_printitem_queue_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="printlist",
            name="is_default",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="PrintFile",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("file", models.FileField(upload_to="print_queue/")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="print_files",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
    ]
