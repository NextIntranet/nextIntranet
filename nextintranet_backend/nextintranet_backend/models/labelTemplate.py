import uuid

from django.db import models

LABEL_FORMATS = ["single", "a4_2x7", "a4_3x7", "a4_4x10"]


class LabelTemplate(models.Model):
    """
    User-editable label template stored as a JSON element definition.

    The definition uses absolute mm coordinates relative to a design canvas so
    it can be rendered by the backend (fpdf2) and later edited visually
    (drag & drop) without a format migration:

    {
        "version": 1,
        "canvas": {"width_mm": 66.04, "height_mm": 38.1},
        "elements": [
            {"id": "...", "type": "text|barcode|logo|line|rect",
             "x": 0, "y": 0, "w": 10, "h": 5, ...props}
        ]
    }
    """

    LABEL_TYPE_PACKET = "packet"
    LABEL_TYPE_LOCATION = "location"
    LABEL_TYPE_COMPONENT = "component"
    LABEL_TYPE_CHOICES = [
        (LABEL_TYPE_PACKET, "Packet"),
        (LABEL_TYPE_LOCATION, "Location"),
        (LABEL_TYPE_COMPONENT, "Component"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    label_type = models.CharField(max_length=20, choices=LABEL_TYPE_CHOICES)
    enabled = models.BooleanField(default=True)
    # List of format keys this template can be used with, e.g. ["single"]
    # for label printers only or ["a4_2x7", "a4_3x7"] for A4 sheets only.
    supported_formats = models.JSONField(default=list)
    is_default = models.BooleanField(default=False)
    definition = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["label_type", "name"]

    def __str__(self):
        return f"{self.name} ({self.label_type})"

    def supports_format(self, format_type):
        formats = self.supported_formats or []
        return format_type in formats
