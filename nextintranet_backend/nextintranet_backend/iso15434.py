"""ISO 15434 / ISO 15418 Data Identifier barcode parser (AIM format 06)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

RS = "\x1e"  # Record Separator
GS = "\x1d"  # Group Separator
EOT = "\x04"  # End of Transmission
HEADER = "[)>"
FORMAT_06 = "06"

KNOWN_DIS = (
    "1P",
    "1T",
    "2P",
    "3S",
    "4L",
    "5D",
    "9D",
    "S",
    "Q",
    "V",
)
_DI_PREFIXES = tuple(sorted(KNOWN_DIS, key=len, reverse=True))
_DI_FALLBACK_RE = re.compile(r"^([A-Z0-9]{1,3})(.*)$", re.DOTALL)


@dataclass
class Iso15434Scan:
    raw: str
    format_code: str
    fields: dict[str, str] = field(default_factory=dict)

    @property
    def serial_number(self) -> str | None:
        return self.fields.get("S") or self.fields.get("3S")

    def to_dict(self) -> dict:
        return {
            "format": "iso15434",
            "format_code": self.format_code,
            "fields": dict(self.fields),
            "serial_number": self.serial_number,
        }


def _parse_di_segment(segment: str) -> tuple[str, str] | None:
    if not segment:
        return None
    for di in _DI_PREFIXES:
        if segment.startswith(di):
            return di, segment[len(di) :]
    match = _DI_FALLBACK_RE.match(segment)
    if match:
        return match.group(1), match.group(2)
    return None


def parse_iso15434(raw: str) -> Iso15434Scan | None:
    """
    Parse AIM ISO 15434 format 06 barcodes, e.g.:
    [)>\\x1e06\\x1dS{serial}\\x1d5D{YYMMDD}\\x1e\\x04
    """
    text = raw.strip().rstrip(";")
    if not text.startswith(HEADER):
        return None

    body = text[len(HEADER) :]
    if body.startswith(RS):
        body = body[1:]

    if not body.startswith(FORMAT_06):
        return None

    body = body[len(FORMAT_06) :]
    if body.startswith(GS):
        body = body[1:]

    body = body.rstrip(EOT)
    if body.endswith(RS):
        body = body[:-1]

    result = Iso15434Scan(raw=text, format_code=FORMAT_06)
    for segment in body.split(GS):
        parsed = _parse_di_segment(segment)
        if not parsed:
            continue
        di, value = parsed
        if value:
            result.fields[di] = value

    return result
