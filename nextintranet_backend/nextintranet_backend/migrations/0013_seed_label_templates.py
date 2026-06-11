from django.db import migrations

ALL_FORMATS = ["single", "a4_2x7", "a4_3x7", "a4_4x10"]
SHEET_FORMATS = ["a4_2x7", "a4_3x7", "a4_4x10"]


def packet_standard_definition():
    return {
        "version": 1,
        "canvas": {"width_mm": 66.04, "height_mm": 38.1},
        "elements": [
            {
                "id": "header",
                "type": "text",
                "x": 2, "y": 1, "w": 31, "h": 4.5,
                "content": "Packet",
                "font_size": 6,
                "color": [100, 100, 100],
            },
            {
                "id": "uuid",
                "type": "text",
                "x": 33, "y": 1, "w": 31, "h": 4.5,
                "content": "ID: {packet.uuid_short}",
                "font_size": 6,
                "align": "R",
                "color": [100, 100, 100],
            },
            {
                "id": "name",
                "type": "text",
                "x": 2, "y": 4.5, "w": 62, "h": 4.6,
                "content": "{component.name}",
                "font_size": 12,
                "bold": True,
                "fit": True,
                "max_chars": 43,
            },
            {
                "id": "divider",
                "type": "line",
                "x": 1, "y": 9.1, "w": 64, "h": 0,
                "line_width": 0.3,
                "color": [100, 100, 100],
            },
            {
                "id": "location",
                "type": "text",
                "x": 2, "y": 10, "w": 62, "h": 3,
                "content": "{packet.location}",
                "font_size": 9,
                "bold": True,
                "color": [80, 80, 80],
            },
            {
                "id": "description",
                "type": "text",
                "x": 2, "y": 14.6, "w": 38, "h": 20,
                "content": "{component.description}",
                "font_size": 7,
                "multiline": True,
                "line_height": 2.7,
                "max_chars": 110,
            },
            {
                "id": "barcode",
                "type": "barcode",
                "x": 43, "y": 15, "w": 19, "h": 19,
                "barcode_type": "datamatrix",
                "content": "{packet.barcode_url}",
            },
        ],
    }


def packet_sheet_logo_definition():
    definition = packet_standard_definition()
    # Make room for the logo in the header row.
    for element in definition["elements"]:
        if element["id"] == "uuid":
            element["x"] = 24
            element["w"] = 22
    definition["elements"].append(
        {"id": "logo", "type": "logo", "x": 48, "y": 0.8, "w": 16, "h": 4.2}
    )
    return definition


def location_standard_definition():
    return {
        "version": 1,
        "canvas": {"width_mm": 66.04, "height_mm": 38.1},
        "elements": [
            {
                "id": "title",
                "type": "text",
                "x": 2, "y": 2, "w": 62, "h": 10,
                "content": "LOCATION",
                "font_size": 12,
                "bold": True,
                "align": "C",
            },
            {
                "id": "divider",
                "type": "line",
                "x": 1, "y": 12, "w": 64, "h": 0,
                "line_width": 0.3,
                "color": [100, 100, 100],
            },
            {
                "id": "building",
                "type": "text",
                "x": 2, "y": 15, "w": 62, "h": 10,
                "content": "Building: {location.building}",
                "font_size": 10,
            },
            {
                "id": "room",
                "type": "text",
                "x": 2, "y": 25, "w": 62, "h": 10,
                "content": "Room: {location.room}",
                "font_size": 10,
            },
        ],
    }


def component_standard_definition():
    return {
        "version": 1,
        "canvas": {"width_mm": 66.04, "height_mm": 38.1},
        "elements": [
            {
                "id": "title",
                "type": "text",
                "x": 2, "y": 2, "w": 62, "h": 10,
                "content": "COMPONENT",
                "font_size": 12,
                "bold": True,
                "align": "C",
            },
            {
                "id": "divider",
                "type": "line",
                "x": 1, "y": 12, "w": 64, "h": 0,
                "line_width": 0.3,
                "color": [100, 100, 100],
            },
            {
                "id": "type",
                "type": "text",
                "x": 2, "y": 15, "w": 62, "h": 10,
                "content": "Type: {component.type}",
                "font_size": 10,
            },
            {
                "id": "serial",
                "type": "text",
                "x": 2, "y": 25, "w": 62, "h": 10,
                "content": "Serial: {component.serial}",
                "font_size": 10,
            },
        ],
    }


SEED_TEMPLATES = [
    {
        "name": "Packet - Standard",
        "label_type": "packet",
        "supported_formats": ALL_FORMATS,
        "is_default": True,
        "definition": packet_standard_definition(),
    },
    {
        "name": "Packet - A4 sheet with logo",
        "label_type": "packet",
        "supported_formats": SHEET_FORMATS,
        "is_default": False,
        "definition": packet_sheet_logo_definition(),
    },
    {
        "name": "Location - Standard",
        "label_type": "location",
        "supported_formats": ALL_FORMATS,
        "is_default": True,
        "definition": location_standard_definition(),
    },
    {
        "name": "Component - Standard",
        "label_type": "component",
        "supported_formats": ALL_FORMATS,
        "is_default": True,
        "definition": component_standard_definition(),
    },
]


def seed_templates(apps, schema_editor):
    LabelTemplate = apps.get_model("nextintranet_backend", "LabelTemplate")
    for template in SEED_TEMPLATES:
        LabelTemplate.objects.get_or_create(
            name=template["name"],
            label_type=template["label_type"],
            defaults={
                "supported_formats": template["supported_formats"],
                "is_default": template["is_default"],
                "definition": template["definition"],
                "enabled": True,
            },
        )


def unseed_templates(apps, schema_editor):
    LabelTemplate = apps.get_model("nextintranet_backend", "LabelTemplate")
    LabelTemplate.objects.filter(
        name__in=[template["name"] for template in SEED_TEMPLATES]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("nextintranet_backend", "0012_brandingsettings_labeltemplate"),
    ]

    operations = [
        migrations.RunPython(seed_templates, unseed_templates),
    ]
