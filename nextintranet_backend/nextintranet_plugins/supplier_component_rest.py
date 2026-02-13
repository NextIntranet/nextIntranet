from typing import Any, Dict, List, Optional

import requests
from rest_framework.exceptions import ValidationError

from .types import PluginDefinition


def _as_dict(value: Optional[dict]) -> dict:
    if isinstance(value, dict):
        return value
    return {}


def _as_list(value: Optional[list]) -> list:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _substitute_symbol(value: Any, symbol: str) -> Any:
    if isinstance(value, str):
        return value.replace("{symbol}", symbol)
    if isinstance(value, list):
        return [_substitute_symbol(item, symbol) for item in value]
    if isinstance(value, dict):
        return {key: _substitute_symbol(item, symbol) for key, item in value.items()}
    return value


def _extract_path(data: Any, path: Optional[Any]) -> Any:
    if not path:
        return data
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


def execute_supplier_component_rest(instance, payload, user):
    action = payload.get("action")
    if action != "fetch_component":
        raise ValidationError({"action": "Unsupported action."})

    symbol = payload.get("symbol")
    if not symbol:
        raise ValidationError({"symbol": "Symbol is required."})

    config = instance.config or {}
    base_url = (config.get("base_url") or config.get("url") or "").rstrip("/")
    endpoint_path = config.get("endpoint_path") or ""
    endpoint = f"{base_url}/{endpoint_path.lstrip('/')}" if endpoint_path else base_url
    if not endpoint:
        raise ValidationError({"base_url": "Base URL or URL must be configured."})

    method = (config.get("method") or "GET").upper()
    if method not in {"GET", "POST"}:
        raise ValidationError({"method": "Only GET and POST are supported."})

    headers = _substitute_symbol(_as_dict(config.get("headers")), symbol)
    params = _substitute_symbol(_as_dict(config.get("query_params")), symbol)
    body = _substitute_symbol(config.get("body"), symbol) if config.get("body") else None

    symbol_param = config.get("symbol_param")
    symbol_location = (config.get("symbol_location") or "query").lower()
    if symbol_param:
        if symbol_location == "query" and symbol_param not in params:
            params[symbol_param] = symbol
        elif symbol_location == "body":
            if body is None:
                body = {}
            if isinstance(body, dict) and symbol_param not in body:
                body[symbol_param] = symbol

    timeout = config.get("timeout", 20)
    try:
        response = requests.request(
            method,
            endpoint,
            headers=headers,
            params=params,
            json=body if method == "POST" else None,
            timeout=timeout,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ValidationError({"request": f"Request failed: {exc}"})

    try:
        data = response.json()
    except ValueError as exc:
        raise ValidationError({"response": f"Invalid JSON response: {exc}"})

    payload_path = config.get("response_path")
    extracted = _extract_path(data, payload_path)
    return {
        "raw": data,
        "payload": extracted,
    }


SUPPLIER_COMPONENT_REST_DEFINITION = PluginDefinition(
    key="supplier.component.rest",
    name="Supplier component REST API",
    version="0.1.0",
    capabilities=["component.actions"],
    config_schema={
        "type": "object",
        "properties": {
            "base_url": {"type": "string", "description": "Base URL of the supplier API."},
            "endpoint_path": {"type": "string", "description": "Endpoint path appended to base_url."},
            "method": {"type": "string", "enum": ["GET", "POST"]},
            "headers": {"type": "object", "additionalProperties": {"type": "string"}},
            "query_params": {"type": "object", "additionalProperties": {"type": "string"}},
            "body": {"type": "object"},
            "response_path": {
                "description": "Dot path or list of keys pointing to the component payload.",
                "oneOf": [
                    {"type": "string"},
                    {"type": "array", "items": {"type": "string"}},
                ],
            },
            "symbol_param": {"type": "string"},
            "symbol_location": {"type": "string", "enum": ["query", "body"]},
            "timeout": {"type": "number"},
        },
        "required": ["base_url", "method"],
    },
    execute=execute_supplier_component_rest,
)
