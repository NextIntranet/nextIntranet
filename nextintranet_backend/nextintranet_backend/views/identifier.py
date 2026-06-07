import re

from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from nextintranet_backend.iso15434 import parse_iso15434
from nextintranet_backend.identifier_lookup import resolve_identifier_objects
from nextintranet_warehouse.models.component import Component, Packet
from nextintranet_warehouse.models.warehouse import Warehouse
from nextintranet_warehouse.models.purchase import Purchase
from nextintranet_production.models.production import Production


def validate_code(query_string):
    pattern = r'(?:\?|\&)(?P<key>[\w]+)=(?P<value>[\w+,.-]+)(?:\:?)'
    matches = re.finditer(pattern, query_string)
    result = {match.group('key'): match.group('value') for match in matches}
    return result if result else None


def _build_result_for_object(obj):
    """Build { type, id, name, link } for scanner response; link is relative path."""
    if isinstance(obj, Component):
        return {
            "type": "component",
            "id": str(obj.id),
            "name": obj.name,
            "link": obj.get_absolute_url(),
        }
    if isinstance(obj, Packet):
        return {
            "type": "packet",
            "id": str(obj.id),
            "name": obj.component.name,
            "link": obj.get_absolute_url(),
        }
    if isinstance(obj, Warehouse):
        return {
            "type": "location",
            "id": str(obj.id),
            "name": obj.name,
            "link": f"/store/location/{obj.id}",
        }
    if isinstance(obj, Purchase):
        return {
            "type": "purchase",
            "id": str(obj.id),
            "name": f"Order {str(obj.id)[:8]}",
            "link": f"/store/purchase/{obj.id}",
        }
    if isinstance(obj, Production):
        return {
            "type": "production",
            "id": str(obj.id),
            "name": obj.name,
            "link": f"/production/{obj.id}",
        }
    return None


def _lookup_by_identifier_value(value: str) -> list[dict]:
    return [
        item
        for obj in resolve_identifier_objects(value)
        if (item := _build_result_for_object(obj))
    ]


class IdentifierApiView(APIView):
    def post(self, request, *args, **kwargs):
        data = request.data
        response_data = {
            "message": "Data received successfully",
            "data": data,
            "parsed": None,
            "result": None,
            "action": {"type": None, "value": None},
        }
        results = []

        raw_scan = (data.get("data") or "").strip()
        decoded_data = validate_code(raw_scan)
        iso_scan = parse_iso15434(raw_scan)

        parsed: dict = {}
        if decoded_data:
            parsed["query"] = decoded_data
        if iso_scan:
            parsed["iso15434"] = iso_scan.to_dict()
        if parsed:
            response_data["parsed"] = parsed

        def _set_action(link: str | None) -> None:
            if link and not response_data["action"]["value"]:
                response_data["action"]["type"] = "link"
                response_data["action"]["value"] = link

        # 1) Internal match: QR/content with ?component=uuid or ?packet=uuid
        if decoded_data:
            if decoded_data.get("packet"):
                packet = Packet.objects.filter(id=decoded_data.get("packet")).first()
                if packet:
                    results.append({
                        "type": "packet",
                        "id": str(packet.id),
                        "name": packet.component.name,
                        "link": packet.get_absolute_url(),
                    })
                    _set_action(packet.get_absolute_url())
            if decoded_data.get("component"):
                component = Component.objects.filter(id=decoded_data.get("component")).first()
                if component:
                    results.append({
                        "type": "component",
                        "id": str(component.id),
                        "name": component.name,
                        "link": component.get_absolute_url(),
                    })
                    if not response_data["action"]["value"]:
                        _set_action(component.get_absolute_url())

        # 2) ISO 15434: resolve serial number (S / 3S) via native IDs and external identifiers
        if not results and iso_scan and iso_scan.serial_number:
            for item in _lookup_by_identifier_value(iso_scan.serial_number):
                results.append(item)
                _set_action(item["link"])

        # 3) Fallback: treat full scan text as identifier value (native + external)
        if not results and raw_scan:
            for item in _lookup_by_identifier_value(raw_scan):
                results.append(item)
                _set_action(item["link"])

        response_data["result"] = results
        return Response(response_data, status=status.HTTP_200_OK)
