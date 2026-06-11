import os
import uuid

from django.db import models
from django.utils.timezone import now


def branding_logo_upload_path(instance, filename):
    _, ext = os.path.splitext(filename or "")
    ext = ext or ".png"
    date_path = now().strftime("%Y/%m")
    return f"uploads/branding/{date_path}/{uuid.uuid4()}{ext}"


class BrandingSettings(models.Model):
    """
    Singleton holding organization branding assets (e.g. logo used on labels).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    logo = models.FileField(upload_to=branding_logo_upload_path, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Branding settings"
        verbose_name_plural = "Branding settings"

    def __str__(self):
        return "Branding settings"

    @classmethod
    def get_solo(cls):
        instance = cls.objects.first()
        if instance is None:
            instance = cls.objects.create()
        return instance

    @property
    def logo_url(self):
        return self.logo.url if self.logo else None
