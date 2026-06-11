"""
Helpers for resolving label templates and the branding logo for a render run.

Used by both the async render task and the synchronous print API so the
template/logo behaviour stays identical.
"""

import os
import tempfile
import uuid as uuid_module

from nextintranet_backend.labels.template import TemplateLabelGenerator
from nextintranet_backend.models.branding import BrandingSettings
from nextintranet_backend.models.labelTemplate import LabelTemplate


def prepare_logo_file(color_mode="color"):
    """
    Download the branding logo into a temp file usable by fpdf2.
    Returns the temp file path or None when no logo is configured.
    """
    branding = BrandingSettings.objects.first()
    if not branding or not branding.logo:
        return None

    _, ext = os.path.splitext(branding.logo.name or "")
    ext = ext.lower() if ext.lower() in {".png", ".jpg", ".jpeg"} else ".png"
    tmp_path = os.path.join(tempfile.gettempdir(), f"branding_logo_{uuid_module.uuid4().hex}{ext}")
    try:
        with branding.logo.open("rb") as source:
            content = source.read()
        with open(tmp_path, "wb") as target:
            target.write(content)
        if color_mode != "color":
            from PIL import Image

            image = Image.open(tmp_path)
            if image.mode in ("RGBA", "LA", "P"):
                image = image.convert("RGBA")
                background = Image.new("RGBA", image.size, (255, 255, 255, 255))
                background.alpha_composite(image)
                image = background.convert("RGB")
            image = image.convert("L")
            tmp_gray = os.path.join(
                tempfile.gettempdir(), f"branding_logo_{uuid_module.uuid4().hex}.png"
            )
            image.save(tmp_gray, format="PNG")
            os.remove(tmp_path)
            return tmp_gray
        return tmp_path
    except Exception as exc:
        print(f"prepare_logo_file: Failed to prepare logo: {exc}")
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        return None


def cleanup_logo_file(logo_path):
    if not logo_path:
        return
    try:
        os.remove(logo_path)
    except OSError:
        pass


def resolve_template_overrides(format_type, payload, logo_path=None):
    """
    Build a map of {label_type: TemplateLabelGenerator} for a render run.

    When payload contains template_id, that template is used for its label
    type and must support the requested format (ValueError otherwise). All
    other label types fall back to their default template for the format, or
    to the built-in hardcoded generators when no template matches.
    """
    payload = payload or {}
    color_mode = payload.get("color_mode", "color")
    show_logo = payload.get("show_logo")
    show_logo = True if show_logo is None else bool(show_logo)

    overrides = {}
    explicit_type = None

    template_id = payload.get("template_id")
    if template_id:
        template = LabelTemplate.objects.filter(id=template_id).first()
        if not template:
            raise ValueError("Label template not found.")
        if not template.enabled:
            raise ValueError(f"Label template '{template.name}' is disabled.")
        if not template.supports_format(format_type):
            raise ValueError(
                f"Label template '{template.name}' does not support format '{format_type}'."
            )
        explicit_type = template.label_type
        overrides[template.label_type] = TemplateLabelGenerator(
            template.label_type,
            template.definition,
            color_mode=color_mode,
            logo_path=logo_path,
            show_logo=show_logo,
        )

    defaults = LabelTemplate.objects.filter(enabled=True, is_default=True)
    for template in defaults:
        if template.label_type == explicit_type:
            continue
        if not template.supports_format(format_type):
            continue
        overrides[template.label_type] = TemplateLabelGenerator(
            template.label_type,
            template.definition,
            color_mode=color_mode,
            logo_path=logo_path,
            show_logo=show_logo,
        )

    return overrides
