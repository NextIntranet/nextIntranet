from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.urls import path
from django.contrib.auth.views import LogoutView
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import generics, filters
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import serializers

from ...nextintranet_warehouse.models.component import Component, Category, Document, Batch, SupplierRelation, Supplier
# from ...nextintranet_warehouse.models.warehouse import Warehouse
# from ...nextintranet_warehouse.views.warehouse import WarehouseSerializer


class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = '__all__'

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        #fields = ['name', 'abbreviation', 'description', 'parent', 'full_path', '']
        fields = '__all__'

class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'
    
class SupplierRelationSerializer(serializers.ModelSerializer):
    supplier = SupplierSerializer(read_only=True)
    # url = serializers.URLField(source='url', allow_blank=True, allow_null=True)
    url = serializers.SerializerMethodField()
    class Meta:
        model = SupplierRelation
        fields = ['supplier', 'symbol', 'url']
    
    def get_url(self, obj):
        return obj.url

class BatchSerializer(serializers.ModelSerializer):
    # warehouse = WarehouseSerializer(read_only=True)
    class Meta:
        model = Batch
        fields = ['uuid', 'count', 'id', 'date_added', 'is_trackable', 'description']


# Serializer for Component model
# class ComponentSerializer(serializers.ModelSerializer):
#     warehouse = WarehouseSerializer(read_only=True)
#     category = CategorySerializer(read_only=True)
#     primary_image = DocumentSerializer(read_only=True)
#     batches = BatchSerializer(many=True, read_only=True)
#     local_batches = serializers.SerializerMethodField()
#     suppliers = serializers.SerializerMethodField()

#     def get_local_batches(self, obj):
#         request = self.context.get('request')
#         if request:
#             warehouse_uuid = request.query_params.get('warehouse', None)
#             if warehouse_uuid:
#                 try:
#                     warehouse = Warehouse.objects.get(uuid=warehouse_uuid)
#                 except Warehouse.DoesNotExist:
#                     return None
#                 return BatchSerializer(obj.get_local_batches(warehouse), many=True).data
#         return None

#     def get_suppliers(self, obj):
#         #return SupplierSerializer(Supplier.objects.filter(component_relations__component=obj), many=True).data
#         return SupplierRelationSerializer(SupplierRelation.objects.filter(component=obj), many=True).data
    
#     class Meta:
#         model = Component
#         fields = '__all__'

# class StandardResultsSetPagination(PageNumberPagination):
#     page_size = 25
#     page_size_query_param = 'page_size'
#     max_page_size = 100

# # API view for listing components with filtering
# class ComponentListAPIView(generics.ListAPIView):
#     queryset = Component.objects.all()
#     serializer_class = ComponentSerializer
#     pagination_class = StandardResultsSetPagination
#     permission_classes = [IsAuthenticated]
#     filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
#     filter_fields = ['category', 'tags', 'description']
#     search_fields = ['name', 'category__name', 'tags__name', 'warehouse__name', 'description']
#     ordering_fields = ['name', 'category', 'description']

