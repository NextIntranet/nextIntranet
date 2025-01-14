from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from nextintranet_warehouse.models.component import Component
from nextintranet_warehouse.models.component import Packet
from nextintranet_warehouse.models.component import Supplier
from nextintranet_warehouse.models.component import SupplierRelation

import re



def validate_code(query_string):
    pattern = r'(?:\?|\&)(?P<key>[\w]+)=(?P<value>[\w+,.-]+)(?:\:?)'
    matches = re.finditer(pattern, query_string)
    result = {match.group('key'): match.group('value') for match in matches}
    return result if result else None

class IdentifierApiView(APIView):
    def post(self, request, *args, **kwargs):

        data = request.data
        print("identifier data:", data)


        response_data = {
            "message": "Data received successfully",
            "data": data,
            "parsed": None,
            "result": None,
            "action": {
                "type": None,
                "value": None,
            }
        }

        results = []

        decoded_data = validate_code(data.get('data', ''))
        print("Decoded data:", decoded_data)
        
        if decoded_data:
            if decoded_data.get('packet'):
                print("Packet:", decoded_data.get('packet'))
                packet = Packet.objects.filter(id=decoded_data.get('packet')).first()
                if packet:
                    results.append({
                        "type": "packet",
                        "id": packet.id,
                        "name": packet.component.name,
                        "link": packet.get_absolute_url()
                    })
                    response_data['action']['type'] = "link"
                    response_data['action']['value'] = 'http://localhost:8080'+packet.get_absolute_url()
            if decoded_data.get('component'):
                print("Component:", decoded_data.get('component'))
                component = Component.objects.filter(id=decoded_data.get('component')).first()
                if component:
                    results.append({
                        "type": "component",
                        "id": component.id,
                        "name": component.name,
                        "link": component.get_absolute_url()
                    })
        
        response_data['result'] = results
        response_data['parsed'] = decoded_data


        return Response(response_data, status=status.HTTP_200_OK)