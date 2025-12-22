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