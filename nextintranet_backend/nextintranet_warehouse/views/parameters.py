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
from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter
from rest_framework.response import Response
from rest_framework import status
from django_filters.rest_framework import DjangoFilterBackend


from nextintranet_backend.views.crud import create_crud_urls
from nextintranet_backend.help.crud import NIT_Table

from ..models.component import ParameterType, ComponentParameter, Component
from ..services.parameter_values import coerce_decimal_for_storage, format_parameter_display_value


def _normalize_boolean_value(raw_value):
    if raw_value is None:
        return None
    normalized = str(raw_value).strip().lower()
    if normalized in {'true', '1', 'yes', 'on'}:
        return 'true'
    if normalized in {'false', '0', 'no', 'off'}:
        return 'false'
    return None


class ParameterTypeSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        value_type = attrs.get('value_type')
        if value_type is None and self.instance is not None:
            value_type = self.instance.value_type
        if value_type != 'number':
            attrs['format_with_si_prefix'] = False
        return attrs

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
        read_only_fields = ('value_number', 'is_inherited', 'source_rule')

    def validate(self, attrs):
        parameter_type = attrs.get('parameter_type')
        if parameter_type is None and self.instance is not None:
            parameter_type = self.instance.parameter_type

        value = attrs.get('value')
        if 'value' not in attrs and self.instance is not None:
            value = self.instance.value

        if parameter_type and parameter_type.value_type == 'number':
            try:
                attrs['value_number'] = coerce_decimal_for_storage(value, strict=True)
            except ValueError as exc:
                raise serializers.ValidationError({'value': str(exc)})
        elif parameter_type and parameter_type.value_type == 'bool':
            normalized_bool = _normalize_boolean_value(value)
            if normalized_bool is None:
                if value is None or str(value).strip() == '':
                    normalized_bool = 'false'
                else:
                    raise serializers.ValidationError(
                        {'value': "Expected a boolean value: true/false."}
                    )
            attrs['value'] = normalized_bool
            attrs['value_number'] = None
        else:
            attrs['value_number'] = None

        return attrs
    
    def update(self, instance, validated_data):
        # If editing an inherited param, convert it to manual
        if instance.is_inherited:
            instance.is_inherited = False
            instance.source_rule = None
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.parameter_type:
            data['parameter_type'] = ParameterTypeSerializer(instance.parameter_type).data
        data['display_value'] = format_parameter_display_value(
            instance.value,
            instance.value_number,
            instance.parameter_type,
        )
        data['is_inherited'] = instance.is_inherited

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


ParameterRouter = DefaultRouter(trailing_slash=True)
ParameterRouter.register(r'', ParameterViewSet)


ParameterTypeRouter = DefaultRouter(trailing_slash=True)
ParameterTypeRouter.register(r'', ParameterTypeViewSet)
