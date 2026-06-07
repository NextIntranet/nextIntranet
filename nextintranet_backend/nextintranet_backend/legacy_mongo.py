"""Helpers for reading legacy OpenIntranet MongoDB dumps and ISO 15434 packet barcodes."""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path

RS = "\x1e"
GS = "\x1d"
EOT = "\x04"


def oid_to_uuid4(oid: str) -> uuid.UUID:
    """Deterministic ObjectId string → UUID (same as transfer_stock.py)."""
    hash_bytes = hashlib.sha256(oid.encode("utf-8")).digest()[:16]
    return uuid.UUID(bytes=hash_bytes)


def legacy_serial_from_oid(mongo_oid: str) -> str:
    """Serial number (ISO 15434 field S) used on legacy packet labels."""
    return mongo_oid.strip().lower()


def production_date_from_oid(mongo_oid: str) -> str:
    """YYMMDD for ISO 15434 field 5D, derived from ObjectId timestamp bytes."""
    timestamp = int(mongo_oid[:8], 16)
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%y%m%d")


def build_legacy_iso15434_barcode(mongo_oid: str) -> str:
    """Rebuild legacy Data Matrix payload for a MongoDB packet ObjectId."""
    serial = legacy_serial_from_oid(mongo_oid)
    prod_date = production_date_from_oid(mongo_oid)
    return f"[)>{RS}06{GS}S{serial}{GS}5D{prod_date}{RS}{EOT}"


def iter_stock_packets(dump_path: Path) -> Iterator[tuple[str, str | None]]:
    """
    Yield (mongo_oid, component_name) from stock.json or stock.bson in a dump folder.
    """
    json_path = dump_path / "stock.json"
    bson_path = dump_path / "stock.bson"

    if json_path.is_file():
        yield from _iter_stock_json(json_path)
        return

    if bson_path.is_file():
        yield from _iter_stock_bson(bson_path)
        return

    raise FileNotFoundError(
        f"No stock.json or stock.bson found in {dump_path}"
    )


def _iter_stock_json(path: Path) -> Iterator[tuple[str, str | None]]:
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            component_name = entry.get("name")
            for packet in entry.get("packets", []):
                oid = _extract_oid(packet.get("_id"))
                if oid:
                    yield oid, component_name


def _iter_stock_bson(path: Path) -> Iterator[tuple[str, str | None]]:
    try:
        import bson as bson_lib
    except ImportError as exc:
        raise ImportError(
            "Reading stock.bson requires the 'bson' package. "
            "Use stock.json or install bson/pymongo."
        ) from exc

    data = bson_lib.decode_all(path.read_bytes())
    for entry in data:
        component_name = entry.get("name")
        for packet in entry.get("packets", []):
            oid = _extract_oid(packet.get("_id"))
            if oid:
                yield oid, component_name


def _extract_oid(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, dict) and "$oid" in value:
        return str(value["$oid"]).strip().lower()
    if hasattr(value, "binary"):
        # bson.objectid.ObjectId
        return str(value).strip().lower()
    text = str(value).strip().lower()
    if len(text) == 24 and all(c in "0123456789abcdef" for c in text):
        return text
    return None
