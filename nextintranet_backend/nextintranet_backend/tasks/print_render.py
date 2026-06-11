from datetime import timedelta
from django.apps import apps
from django.conf import settings
from django.core.files.base import ContentFile
from django.utils import timezone

from nextintranet_backend.labels.factory import LabelGeneratorFactory
from nextintranet_backend.labels.resolver import (
    cleanup_logo_file,
    prepare_logo_file,
    resolve_template_overrides,
)
from nextintranet_backend.models.printList import PrintFile, PrintItem, PrintRenderJob


LABEL_MODEL_MAP = {
    ("nextintranet_warehouse", "packet"): "packet",
    ("nextintranet_warehouse", "warehouse"): "location",
    ("nextintranet_warehouse", "component"): "component",
}

FORMAT_DEFAULTS = {
    "single": {
        "width_mm": 63.5,
        "height_mm": 38.1,
    },
    "a4_2x7": {
        "width_mm": 63.5,
        "height_mm": 38.1,
        "margin_left_mm": 10,
        "margin_top_mm": 10,
        "spacing_h_mm": 5,
        "spacing_v_mm": 0,
        "page_margin_left": 0,
        "page_margin_top": 0,
        "page_margin_right": 0,
        "page_margin_bottom": 0,
    },
    "a4_3x7": {
        "width_mm": 70,
        "height_mm": 42.3,
        "margin_left_mm": 0,
        "margin_top_mm": 0,
        "spacing_h_mm": 0,
        "spacing_v_mm": 0,
        "page_margin_left": 0,
        "page_margin_top": 0,
        "page_margin_right": 0,
        "page_margin_bottom": 0,
    },
    "a4_4x10": {
        "width_mm": 48,
        "height_mm": 25,
        "margin_left_mm": 10,
        "margin_top_mm": 15,
        "spacing_h_mm": 0,
        "spacing_v_mm": 0,
        "page_margin_left": 0,
        "page_margin_top": 0,
        "page_margin_right": 0,
        "page_margin_bottom": 0,
    },
}


def render_print_job(job_id):
    job = PrintRenderJob.objects.select_related("owner", "print_list").get(id=job_id)
    if job.status not in {PrintRenderJob.STATUS_QUEUED, PrintRenderJob.STATUS_FAILED}:
        return

    job.status = PrintRenderJob.STATUS_PROCESSING
    job.error = ""
    job.save(update_fields=["status", "error"])

    try:
        items = list(
            job.items.filter(kind=PrintItem.KIND_LABEL).select_related("content_type")
        )
        if not items:
            raise ValueError("No label items to render.")

        payload = job.payload or {}
        format_type = payload.get("format") or "single"
        label_items = [_build_label_item(item) for item in items]
        format_params = _build_format_params(payload)

        logo_path = prepare_logo_file(color_mode=format_params.get("color_mode", "color"))
        try:
            format_params["content_overrides"] = resolve_template_overrides(
                format_type, payload, logo_path=logo_path
            )
            generator = LabelGeneratorFactory.create_label_generator(format_type, **format_params)
            pdf_content = generator.generate_pdf(label_items)
        finally:
            cleanup_logo_file(logo_path)

        ttl_seconds = int(getattr(settings, "PRINT_RENDER_TTL_SECONDS", 3600))
        expires_at = timezone.now() + timedelta(seconds=ttl_seconds)

        file_obj = PrintFile(
            owner=job.owner,
            name=payload.get("name") or f"Labels {job.id}",
            kind=PrintFile.KIND_GENERATED,
            expires_at=expires_at,
        )
        file_obj.file.save(f"labels-{job.id}.pdf", ContentFile(pdf_content), save=True)

        job.file = file_obj
        job.status = PrintRenderJob.STATUS_READY
        job.completed_at = timezone.now()
        job.save(update_fields=["file", "status", "completed_at"])
    except Exception as exc:
        job.status = PrintRenderJob.STATUS_FAILED
        job.error = str(exc)
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "error", "completed_at"])
        raise


def cleanup_expired_print_files():
    now = timezone.now()
    expired_files = PrintFile.objects.filter(
        kind=PrintFile.KIND_GENERATED, expires_at__isnull=False, expires_at__lt=now
    )
    for file_obj in expired_files:
        file_obj.file.delete(save=False)
        file_obj.delete()


def _build_format_params(payload):
    format_type = payload.get("format") or "single"
    defaults = FORMAT_DEFAULTS.get(format_type, FORMAT_DEFAULTS["single"])
    params = {
        "skip_labels": int(payload.get("skip_labels", 0)),
        "show_borders": bool(payload.get("show_borders", True)),
        "color_mode": payload.get("color_mode", "color"),
    }
    for key, default in defaults.items():
        value = payload.get(key, default)
        params[key] = float(value)
    return params


def _build_label_item(item):
    payload = item.payload or {}
    label_type = payload.get("label_type") or _resolve_label_type(item)
    if not label_type:
        raise ValueError(f"Unsupported label type for {item.content_type}.{item.object_id}")

    label_data = payload.get("label_data")
    if label_data is None:
        label_data = _default_label_data(item)
    return {"type": label_type, "data": label_data}


def _resolve_label_type(item):
    content_type = item.content_type
    return LABEL_MODEL_MAP.get((content_type.app_label, content_type.model))


def _default_label_data(item):
    content_type = item.content_type
    if (content_type.app_label, content_type.model) == ("nextintranet_warehouse", "packet"):
        return {"uuid": str(item.object_id)}
    if (content_type.app_label, content_type.model) == ("nextintranet_warehouse", "component"):
        component = _get_model_instance("nextintranet_warehouse", "Component", item.object_id)
        return {
            "type": component.name if component else "Component",
            "serial": str(item.object_id)[:8],
            "id": str(item.object_id),
        }
    if (content_type.app_label, content_type.model) == ("nextintranet_warehouse", "warehouse"):
        location = _get_model_instance("nextintranet_warehouse", "Warehouse", item.object_id)
        return _location_label_data(location, item.object_id)
    return {"uuid": str(item.object_id)}


def _location_label_data(location, fallback_id):
    if not location:
        return {
            "building": "Location",
            "room": str(fallback_id)[:8],
            "id": str(fallback_id),
        }

    full_path = location.full_path
    if "/" in full_path:
        building, room = full_path.rsplit("/", 1)
    else:
        building, room = full_path, ""
    return {
        "building": building,
        "room": room or location.name,
        "full_path": full_path,
        "name": location.name,
        "description": location.description or "",
        "id": str(location.id),
    }


def _get_model_instance(app_label, model_name, object_id):
    model = apps.get_model(app_label, model_name)
    if not model:
        return None
    return model.objects.filter(id=object_id).first()
