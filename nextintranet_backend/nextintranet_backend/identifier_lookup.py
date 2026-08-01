import uuid

from django.db.models import Q

from nextintranet_warehouse.models.component import (
    Component,
    ComponentParameter,
    Identifier,
    Packet,
)
from nextintranet_warehouse.models.warehouse import Warehouse

MFPN_PARAM_NAMES = frozenset({
    "mfpn",
    "mpn",
    "manufacturer part number",
    "symbol/mfpn",
    "symbol mfpn",
})


def resolve_identifier_objects(value: str) -> list[object]:
    """Resolve a scanned value against native IDs, external identifiers, name, and MFPN."""
    value = (value or "").strip()
    if not value:
        return []

    results: list[object] = []
    seen: set[tuple[str, str]] = set()

    def _add(obj) -> None:
        if obj is None:
            return
        key = (obj.__class__.__name__, str(getattr(obj, "pk", getattr(obj, "id", ""))))
        if key in seen:
            return
        seen.add(key)
        results.append(obj)

    try:
        parsed_uuid = uuid.UUID(value)
    except (TypeError, ValueError):
        parsed_uuid = None

    if parsed_uuid:
        packet = Packet.objects.filter(id=parsed_uuid).select_related("component").first()
        if packet:
            _add(packet)
        component = Component.objects.filter(id=parsed_uuid).first()
        if component:
            _add(component)
        # Warehouse carries a secondary `uuid` field besides its PK, so match both.
        location = Warehouse.objects.filter(
            Q(id=parsed_uuid) | Q(uuid=parsed_uuid)
        ).first()
        if location:
            _add(location)

    identifier = (
        Identifier.objects.filter(identifier__iexact=value)
        .select_related("content_type")
        .first()
    )
    if identifier:
        _add(identifier.content_object)

    for component in Component.objects.filter(name__iexact=value):
        _add(component)

    for component in Component.objects.filter(suppliers__symbol__iexact=value).distinct():
        _add(component)

    mfpn_type_filter = Q()
    for param_name in MFPN_PARAM_NAMES:
        mfpn_type_filter |= Q(parameter_type__name__iexact=param_name)
    for param in (
        ComponentParameter.objects.filter(value__iexact=value)
        .filter(mfpn_type_filter)
        .select_related("component")
    ):
        _add(param.component)

    return results
