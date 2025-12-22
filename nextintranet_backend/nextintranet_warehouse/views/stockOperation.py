from django import forms
from django.views.generic.edit import FormView
from django.shortcuts import redirect
from django.views.generic.edit import CreateView
#from .models import StockOperation
from nextintranet_warehouse.models.component import StockOperation
from nextintranet_warehouse.models.component import Packet
from django.forms import ModelForm
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from rest_framework import serializers
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.routers import DefaultRouter
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination




class StockOperationForm(forms.ModelForm):
    class Meta:
        model = StockOperation
        fields = ['packet', 'previous_operation', 'operation_type', 'quantity', 'relative_quantity', 'unit_price']
        widgets = {
            'operation_type': forms.Select(attrs={'class': 'form-select'}),
            'quantity': forms.NumberInput(attrs={'class': 'form-control', 'step': 'any'}),
            'relative_quantity': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'unit_price': forms.NumberInput(attrs={'class': 'form-control', 'step': 'any'}),
        }
        help_texts = {
            'quantity': _('Use negative numbers for stock removals.'),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['packet'].queryset = self.fields['packet'].queryset.select_related('component')
        self.fields['packet'].widget.attrs.update({'class': 'form-select'})

        self.fields['previous_operation'].disabled = True
        self.fields['previous_operation'].widget.attrs['readonly'] = True
        self.fields['packet'].disabled = True
        self.fields['packet'].widget.attrs['readonly'] = True

class StockOperationCreateView(FormView):
    template_name = 'warehouse/stock_operation_form.html'
    form_class = StockOperationForm

    def get_initial(self):
        initial = super().get_initial()
        packet_uuid_query = self.kwargs.get('uuid')
        packet = Packet.objects.get(pk=packet_uuid_query)

        initial['packet'] = packet
        initial['previous_operation'] = packet.last_operation
        
        initial['quantity'] = 0
        initial['relative_quantity'] = True
        initial['unit_price'] = 0.0
        return initial


    def form_valid(self, form):
        print("VALIDACE FORMULÁŘE...")
        form.save()
        return redirect('component-detail', uuid=form.instance.packet.component.id)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['operation_types'] = dict(StockOperation.OPERATION_TYPE)
        return context


class StockOperationSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockOperation
        fields = '__all__'

    # def to_representation(self, instance):
    #     data = super().to_representation(instance)
    #     # data['operation_type'] = instance.get_operation_type_display()
    #     # data['created_at'] = instance.created_at.strftime('%Y-%m-%d %H:%M')
    #     # data['packet'] = instance.packet.uuid
    #     return data

    # def to_internal_value(self, data):
    #     data = data.copy()
    #     data['packet'] = Packet.objects.get(uuid=data['packet'])
    #     return data

    # def create(self, validated_data):
    #     return StockOperation.objects.create(**validated_data)

    # def update(self, instance, validated_data):
    #     instance.operation_type = validated_data.get('operation_type', instance.operation_type)
    #     instance.quantity = validated_data.get('quantity', instance.quantity)
    #     instance.relative_quantity = validated_data.get('relative_quantity', instance.relative_quantity)
    #     instance.unit_price = validated_data.get('unit_price', instance.unit_price)
    #     instance.save()
    #     return instance


class StockOperationViewSet(viewsets.ModelViewSet):
    queryset = StockOperation.objects.all()
    serializer_class = StockOperationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['packet', 'operation_type', 'created_at']
    # pagination_class = PageNumberPagination


StockOperationRouter = DefaultRouter()
StockOperationRouter.register(r'', StockOperationViewSet)