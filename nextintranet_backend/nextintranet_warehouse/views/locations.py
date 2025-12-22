from ..models.warehouse import Warehouse
from django.views.generic import ListView
from django.views.generic.edit import CreateView
from django.views.generic.edit import UpdateView
from django.views.generic.edit import DeleteView

import django_tables2 as tables 
from django_tables2.views import SingleTableView
import itertools
from django import forms
from django.urls import reverse_lazy
from django.shortcuts import render
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.http import JsonResponse
from django.core.exceptions import ObjectDoesNotExist


from nextintranet_backend.views.crud import create_crud_urls
from nextintranet_backend.help.crud import NIT_Table
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.routers import DefaultRouter

from rest_framework import serializers


class WarehouseModelTable(NIT_Table):
    class Meta(NIT_Table.Meta):
        model = Warehouse
        fields = ('full_path', 'location', 'description', 'can_store_items')
    
    full_path = tables.LinkColumn('warehouse-detail', args=[tables.A('pk')], verbose_name='Path')

    
class LocationTableView(SingleTableView):
    model = Warehouse
    table_class = WarehouseModelTable
    template_name = 'warehouse/location/location_list.html'



urlpatterns = create_crud_urls(Warehouse, base_url="warehouse", table_class_object=WarehouseModelTable)
print(urlpatterns)



##########
########## API
##########

class WarehouseSerializer(serializers.ModelSerializer):
    full_path = serializers.ReadOnlyField()

    class Meta:
        model = Warehouse
        fields = '__all__'

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['parent'] = instance.parent_id
        return data



class CustomPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 1000

class LocationAPIView(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    pagination_class = CustomPagination

    def build_tree(self, locations, parent=None):
        tree = []
        for location in locations:
            if location.parent_id == (parent.id if parent else None):
                children = self.build_tree(locations, location)
                tree.append({
                    'id': location.id,
                    'name': location.name,
                    'location': location.location,
                    'description': location.description,
                    'full_path': location.full_path,
                    'can_store_items': location.can_store_items,
                    'parent': location.parent_id,
                    'children': children
                })
        return tree

    @action(detail=False, methods=['get'], url_path='tree')
    def tree_all(self, request):
        locations = Warehouse.objects.all()
        tree = self.build_tree(locations)
        return Response(tree)

    @action(detail=True, methods=['get'], url_path='tree')
    def tree(self, request, pk=None):
        location = Warehouse.objects.get(id=pk)
        objects = location.get_descendants(include_self=True)
        tree = self.build_tree(objects)
        return Response(tree)

LocationRouter = DefaultRouter()
LocationRouter.register(r'', LocationAPIView)
