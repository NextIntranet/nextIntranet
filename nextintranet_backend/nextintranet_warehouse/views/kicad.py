from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from nextintranet_warehouse.models.category import Category
from nextintranet_warehouse.models.component import Component

from django.http import HttpResponse
from django.conf import settings
import json


def _replace_none_with_empty_string(value):
    if value is None:
        return ""
    if isinstance(value, dict):
        return {key: _replace_none_with_empty_string(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_replace_none_with_empty_string(item) for item in value]
    return value


class KicadAPITemplateView(APIView):
    permission_classes = []
    def get(self, request, format=None):
        site_url = getattr(settings, 'SITE_URL', 'http://localhost:8000')
        root_url = f"{site_url.rstrip('/')}/api/kicad/"

        data = {
            "meta": {
                "version": 1.0
            },
            "name": "KiCad HTTP Library",
            "description": "A KiCad library sourced from a REST API",
            "source": {
                "type": "REST_API",
                "api_version": "v1",
                "root_url": root_url,
                "token": "token",
                "timeout_parts_seconds": 60,
                "timeout_categories_seconds": 600
            }
        }

        sanitized_data = _replace_none_with_empty_string(data)
        return HttpResponse(json.dumps(sanitized_data), content_type='application/json')


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
            category_path = category.full_path or ""
            category_description = category.description or ""
            combined_description = " ; ".join(
                [part for part in [category_path, category_description] if part]
            )

            data.append({
                "id": str(category.id),
                "name": category.name,
                "path": category_path,
                "description": combined_description
            })

        sanitized_data = _replace_none_with_empty_string(data)
        return HttpResponse(json.dumps(sanitized_data), content_type='application/json')


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
            

        sanitized_data = _replace_none_with_empty_string(data)
        return HttpResponse(json.dumps(sanitized_data), content_type='application/json')


class KicadPartsView(APIView):
    permission_classes = []
    def get(self, request, id=None):
        print("Chci informace o ", id)
        
        part = Component.objects.get(pk=id)
        category = part.category
        category_name = category.name if category and category.name else ""

        data = {
            "id": str(part.id),
            "name": part.name,
            "symbolIdStr": "",
            "exclude_from_bom": "False",
            "exclude_from_board": "False",
            "exclude_from_sim": "False",
            "fields": {
                "NIID": {
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
                    "value": category_name[:1],
                    "visible": "True"
                },
                "category": {
                    "value": category_name,
                    "visible": "False"
                },
                "keywords": {
                    "value": category_name,
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
        
        for documents in part.documents.all():
            if documents.doc_type == 'datasheet':
                data["fields"]["datasheet"] = {
                    "value": documents.url,
                    "visible": "False"
                }

        sanitized_data = _replace_none_with_empty_string(data)
        print(
            f"KiCad payload for parts/{id}.json:\n"
            f"{json.dumps(sanitized_data, ensure_ascii=False, indent=2)}"
        )

        return HttpResponse(json.dumps(sanitized_data), content_type='application/json')
