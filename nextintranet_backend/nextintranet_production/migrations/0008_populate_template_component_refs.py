from django.db import migrations


def _find_tstamp(raw):
    """Best-effort search for a KiCad tstamp/UUID inside an instance raw dict."""
    if not isinstance(raw, dict):
        return None
    for key, value in raw.items():
        lowered = str(key).lower()
        if lowered in {"tstamp", "tstamps", "uuid"}:
            if isinstance(value, str) and value.strip():
                return value.strip()
            if isinstance(value, dict):
                text = value.get("_text") or value.get("text")
                if isinstance(text, str) and text.strip():
                    return text.strip()
        if isinstance(value, dict):
            found = _find_tstamp(value)
            if found:
                return found
    return None


def populate_refs(apps, schema_editor):
    TemplateComponent = apps.get_model("nextintranet_production", "TemplateComponent")
    TemplateComponentRef = apps.get_model("nextintranet_production", "TemplateComponentRef")

    for line in TemplateComponent.objects.all().iterator():
        if line.ref_items.exists():
            continue
        refs = line.refs or []
        if not refs and line.ref_group:
            refs = [r.strip() for r in line.ref_group.split(",") if r.strip()]
        if not refs:
            continue

        instances_by_ref = {}
        attributes = line.attributes if isinstance(line.attributes, dict) else {}
        for instance in attributes.get("instances", []) or []:
            if isinstance(instance, dict) and instance.get("ref"):
                instances_by_ref[instance["ref"]] = instance

        new_refs = []
        for position, ref in enumerate(refs):
            instance = instances_by_ref.get(ref) or {}
            tstamp = _find_tstamp(instance.get("raw")) if instance else None
            new_refs.append(
                TemplateComponentRef(
                    line=line,
                    template_id=line.template_id,
                    ref=ref,
                    tstamp=tstamp,
                    metadata=instance or {},
                    position=position,
                )
            )
        TemplateComponentRef.objects.bulk_create(new_refs)


def remove_refs(apps, schema_editor):
    TemplateComponentRef = apps.get_model("nextintranet_production", "TemplateComponentRef")
    TemplateComponentRef.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("nextintranet_production", "0007_templatecomponentref"),
    ]

    operations = [
        migrations.RunPython(populate_refs, remove_refs),
    ]
