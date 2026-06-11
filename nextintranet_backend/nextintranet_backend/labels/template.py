"""
Template-driven label content generator.

Renders a JSON template definition (see LabelTemplate model) onto a label
using fpdf2. Element coordinates are mm relative to the template's design
canvas and are scaled to the actual label size at render time, so the same
template works across formats with slightly different label dimensions.
"""

import os
import re
import tempfile
import uuid as uuid_module

import treepoem
from django.utils import timezone

from nextintranet_backend.labels.base import LabelContentGenerator, DEFAULT_FONT_FAMILY

BARCODE_BASE_URL = "https://ni.ust.cz"

PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z0-9_.]+)\}")


def now_context():
    """{now.*} placeholders with the label generation timestamp."""
    now = timezone.localtime()
    return {
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M"),
        "datetime": now.strftime("%Y-%m-%d %H:%M"),
    }


def format_count(value):
    """Format a Decimal stock count without trailing zeros (100.00 -> 100)."""
    if value is None:
        return ""
    text = str(value)
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def build_label_context(label_type, data):
    """Build the variable context for a label from its render data."""
    if data and data.get("sample"):
        context = sample_label_context(label_type)
    elif label_type == "packet":
        from nextintranet_warehouse.models.component import Packet

        packet_id = data.get("uuid")
        packet = Packet.objects.filter(id=packet_id).first()
        component = packet.component if packet else None
        location = packet.location.full_path if packet and packet.location else ""
        component_id = component.id if component else ""
        context = {
            "packet": {
                "uuid": str(packet_id or ""),
                "uuid_short": str(packet_id or "")[:8],
                "location": location,
                "count": format_count(packet.count) if packet else "",
                "barcode_url": f"{BARCODE_BASE_URL}/?packet={packet_id}&component={component_id}",
            },
            "component": {
                "name": component.name if component else "",
                "description": component.description if component else "",
                "id": str(component_id),
            },
        }
    elif label_type == "location":
        context = {
            "location": {
                "building": data.get("building", ""),
                "room": data.get("room", ""),
                "full_path": data.get("full_path")
                or "/".join(filter(None, [data.get("building", ""), data.get("room", "")])),
            }
        }
    elif label_type == "component":
        context = {
            "component": {
                "type": data.get("type", ""),
                "serial": data.get("serial", ""),
            }
        }
    else:
        context = {}

    context["now"] = now_context()
    return context


def sample_label_context(label_type):
    """Sample context used for template previews in the editor."""
    sample_uuid = "0f47c1de-1234-4abc-9def-0123456789ab"
    if label_type == "packet":
        return {
            "packet": {
                "uuid": sample_uuid,
                "uuid_short": sample_uuid[:8],
                "location": "Building A/Room 12/Shelf 3",
                "count": "100",
                "barcode_url": f"{BARCODE_BASE_URL}/?packet={sample_uuid}&component=42",
            },
            "component": {
                "name": "Resistor 10k 0805 1%",
                "description": "Thick film chip resistor, 0805, 10 kOhm, 1%, 125 mW",
                "id": "42",
            },
        }
    if label_type == "location":
        return {
            "location": {
                "building": "Building A",
                "room": "Room 12",
                "full_path": "Building A/Room 12",
            }
        }
    if label_type == "component":
        return {
            "component": {
                "type": "Resistor 10k 0805",
                "serial": sample_uuid[:8],
            }
        }
    return {}


def resolve_placeholders(text, context):
    """Replace {a.b} placeholders with values from a nested context dict."""

    def replace(match):
        path = match.group(1)
        value = context
        for part in path.split("."):
            if isinstance(value, dict) and part in value:
                value = value[part]
            else:
                return ""
        return str(value)

    return PLACEHOLDER_RE.sub(replace, text or "")


