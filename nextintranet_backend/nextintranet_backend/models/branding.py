import io
import os
import re
import uuid

from django.core.validators import RegexValidator
from django.db import models
from django.utils.timezone import now
from PIL import Image, ImageDraw


def branding_logo_upload_path(instance, filename):
    _, ext = os.path.splitext(filename or "")
    ext = ext or ".png"
    date_path = now().strftime("%Y/%m")
    return f"uploads/branding/{date_path}/{uuid.uuid4()}{ext}"


def branding_pwa_icon_192_upload_path(instance, filename):
    _, ext = os.path.splitext(filename or "")
    ext = ext or ".png"
    date_path = now().strftime("%Y/%m")
    return f"uploads/branding/pwa/192/{date_path}/{uuid.uuid4()}{ext}"


def branding_pwa_icon_512_upload_path(instance, filename):
    _, ext = os.path.splitext(filename or "")
    ext = ext or ".png"
    date_path = now().strftime("%Y/%m")
    return f"uploads/branding/pwa/512/{date_path}/{uuid.uuid4()}{ext}"


def branding_pwa_icon_maskable_upload_path(instance, filename):
    _, ext = os.path.splitext(filename or "")
    ext = ext or ".png"
    date_path = now().strftime("%Y/%m")
    return f"uploads/branding/pwa/maskable/{date_path}/{uuid.uuid4()}{ext}"


HEX_COLOR_VALIDATOR = RegexValidator(
    re.compile(r"^#[0-9A-Fa-f]{6}$"),
    "Enter a valid hex color (e.g. #0f172a).",
)


class BrandingSettings(models.Model):
    """
    Singleton holding organization branding assets (e.g. logo used on labels and PWA).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company_name = models.CharField(
        max_length=100,
        blank=True,
        default="NextIntranet",
        help_text="Full organization name used in the PWA manifest and page titles.",
    )
    company_short_name = models.CharField(
        max_length=20,
        blank=True,
        default="NextIntranet",
        help_text="Short name displayed under the app icon on mobile home screens.",
    )
    theme_color = models.CharField(
        max_length=7,
        blank=True,
        default="#0f172a",
        validators=[HEX_COLOR_VALIDATOR],
    )
    background_color = models.CharField(
        max_length=7,
        blank=True,
        default="#ffffff",
        validators=[HEX_COLOR_VALIDATOR],
    )
    logo = models.FileField(upload_to=branding_logo_upload_path, null=True, blank=True)
    pwa_icon_192 = models.FileField(
        upload_to=branding_pwa_icon_192_upload_path,
        null=True,
        blank=True,
    )
    pwa_icon_512 = models.FileField(
        upload_to=branding_pwa_icon_512_upload_path,
        null=True,
        blank=True,
    )
    pwa_icon_maskable = models.FileField(
        upload_to=branding_pwa_icon_maskable_upload_path,
        null=True,
        blank=True,
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Branding settings"
        verbose_name_plural = "Branding settings"

    def __str__(self):
        return self.company_name or "Branding settings"

    @classmethod
    def get_solo(cls):
        instance = cls.objects.first()
        if instance is None:
            instance = cls.objects.create()
        return instance

    @property
    def logo_url(self):
        return self.logo.url if self.logo else None

    def delete(self, *args, **kwargs):
        self._delete_files()
        return super().delete(*args, **kwargs)

    def _delete_files(self):
        for field_name in ["logo", "pwa_icon_192", "pwa_icon_512", "pwa_icon_maskable"]:
            field = getattr(self, field_name)
            if field:
                field.delete(save=False)

    def generate_pwa_icons(self):
        """Generate PWA icon variants from the uploaded logo."""
        if not self.logo:
            self._clear_pwa_icons()
            return

        try:
            with self.logo.open("rb") as logo_file:
                source_bytes = logo_file.read()
        except (OSError, ValueError):
            return

        with Image.open(io.BytesIO(source_bytes)) as img:
            img = img.convert("RGBA")
            for size, field_name in [(192, "pwa_icon_192"), (512, "pwa_icon_512")]:
                output = io.BytesIO()
                icon = self._build_square_icon(img.copy(), size)
                icon.save(output, format="PNG")
                output.seek(0)
                getattr(self, field_name).save(
                    f"icon-{size}x{size}.png",
                    content=output,
                    save=False,
                )

            # Maskable icon: keep content within 80% safe zone
            output = io.BytesIO()
            maskable = self._build_maskable_icon(img.copy(), 512)
            maskable.save(output, format="PNG")
            output.seek(0)
            self.pwa_icon_maskable.save(
                "icon-maskable-512x512.png",
                content=output,
                save=False,
            )

    def _clear_pwa_icons(self):
        for field_name in ["pwa_icon_192", "pwa_icon_512", "pwa_icon_maskable"]:
            field = getattr(self, field_name)
            if field:
                field.delete(save=False)

    @staticmethod
    def _build_square_icon(source: Image.Image, size: int) -> Image.Image:
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        # Fit the source inside the canvas while preserving aspect ratio.
        source.thumbnail((size, size), Image.Resampling.LANCZOS)
        x = (size - source.width) // 2
        y = (size - source.height) // 2
        canvas.paste(source, (x, y), source)
        return canvas

    @staticmethod
    def _build_maskable_icon(source: Image.Image, size: int) -> Image.Image:
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        safe_zone = int(size * 0.8)
        source.thumbnail((safe_zone, safe_zone), Image.Resampling.LANCZOS)
        x = (size - source.width) // 2
        y = (size - source.height) // 2
        canvas.paste(source, (x, y), source)
        return canvas
