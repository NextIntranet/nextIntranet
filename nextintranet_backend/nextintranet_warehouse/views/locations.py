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
from django.core.cache import cache


from nextintranet_backend.views.crud import create_crud_urls
from nextintranet_backend.help.crud import NIT_Table
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter

from rest_framework import serializers
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from django.db.models import Count, Max
from django.core.files.storage import default_storage


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
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def _cache_key(self, suffix):
        marker = Warehouse.objects.aggregate(last_created=Max('created_at'), total=Count('id'))
        last_created = marker['last_created']
        ts = last_created.isoformat() if last_created else '0'
        return f"warehouse:locations:tree:{suffix}:{marker['total']}:{ts}"

    def _base_tree_values_queryset(self):
        return Warehouse.objects.order_by('tree_id', 'lft').values(
            'id',
            'uuid',
            'name',
            'location',
            'description',
            'can_store_items',
            'parent_id',
            'map',
        )

    def _build_tree_payload(self, rows, root_id=None, root_full_path=None):
        nodes_by_id = {}
        children_by_parent = {}
        full_path_by_id = {}

        for row in rows:
            row_id = row['id']
            parent_id = row['parent_id']

            if root_id is not None and row_id == root_id and root_full_path:
                full_path = root_full_path
            else:
                parent_path = full_path_by_id.get(parent_id)
                full_path = f"{parent_path}/{row['name']}" if parent_path else row['name']
            full_path_by_id[row_id] = full_path

            map_name = row['map']
            map_url = default_storage.url(map_name) if map_name else None

            node = {
                'id': row_id,
                'uuid': str(row['uuid']),
                'name': row['name'],
                'location': row['location'],
                'description': row['description'],
                'full_path': full_path,
                'can_store_items': row['can_store_items'],
                'parent': parent_id,
                'map': map_url,
                'children': [],
            }

            nodes_by_id[row_id] = node
            children_by_parent.setdefault(parent_id, []).append(node)

        for parent_id, children in children_by_parent.items():
            if parent_id is None:
                continue
            parent = nodes_by_id.get(parent_id)
            if parent is not None:
                parent['children'] = children

        if root_id is not None:
            root_node = nodes_by_id.get(root_id)
            return [root_node] if root_node else []

        return children_by_parent.get(None, [])

    @action(detail=False, methods=['get'], url_path='tree')
    def tree_all(self, request):
        cache_key = self._cache_key('all')
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        rows = list(self._base_tree_values_queryset())
        tree = self._build_tree_payload(rows)
        cache.set(cache_key, tree, 60)
        return Response(tree)

    @action(detail=True, methods=['get'], url_path='tree')
    def tree(self, request, pk=None):
        root = Warehouse.objects.filter(id=pk).values('id', 'tree_id', 'lft', 'rght').first()
        if root is None:
            return Response({'detail': 'Not found.'}, status=404)

        cache_key = self._cache_key(f"node:{pk}")
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        rows = list(
            Warehouse.objects.filter(
                tree_id=root['tree_id'],
                lft__gte=root['lft'],
                rght__lte=root['rght'],
            )
            .order_by('lft')
            .values(
                'id',
                'uuid',
                'name',
                'location',
                'description',
                'can_store_items',
                'parent_id',
                'map',
            )
        )

        ancestor_names = list(
            Warehouse.objects.filter(
                tree_id=root['tree_id'],
                lft__lte=root['lft'],
                rght__gte=root['rght'],
            )
            .order_by('lft')
            .values_list('name', flat=True)
        )
        root_full_path = "/".join(ancestor_names)

        tree = self._build_tree_payload(rows, root_id=root['id'], root_full_path=root_full_path)
        cache.set(cache_key, tree, 60)
        return Response(tree)

LocationRouter = DefaultRouter(trailing_slash=True)
LocationRouter.register(r'', LocationAPIView)