class TemplateLabelGenerator(LabelContentGenerator):
    """Renders a JSON label template definition for a single label type."""

    def __init__(self, label_type, definition, color_mode="color", logo_path=None, show_logo=True):
        super().__init__(color_mode)
        self.label_type = label_type
        self.definition = definition or {}
        self.logo_path = logo_path
        self.show_logo = show_logo

    def generate_label_content(self, pdf, data, label_width=None, label_height=None,
                               x_position=None, y_position=None):
        x0 = x_position if x_position is not None else 0
        y0 = y_position if y_position is not None else 0
        label_width = label_width if label_width is not None else pdf.w
        label_height = label_height if label_height is not None else pdf.h

        canvas = self.definition.get("canvas") or {}
        canvas_w = float(canvas.get("width_mm") or label_width)
        canvas_h = float(canvas.get("height_mm") or label_height)
        scale_x = label_width / canvas_w if canvas_w else 1
        scale_y = label_height / canvas_h if canvas_h else 1

        context = build_label_context(self.label_type, data or {})

        for element in self.definition.get("elements") or []:
            el_type = element.get("type")
            x = x0 + float(element.get("x", 0)) * scale_x
            y = y0 + float(element.get("y", 0)) * scale_y
            w = float(element.get("w", 0)) * scale_x
            h = float(element.get("h", 0)) * scale_y
            try:
                if el_type == "text":
                    self._render_text(pdf, element, context, x, y, w, h)
                elif el_type == "barcode":
                    self._render_barcode(pdf, element, context, x, y, w, h)
                elif el_type == "logo":
                    self._render_logo(pdf, x, y, w, h)
                elif el_type == "line":
                    self._render_line(pdf, element, x, y, w, h)
                elif el_type == "rect":
                    self._render_rect(pdf, element, x, y, w, h)
            except Exception as exc:
                print(f"TemplateLabelGenerator: Failed to render element {element.get('id')}: {exc}")

    def _color(self, element, default=(0, 0, 0)):
        color = element.get("color")
        if (
            not isinstance(color, (list, tuple))
            or len(color) != 3
            or self.color_mode != "color"
        ):
            if self.color_mode != "color":
                return (0, 0, 0)
            return default
        return tuple(int(c) for c in color)

    def _render_text(self, pdf, element, context, x, y, w, h):
        content = resolve_placeholders(element.get("content", ""), context)
        if not content:
            return
        font_size = float(element.get("font_size", 10))
        style = "B" if element.get("bold") else ""
        align = element.get("align", "L")
        max_chars = element.get("max_chars")
        if isinstance(max_chars, (int, float)) and max_chars > 0:
            max_chars = int(max_chars)
            if len(content) > max_chars:
                content = content[:max_chars] + "..."

        pdf.set_text_color(*self._color(element))
        pdf.set_font(DEFAULT_FONT_FAMILY, style, font_size)

        if element.get("fit"):
            # Shrink the font until the text fits the element width.
            while font_size > 3 and pdf.get_string_width(content) > w:
                font_size -= 0.5
                pdf.set_font(DEFAULT_FONT_FAMILY, style, font_size)

        pdf.set_xy(x, y)
        if element.get("multiline"):
            line_height = float(element.get("line_height", font_size * 0.45))
            pdf.multi_cell(w, line_height, content, align=align)
        else:
            pdf.cell(w, h or font_size * 0.5, content, 0, 0, align)

    def _render_barcode(self, pdf, element, context, x, y, w, h):
        content = resolve_placeholders(element.get("content", ""), context)
        if not content:
            return
        barcode_type = element.get("barcode_type", "datamatrix")
        image = treepoem.generate_barcode(barcode_type=barcode_type, data=content).convert("1")
        tmp_path = os.path.join(
            tempfile.gettempdir(), f"label_barcode_{uuid_module.uuid4().hex}.png"
        )
        try:
            image.save(tmp_path, format="PNG")
            size = min(w, h) or max(w, h)
            pdf.image(tmp_path, x=x, y=y, w=size, h=size, type="PNG")
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    def _render_logo(self, pdf, x, y, w, h):
        if not self.show_logo or not self.logo_path:
            return
        # Pass only the dominant dimension so fpdf keeps the aspect ratio.
        if w and h:
            pdf.image(self.logo_path, x=x, y=y, w=w, h=h)
        elif w:
            pdf.image(self.logo_path, x=x, y=y, w=w)
        else:
            pdf.image(self.logo_path, x=x, y=y, h=h)

    def _render_line(self, pdf, element, x, y, w, h):
        pdf.set_draw_color(*self._color(element, default=(100, 100, 100)))
        pdf.set_line_width(float(element.get("line_width", 0.3)))
        pdf.line(x, y, x + w, y + h)

    def _render_rect(self, pdf, element, x, y, w, h):
        pdf.set_draw_color(*self._color(element, default=(100, 100, 100)))
        pdf.set_line_width(float(element.get("line_width", 0.3)))
        style = "F" if element.get("fill") else "D"
        if style == "F":
            pdf.set_fill_color(*self._color(element, default=(245, 245, 245)))
        pdf.rect(x, y, w, h, style=style)


def validate_template_definition(definition):
    """
    Validate a template definition, returning a list of human-readable errors.
    """
    errors = []
    if not isinstance(definition, dict):
        return ["Definition must be a JSON object."]

    canvas = definition.get("canvas")
    if not isinstance(canvas, dict):
        errors.append("Missing 'canvas' object with width_mm and height_mm.")
    else:
        for key in ("width_mm", "height_mm"):
            value = canvas.get(key)
            if not isinstance(value, (int, float)) or value <= 0:
                errors.append(f"'canvas.{key}' must be a positive number.")

    elements = definition.get("elements")
    if not isinstance(elements, list):
        errors.append("'elements' must be an array.")
        return errors

    valid_types = {"text", "barcode", "logo", "line", "rect"}
    for index, element in enumerate(elements):
        label = f"elements[{index}]"
        if not isinstance(element, dict):
            errors.append(f"{label} must be an object.")
            continue
        el_type = element.get("type")
        if el_type not in valid_types:
            errors.append(f"{label}.type must be one of {sorted(valid_types)}.")
        for key in ("x", "y", "w", "h"):
            value = element.get(key, 0)
            if not isinstance(value, (int, float)):
                errors.append(f"{label}.{key} must be a number.")
        if el_type == "text" and not isinstance(element.get("content", ""), str):
            errors.append(f"{label}.content must be a string.")
        if el_type == "barcode" and not element.get("content"):
            errors.append(f"{label}.content is required for barcode elements.")
    return errors
