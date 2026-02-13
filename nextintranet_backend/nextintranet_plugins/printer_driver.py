from rest_framework.exceptions import ValidationError

from .types import PluginDefinition


def _as_list(value):
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def execute_printer_driver(instance, payload, user):
    action = payload.get("action")
    if action != "print_labels":
        raise ValidationError({"action": "Unsupported action."})

    target = payload.get("target") or {}
    target_type = target.get("type")
    target_id = target.get("id")
    if target_type != "packet" or not target_id:
        raise ValidationError({"target": "Missing packet target."})

    supported_types = _as_list(instance.config.get("supported_types"))
    if supported_types and "label" not in supported_types:
        raise ValidationError({"supported_types": "Printer does not support label output."})

    format_type = payload.get("format")
    supported_formats = _as_list(instance.config.get("supported_formats"))
    if supported_formats and format_type and format_type not in supported_formats:
        raise ValidationError({"format": "Printer does not support the requested format."})

    labels = [{"type": "packet", "id": target_id}]
    return {
        "action": action,
        "instance": {"id": str(instance.id), "name": instance.name},
        "labels": labels,
    }


PRINTER_DRIVER_DEFINITION = PluginDefinition(
    key="printer.driver",
    name="Printer driver",
    version="1.0.0",
    capabilities=["packets.actions", "printqueue.actions"],
    config_schema={
        "type": "object",
        "properties": {
            "supported_types": {"type": "array", "items": {"type": "string"}},
            "supported_formats": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["supported_types"],
    },
    execute=execute_printer_driver,
)
