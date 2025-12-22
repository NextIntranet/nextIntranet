from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from nextintranet_warehouse.models.category import Category
from nextintranet_warehouse.models.component import Component

from django.http import HttpResponse
import json
import uuid

class KicadAPITemplateView(APIView):
    permission_classes = []
    def get(self, request, format=None):
        data = {
            "meta": {
                "version": 1.0
            },
            "name": "KiCad HTTP Library",
            "description": "A KiCad library sourced from a REST API",
            "source": {
                "type": "REST_API",
                "api_version": "v1",
                "root_url": "http://localhost:8080/api/kicad/",
                "token": "token",
                "timeout_parts_seconds": 60,
                "timeout_categories_seconds": 600
            }
        }

        return HttpResponse(json.dumps(data), content_type='application/json')


class KicadApiView(APIView):
    permission_classes = []
    def get(self, request, format=None):

        data = {
            "categories": "",
            "parts": ""
        }

        return Response(data, status=status.HTTP_200_OK)

class KicadAPICategoriesView(APIView):
    permission_classes = []
    def get(self, request, format=None):
        permission_classes = []

        categories = Category.objects.all()
        
        data = []
        for category in categories:
            data.append({
                "id": str(category.id),
                "name": category.name,
                "path": category.full_path,
                "description": f'{category.full_path}; {category.description}'
            })

        return HttpResponse(json.dumps(data), content_type='application/json')


class KicadPartsCategoryView(APIView):
    permission_classes = []

    def get(self, request, id):
        print(f"chci kategorii {id}")
        
        cat = Category.objects.get(pk=id)
        parts = Component.objects.filter(category=cat)

        data = []
        for part in parts:
            data.append({
                "id": str(part.id),
                "name": part.name,
                "description": part.description
            })
            

        return HttpResponse(json.dumps(data), content_type='application/json')


class KicadPartsView(APIView):
    permission_classes = []
    def get(self, request, id=None):
        print("Chci informace o ", id)
        
        part = Component.objects.get(pk=id)
        category = part.category

        data = {
            "id": str(part.id),
            "name": part.name,
            "symbolIdStr": "",
            "exclude_from_bom": "False",
            "exclude_from_board": "False",
            "exclude_from_sim": "False",
            "fields": {
                "ustid": {
                    "value": str(part.id),
                    "visible": "False"
                },
                "description": {
                    "value": part.description,
                    "visible": "False"
                },
                "name": {
                    "value": part.name,
                    "visible": "True"
                },
                "value": {
                    "value": part.name,
                    "visible": "True"
                },
                "reference": {
                    "value": category.name[0],
                    "visible": "True"
                },
                "category": {
                    "value": category.name,
                    "visible": "False"
                },
                "keywords": {
                    "value": category.name,
                    "visible": "False"
                },
                
            }
        }

        for parameter in part.parameters.all():
            print(parameter)
            parameter_name = parameter.parameter_type.name
            value = parameter.value

            if parameter_name.lower().strip() == 'kicad:symbol':
                data["symbolIdStr"] = parameter.value

            if parameter_name.lower().startswith('kicad:'):
                parameter_name = parameter_name[6:]
                visible = "False"
            else:
                visible = "False"

            data["fields"][parameter_name] = {
                "value": value,
                "visible": visible
            }
        
        for i, documents in enumerate(part.documents.all()):
            if documents.doc_type == 'datasheet':
                data["fields"]["datasheet"] = {
                    "value": documents.url,
                    "visible": "False"
                }

            data["fields"][f"DOC_{i}_{documents.doc_type}"] = {
                "value": documents.url,
                "visible": "False"
            }

        return HttpResponse(json.dumps(data), content_type='application/json')


