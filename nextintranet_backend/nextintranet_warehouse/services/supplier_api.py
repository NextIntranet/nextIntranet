import hashlib
import json
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Optional

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from nextintranet_backend.models.plugin import PluginInstance
from nextintranet_plugins import get_plugin_definition
from nextintranet_warehouse.models.component import (
    ComponentParameter,
    Document,
    ParameterType,
    Supplier,
    SupplierRelation,
)


def user_can_access_instance(user, instance: PluginInstance) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if not instance.enabled:
        return False
    role_ids = list(instance.roles.values_list("id", flat=True))
    if not role_ids:
        return True
    user_group_ids = set(user.groups.values_list("id", flat=True))
    return any(role_id in user_group_ids for role_id in role_ids)


def _json_hash(data: Any) -> str:
    payload = json.dumps(data, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _as_list(value: Any) -> list:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _extract_value(data: Any, path: Optional[Any]) -> Any:
    if path is None:
        return None
    if isinstance(path, str):
        parts = [part for part in path.split(".") if part]
    else:
        parts = _as_list(path)
    current = data
    for part in parts:
        if current is None:
            return None
        if isinstance(current, list):
            try:
                index = int(part)
            except (TypeError, ValueError):
                return None
            if index < 0 or index >= len(current):
                return None
            current = current[index]
            continue
        if not isinstance(current, dict):
            return None
        if part not in current:
            return None
        current = current[part]
    return current


def fetch_supplier_relation_payload(
    supplier_relation: SupplierRelation,
    user=None,
    symbol_override: Optional[str] = None,
) -> Dict[str, Any]:
    supplier: Supplier = supplier_relation.supplier
    if not supplier:
        raise ValidationError({"supplier": "Supplier relation has no supplier set."})

    plugin_instance = supplier.api_plugin_instance
    if not plugin_instance:
        raise ValidationError({"supplier": "Supplier has no API plugin instance configured."})
    if not plugin_instance.enabled:
        raise ValidationError({"supplier": "Supplier API plugin is disabled."})
    if user is not None and not user_can_access_instance(user, plugin_instance):
        raise PermissionDenied("Access denied for supplier API plugin.")

    definition = get_plugin_definition(plugin_instance.definition_key)
    if not definition or not definition.execute:
        raise ValidationError({"supplier": "Supplier API plugin is not executable."})

    symbol = symbol_override or supplier_relation.symbol
    if not symbol:
        raise ValidationError({"symbol": "Supplier symbol is required."})

    instance_config = plugin_instance.config or {}
    supplier_config = supplier.api_config or {}
    merged_config = {**instance_config, **supplier_config}
    for key in ("headers", "query_params", "body"):
        instance_value = instance_config.get(key)
        supplier_value = supplier_config.get(key)
        if isinstance(instance_value, dict) and isinstance(supplier_value, dict):
            merged_config[key] = {**instance_value, **supplier_value}

    original_config = plugin_instance.config
    plugin_instance.config = merged_config
    try:
        result = definition.execute(
            plugin_instance,
            {"action": "fetch_component", "symbol": symbol},
            user,
        )
    finally:
        plugin_instance.config = original_config
    now = timezone.now()
    payload = {
        "raw": result.get("raw"),
        "payload": result.get("payload"),
        "fetched_at": now.isoformat(),
        "source": {
            "definition_key": plugin_instance.definition_key,
            "symbol": symbol,
        },
    }
    supplier_relation.api_data = payload
    supplier_relation.api_data_hash = _json_hash(payload.get("payload") or payload.get("raw"))
    supplier_relation.api_fetched_at = now
    supplier_relation.save(update_fields=["api_data", "api_data_hash", "api_fetched_at"])

    supplier.api_last_sync_at = now
    supplier.save(update_fields=["api_last_sync_at"])

    return payload


def _policy_allows_update(policy: str, current_value: Optional[str]) -> bool:
    if policy == "always":
        return True
    if policy == "if_empty":
        return not current_value
    return False


def _apply_documents(component, items, policy: str, item_map: Optional[dict]) -> int:
    existing_urls = set(
        Document.objects.filter(component=component, url__isnull=False)
        .exclude(url="")
        .values_list("url", flat=True)
    )
    if policy == "if_empty" and existing_urls:
        return 0
    added = 0
    for item in _as_list(items):
        url = None
        name = None
        doc_type = "undefined"
        if isinstance(item, dict):
            if item_map:
                url = _extract_value(item, item_map.get("url"))
                name = _extract_value(item, item_map.get("name"))
                doc_type = item_map.get("doc_type", doc_type)
            else:
                url = item.get("url") or item.get("link")
                name = item.get("name") or item.get("title")
                doc_type = item.get("doc_type") or item.get("type") or doc_type
        elif isinstance(item, str):
            url = item
        if not url or url in existing_urls:
            continue
        Document.objects.create(
            component=component,
            name=name,
            doc_type=doc_type or "undefined",
            url=url,
            access_level="public",
        )
        existing_urls.add(url)
        added += 1
    return added


def _apply_parameters(
    component,
    items,
    policy: str,
    item_map: Optional[dict],
    param_name_map: Optional[dict] = None,
) -> int:
    existing = set(
        ComponentParameter.objects.filter(component=component)
        .values_list("parameter_type_id", "value")
    )
    if policy == "if_empty" and existing:
        return 0
    added = 0
    for item in _as_list(items):
        if not isinstance(item, dict):
            continue
        if item_map:
            name = _extract_value(item, item_map.get("name"))
            value = _extract_value(item, item_map.get("value"))
            unit = _extract_value(item, item_map.get("unit"))
        else:
            name = item.get("name")
            value = item.get("value")
            unit = item.get("unit")
        if not name or value is None:
            continue
        display_name = str(name)
        if param_name_map and display_name in param_name_map:
            display_name = str(param_name_map[display_name])
        param_type, created = ParameterType.objects.get_or_create(
            name=display_name,
            defaults={"unit": unit},
        )
        if unit and not created and not param_type.unit:
            param_type.unit = unit
            param_type.save(update_fields=["unit"])
        key = (param_type.id, str(value))
        if key in existing:
            continue
        ComponentParameter.objects.create(
            component=component,
            parameter_type=param_type,
            value=str(value),
        )
        existing.add(key)
        added += 1
    return added


def apply_supplier_mapping(
    supplier_relation: SupplierRelation,
    mapping_override: Optional[dict] = None,
) -> Dict[str, Any]:
    """
    Apply supplier API mapping to component and supplier relation.

    Mapping config (Supplier.api_mapping or override) shape:
    {
      "fields": {
        "<field_key>": {
          "source": "<dot path or list of keys into payload>",  // e.g. "0.ImagePath" or "ImagePath"
          "target": "component.name | component.description | component.primary_image | component.documents | component.parameters | supplier_relation.api_price | supplier_relation.api_availability",
          "policy": "always | if_empty | never",
          "description_mode": "overwrite | prepend | append",   // only for component.description
          "item_map": { "name": "...", "value": "...", "url": "...", "doc_type": "..." },  // for documents/parameters
          "param_name_map": { "API Param Name": "Our Parameter Type Name" },  // only for component.parameters
        }
      }
    }
    """
    supplier = supplier_relation.supplier
    if not supplier:
        raise ValidationError({"supplier": "Supplier relation has no supplier set."})

    api_data = supplier_relation.api_data or {}
    payload = api_data.get("payload") or api_data.get("raw")
    if payload is None:
        raise ValidationError({"api_data": "No API payload stored on supplier relation."})

    mapping = mapping_override or supplier.api_mapping or {}
    fields = mapping.get("fields", {})
    if not isinstance(fields, dict):
        raise ValidationError({"api_mapping": "Mapping fields must be an object."})

    component = supplier_relation.component
    updated_fields = []
    updated_sr_fields = set()
    applied = {"documents_added": 0, "parameters_added": 0, "fields_updated": []}

    for field_key, config in fields.items():
        if not isinstance(config, dict):
            continue
        policy = (config.get("policy") or "if_empty").lower()
        if policy == "never":
            continue
        source = config.get("source")
        target = config.get("target")
        if not target or not source:
            continue
        value = _extract_value(payload, source)
        if value is None:
            continue

        if target.startswith("component."):
            field_name = target.split(".", 1)[1]
            if field_name not in {"name", "description", "primary_image"}:
                continue
            current_value = getattr(component, field_name, None)
            if not _policy_allows_update(policy, current_value):
                continue
            if field_name == "description":
                description_mode = (config.get("description_mode") or "overwrite").lower()
                if description_mode == "prepend":
                    new_value = (str(value).strip() + "\n\n" + (current_value or "").strip()).strip()
                elif description_mode == "append":
                    new_value = ((current_value or "").strip() + "\n\n" + str(value).strip()).strip()
                else:
                    new_value = str(value)
                setattr(component, field_name, new_value or None)
            else:
                setattr(component, field_name, str(value))
            updated_fields.append(field_name)
            applied["fields_updated"].append(field_key)
            continue

        if target.startswith("supplier_relation."):
            field_name = target.split(".", 1)[1]
            if field_name not in {
                "api_price",
                "api_availability",
                "custom_url",
                "symbol",
                "description",
            }:
                continue
            if not _policy_allows_update(policy, getattr(supplier_relation, field_name, None)):
                continue
            if field_name == "api_price":
                try:
                    setattr(supplier_relation, field_name, Decimal(str(value)))
                except (InvalidOperation, TypeError, ValueError):
                    continue
            else:
                setattr(supplier_relation, field_name, str(value) if value is not None else None)
            updated_sr_fields.add(field_name)
            applied["fields_updated"].append(field_key)
            continue

        if target == "component.documents":
            item_map = config.get("item_map") or {}
            added = _apply_documents(component, value, policy, item_map)
            applied["documents_added"] += added
            if added:
                applied["fields_updated"].append(field_key)
            continue

        if target == "component.parameters":
            item_map = config.get("item_map") or {}
            param_name_map = config.get("param_name_map")
            added = _apply_parameters(
                component, value, policy, item_map, param_name_map=param_name_map
            )
            applied["parameters_added"] += added
            if added:
                applied["fields_updated"].append(field_key)

    if updated_fields:
        component.save(update_fields=list(set(updated_fields)))

    supplier_relation.api_applied_at = timezone.now()
    supplier_relation.save(
        update_fields=["api_applied_at"] + list(updated_sr_fields)
    )

    return applied
