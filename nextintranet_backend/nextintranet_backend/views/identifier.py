import re

from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from nextintranet_warehouse.models.component import Component, Identifier, Packet
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
                    response_data["action"]["type"] = "link"
                    response_data["action"]["value"] = packet.get_absolute_url()
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
                        response_data["action"]["type"] = "link"
                        response_data["action"]["value"] = component.get_absolute_url()

        # 2) Last resort: external identifier (EAN, SKU, etc.) – only if no internal match
        if not results and raw_scan:
            identifier = (
                Identifier.objects.filter(identifier__iexact=raw_scan)
                .select_related("content_type")
                .first()
            )
            if identifier:
                obj = identifier.content_object
                item = _build_result_for_object(obj)
                if item:
                    results.append(item)
                    response_data["action"]["type"] = "link"
                    response_data["action"]["value"] = item["link"]

        response_data["result"] = results
        response_data["parsed"] = decoded_data
        return Response(response_data, status=status.HTTP_200_OK)