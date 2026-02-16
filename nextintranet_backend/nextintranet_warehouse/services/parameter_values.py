from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any


MAX_DECIMAL_DIGITS = 100
MAX_DECIMAL_PLACES = 40

SI_PREFIX_BY_EXPONENT = {
    -24: "y",
    -21: "z",
    -18: "a",
    -15: "f",
    -12: "p",
    -9: "n",
    -6: "u",
    -3: "m",
    0: "",
    3: "k",
    6: "M",
    9: "G",
    12: "T",
    15: "P",
    18: "E",
    21: "Z",
    24: "Y",
}


def parse_decimal_value(raw_value: Any) -> Decimal | None:
    if raw_value is None:
        return None
    value_text = str(raw_value).strip()
    if value_text == "":
        return None
    try:
        return Decimal(value_text)
    except InvalidOperation as exc:
        raise ValueError("Expected a numeric value.") from exc


def coerce_decimal_for_storage(raw_value: Any, *, strict: bool) -> Decimal | None:
    parsed = parse_decimal_value(raw_value)
    if parsed is None:
        return None
    if _fits_decimal_limits(parsed):
        return parsed
    if strict:
        raise ValueError("Numeric value is out of supported range.")
    return None


def _fits_decimal_limits(value: Decimal) -> bool:
    normalized = value.normalize()
    _, digits, exponent = normalized.as_tuple()

    significant_digits = len(digits)
    if exponent >= 0:
        whole_digits = significant_digits + exponent
        decimal_places = 0
    else:
        whole_digits = max(significant_digits + exponent, 0)
        decimal_places = -exponent

    if decimal_places > MAX_DECIMAL_PLACES:
        return False
    if whole_digits > (MAX_DECIMAL_DIGITS - MAX_DECIMAL_PLACES):
        return False
    if significant_digits > MAX_DECIMAL_DIGITS:
        return False
    return True


def format_parameter_display_value(
    raw_value: Any,
    value_number: Decimal | None,
    parameter_type: Any,
) -> str | None:
    if raw_value is None:
        return None

    raw_text = str(raw_value)
    if parameter_type is None:
        return raw_text

    if getattr(parameter_type, "value_type", None) != "number":
        return raw_text

    if not bool(getattr(parameter_type, "format_with_si_prefix", False)):
        return raw_text

    unit = str(getattr(parameter_type, "unit", "") or "").strip()
    if not unit:
        return raw_text

    numeric_value = value_number
    if numeric_value is None:
        numeric_value = coerce_decimal_for_storage(raw_value, strict=False)
    if numeric_value is None:
        return raw_text

    return format_with_si_prefix(numeric_value, unit)


def format_with_si_prefix(value_number: Decimal, unit: str) -> str:
    if value_number == 0:
        return f"0 {unit}".strip()

    min_exponent = min(SI_PREFIX_BY_EXPONENT)
    max_exponent = max(SI_PREFIX_BY_EXPONENT)

    exponent = value_number.copy_abs().adjusted()
    si_exponent = exponent - (exponent % 3)
    si_exponent = max(min(si_exponent, max_exponent), min_exponent)

    scaled_value = value_number / (Decimal(10) ** si_exponent)
    scaled_text = decimal_to_plain_string(scaled_value)
    prefix = SI_PREFIX_BY_EXPONENT[si_exponent]
    return f"{scaled_text} {prefix}{unit}".strip()


def decimal_to_plain_string(value: Decimal) -> str:
    text = format(value.normalize(), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    if text == "-0":
        return "0"
    return text
