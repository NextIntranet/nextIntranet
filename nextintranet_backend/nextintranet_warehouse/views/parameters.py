from ..models.component import ParameterType
from django.views.generic import ListView
from django.views.generic.edit import CreateView
from django.views.generic.edit import UpdateView
from django.views.generic.edit import DeleteView
from django_filters.rest_framework import DjangoFilterBackend
from django.urls import reverse_lazy
from django.shortcuts import render
from django.http import HttpResponseRedirect


import django_tables2 as tables 
from django_tables2.views import SingleTableView
import itertools

from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework import generics


from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Div, Field, Row, Column, HTML, Submit
from rest_framework.pagination import PageNumberPagination
from rest_framework import viewsets
from rest_framework.routers import DefaultRouter
from rest_framework.response import Response
from rest_framework import status
from django_filters.rest_framework import DjangoFilterBackend


from nextintranet_backend.views.crud import create_crud_urls
from nextintranet_backend.help.crud import NIT_Table

from ..models.component import ParameterType, ComponentParameter, Component

class ParameterTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParameterType
        fields = '__all__'

# class ParameterTypeListAPIView(generics.ListAPIView):
#     queryset = ParameterType.objects.all()
#     serializer_class = ParameterTypeSerializer
#     permission_classes = [IsAuthenticated]

# class ParameterTypeDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
#     queryset = ParameterType.objects.all()
#     serializer_class = ParameterTypeSerializer
#     permission_classes = [IsAuthenticated]

# class ParameterTypeModelTable(NIT_Table):
#     class Meta(NIT_Table.Meta):
#         model = ParameterType

#     id = tables.LinkColumn('warehouse-detail', args=[tables.A('pk')], verbose_name='Id')

class ParameterTypeViewSet(viewsets.ModelViewSet):
    queryset = ParameterType.objects.all()
    serializer_class = ParameterTypeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['name', 'description']
    pagination_class = PageNumberPagination


class ComponentParameterSerializer(serializers.ModelSerializer):

    parameter_type = serializers.PrimaryKeyRelatedField(
        queryset=ParameterType.objects.all(),
        required=False,
        allow_null=True
    )
    class Meta:
        model = ComponentParameter
        fields = '__all__'
    
    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.parameter_type:
            data['parameter_type'] = ParameterTypeSerializer(instance.parameter_type).data

        return data


class ComponentParameterListAPIView(generics.ListCreateAPIView):
    serializer_class = ComponentParameterSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        component_id = self.kwargs.get('pk')
        return ComponentParameter.objects.filter(component_id=component_id)
    


class ComponentParameterDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ComponentParameterSerializer
    # permission_classes = [IsAuthenticated]

    def get_queryset(self):
        parameter_id = self.kwargs.get('pk')
        queryset = ComponentParameter.objects.all()
        queryset = queryset.filter(id=parameter_id)
        return queryset


# urlpatterns = create_crud_urls(ParameterType, base_url="parametertype", table_class_object=ParameterTypeModelTable)
# print(urlpatterns)





class ParameterViewSet(viewsets.ModelViewSet):
    queryset = ComponentParameter.objects.all()
    serializer_class = ComponentParameterSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['component', 'parameter_type']


ParameterRouter = DefaultRouter()
ParameterRouter.register(r'', ParameterViewSet)


ParameterTypeRouter = DefaultRouter()
ParameterTypeRouter.register(r'', ParameterTypeViewSet)
