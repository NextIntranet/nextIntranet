from rest_framework import serializers

from rest_framework.permissions import IsAuthenticated
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination

from django.forms import ModelForm
from django.views.generic.edit import FormView

from rest_framework import serializers

from nextintranet_warehouse.models import Warehouse
from nextintranet_warehouse.models import Warehouse

from django.views.generic import DetailView, ListView

from ..models.warehouse import Warehouse
from ..models.component import Component, Supplier, SupplierRelation, Packet
from rest_framework.response import Response

from django.views.generic.edit import CreateView
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.contrib import messages
from django import forms

from .category import CategorySerializer
from .document import DocumentSerializer
from .warehouse import WarehouseSerializer


class PacketSerializer(serializers.ModelSerializer):
    location = WarehouseSerializer()
    class Meta:
        model = Packet
        fields = '__all__'

class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'

class SupplierRelationSerializer(serializers.ModelSerializer):
    supplier = SupplierSerializer()
    url = serializers.SerializerMethodField()
    class Meta:
        model = SupplierRelation
        fields = '__all__'
    
    def get_url(self, obj):
        return obj.url

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            'total_count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data
        })


class ComponentSerializer(serializers.ModelSerializer):
    category = CategorySerializer()
    primary_image = DocumentSerializer()
    packets = PacketSerializer(many=True)
    suppliers = SupplierRelationSerializer(many=True)

    class Meta:
        model = Component
        fields = '__all__'

class ComponentListAPIView(generics.ListAPIView):
    queryset = Component.objects.all()
    serializer_class = ComponentSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAuthenticated]

class ComponentDetailAPIView(generics.RetrieveAPIView):
    queryset = Component.objects.all()
    serializer_class = ComponentSerializer
    # lookup_field = ['id']
    permission_classes = [IsAuthenticated]



from django_select2.forms import ModelSelect2Widget, Select2Widget


class PacketForm(forms.ModelForm):
    """Form for creating and updating Packet instances."""
    
    class Meta:
        """Meta class to specify the model and fields."""
        
        model = Packet
        fields = ['component', 'location', 'is_trackable', 'description']


    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

class PacketNewView(CreateView):
    model = Packet
    form_class = PacketForm
    template_name = 'warehouse/packet_edit.html'

    def get_initial(self):
        initial = super().get_initial()
        component_uuid = self.kwargs.get('uuid')
        component = get_object_or_404(Component, pk=component_uuid)
        initial['component'] = component
        return initial
    
    def get_form(self, form_class=None):
        form = super().get_form(form_class)
        form.fields['component'].widget.attrs['readonly'] = True
        return form

    def form_valid(self, form):
        component_uuid = self.kwargs.get('uuid')
        form.save()
        messages.success(self.request, 'Packet created.')
        return redirect(reverse('component-detail', kwargs={'uuid': component_uuid}))
    
class PacketEditView(FormView):
    template_name = 'warehouse/packet_edit.html'
    form_class = PacketForm

    def get_form(self):
        instance_id = self.kwargs.get('uuid')
        instance = get_object_or_404(Packet, pk=instance_id)
        return self.form_class(instance=instance, **self.get_form_kwargs())

    def form_valid(self, form):
        form.save()
        messages.success(self.request, 'Packet saved.')
        return redirect(reverse('component-detail', kwargs={'uuid': form.cleaned_data['component'].id}))
    
class PacketDeleteView(CreateView):
    model = Packet

    def get(self, request, *args, **kwargs):
        packet = get_object_or_404(Packet, pk=self.kwargs.get('uuid'))
        component_uuid = packet.component.id
        packet.delete()
        messages.success(self.request, 'Packet deleted.')
        return redirect(reverse('component-detail', kwargs={'uuid': component_uuid}))
    



from django.forms.models import inlineformset_factory
from nextintranet_warehouse.models.component import ComponentParameter, ParameterType

from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Row, Column
from django.views.generic.edit import FormView
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.shortcuts import render



class ComponentParameterForm(forms.ModelForm):
    class Meta:
        model = ComponentParameter
        fields = ['parameter_type', 'value']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.layout = Layout(
            Row(
                Column('parameter_type', css_class="form-group col-md-6"),
                Column('value', css_class="form-group col-md-6"),
            )
        )

ComponentParameterFormSet = inlineformset_factory(
    Component,
    ComponentParameter,
    fields=('parameter_type', 'value'),
    extra=1,
    can_delete=True
    )



class ComponentParameterEditView(FormView):
    template_name = 'warehouse/parameters_edit.html'
    template_partial_name = 'warehouse/parameters_edit_partial.html'
    model = Component
    inline_model = ComponentParameter
    form_class = ComponentParameterForm
    formset_extra = 1  # Počet prázdných řádků pro nové parametry
    formset_can_delete = True  # Umožňuje mazání parametrů

    def dispatch(self, request, *args, **kwargs):
        """Načte hlavní objekt (Component)."""
        self.component = get_object_or_404(self.model, id=kwargs['uuid'])
        return super().dispatch(request, *args, **kwargs)

    def get_formset(self, data=None):
        """Vytvoří inline formset."""
        InlineFormset = inlineformset_factory(
            self.model,
            self.inline_model,
            form=self.form_class,
            extra=self.formset_extra,
            can_delete=self.formset_can_delete
        )
        return InlineFormset(instance=self.component, data=data)
    
    def get(self, request, *args, **kwargs):
        """Obsluhuje GET požadavek - načte formset."""
        formset = self.get_formset()
        return self.render_to_response(formset, self.template_name)

    def post(self, request, *args, **kwargs):
        """Obsluhuje POST požadavek - uloží změny ve formsetu."""
        formset = self.get_formset(data=request.POST)
        print("POST")
        print(request.POST)
        print(formset.is_valid())
        if formset.is_valid():
            instances = formset.save(commit=False)
            print("Instances:", instances)
            for instance in instances:
                instance.component = self.component
                instance.save()
            # Zpracování smazaných objektů
            print("Objects to delete:", formset.deleted_objects)
            for instance in formset.deleted_objects:
                instance.delete()
            return self.render_to_response(formset, self.template_partial_name)
        else:
            # Debugging: vypíšeme chyby
            print("Formset errors:", formset.errors)
            print("Non-form errors:", formset.non_form_errors())
        return self.render_to_response(formset, self.template_partial_name)

    def render_to_response(self, formset, template):
        formset = self.get_formset()
        return render(self.request, template, {
            'formset': formset,
            'component': self.component,
        })



def add_row(request, uuid):
    component = get_object_or_404(Component, id=uuid)
    InlineFormset = inlineformset_factory(
        Component,
        ComponentParameter,
        form=ComponentParameterForm,
        extra=1,
        can_delete=True
    )
    empty_form = InlineFormset(instance=component).empty_form
    return render(request, 'warehouse/parameter_row.html', {'form': empty_form})
