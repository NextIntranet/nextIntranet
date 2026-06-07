import uuid

from nextintranet_warehouse.models.component import Component, Identifier, Packet


def resolve_identifier_objects(value: str) -> list[object]:
    """Resolve a scanned value against native object IDs and external Identifier records."""
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

    identifier = (
        Identifier.objects.filter(identifier__iexact=value)
        .select_related("content_type")
        .first()
    )
    if identifier:
        _add(identifier.content_object)

    return results
