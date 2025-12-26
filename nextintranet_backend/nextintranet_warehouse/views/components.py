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

from django.db import models
from django.db.models import Q

from ..models.component import Component
from ..models.purchase import PurchaseRequest
from ..models.component import Tag
from ..models.category import Category
from .category import CategorySerializer
from .document import DocumentSerializer
from django.conf import settings
from urllib.parse import urlparse
from .warehouse import WarehouseSerializer
from .tags import TagSerializer
from .parameters import ComponentParameterSerializer
import django_tables2 as tables

from django_select2.forms import ModelSelect2Widget, Select2Widget

from nextintranet_backend.views.crud import create_crud_urls
from nextintranet_backend.help.crud import NIT_Table



from django.forms.models import inlineformset_factory
from nextintranet_warehouse.models.component import ComponentParameter, ParameterType

from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Row, Column
from django.views.generic.edit import FormView
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.shortcuts import render


from django.shortcuts import redirect, render, get_object_or_404
from django.views.generic.edit import CreateView
from django.urls import reverse_lazy
from ..models.component import Component
from ..forms.components import ComponentForm, ComponentParameterFormSet, DocumentFormSet, SupplierRelationFormSet, PacketFormSet




class ComponentTableView(NIT_Table):
    class Meta(NIT_Table.Meta):
        model = Component
        #fields = ('id', 'name', 'description', 'category')

    id = tables.LinkColumn('component-detail', args=[tables.A('pk')], verbose_name='ID')

urlpatterns = create_crud_urls(Component, table_class_object=ComponentTableView)



class ComponentForm(forms.ModelForm):
    class Meta:
        model = Component
        fields = ['name', 'description', 'category', 'primary_image']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'description': forms.Textarea(attrs={'class': 'form-control'}),
            'category': ModelSelect2Widget(model=Component, search_fields=['name__icontains']),
            'primary_image': ModelSelect2Widget(model=Component, search_fields=['name__icontains']),
        }



class PacketSerializer(serializers.ModelSerializer):
    location = WarehouseSerializer()
    class Meta:
        model = Packet
        fields = '__all__'

    def to_representation(self, instance):
        if instance.count == 0 and instance.operations.exists():
            instance.calculate()
        return super().to_representation(instance)

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

def get_url(self, obj):
    return obj.url

class ComponentSerializer(serializers.ModelSerializer):
    documents = DocumentSerializer(many=True, read_only=True)
    primary_image_url = serializers.SerializerMethodField()
    inventory_summary = serializers.SerializerMethodField()

    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all()
    )

    tags = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(),
        many=True
    )

    packets = PacketSerializer(many=True, read_only=True)
    suppliers = SupplierRelationSerializer(many=True, read_only=True)
    
    def get_primary_image_url(self, instance):
        primary_document = instance.documents.filter(is_primary=True).order_by('id').first()
        if primary_document:
            url = primary_document.get_url
        else:
            url = instance.primary_image
        if not url:
            return None

        public_endpoint = getattr(settings, 'S3_PUBLIC_ENDPOINT_URL', None)
        internal_endpoint = getattr(settings, 'S3_ENDPOINT_URL', None)
        bucket = getattr(settings, 'S3_STORAGE_BUCKET_NAME', None)
        if not public_endpoint:
            public_endpoint = getattr(settings, 'AWS_S3_PUBLIC_ENDPOINT_URL', None)
        if not internal_endpoint:
            internal_endpoint = getattr(settings, 'AWS_S3_ENDPOINT_URL', None)
        if not bucket:
            bucket = getattr(settings, 'AWS_STORAGE_BUCKET_NAME', None)

        if public_endpoint and internal_endpoint and url.startswith(internal_endpoint):
            return public_endpoint.rstrip('/') + url[len(internal_endpoint):]

        parsed = urlparse(url)
        path = parsed.path or ''
        if public_endpoint and bucket and path.startswith('/documents/'):
            return f"{public_endpoint.rstrip('/')}/{bucket}{path}"

        return url

    def get_inventory_summary(self, instance):
        total_quantity = 0
        reserved_quantity = instance.reservations.aggregate(
            total_reserved=models.Sum('quantity')
        )['total_reserved'] or 0
        for packet in instance.packets.all():
            if packet.count == 0 and packet.operations.exists():
                packet.calculate()
            total_quantity += packet.count or 0
        purchase_quantity = PurchaseRequest.objects.filter(
            component=instance,
            purchase__isnull=True,
        ).aggregate(total_requested=models.Sum('quantity'))['total_requested'] or 0
        return {
            'total_quantity': float(total_quantity),
            'reserved_quantity': float(reserved_quantity),
            'purchase_quantity': float(purchase_quantity),
        }


    def to_representation(self, instance):
        data = super().to_representation(instance)

        data['category'] = CategorySerializer(instance.category).data
        data['tags'] = TagSerializer(instance.tags, many=True).data
        return data

    class Meta:
        model = Component
        fields = '__all__'



class ComponentListAPIView(generics.ListAPIView):
    serializer_class = ComponentSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Component.objects.all()
        name = self.request.query_params.get('name', None)
        description = self.request.query_params.get('description', None)
        search = self.request.query_params.get('search', None)
        categories = self.request.query_params.get('categories', None)
        locations = self.request.query_params.get('locations', None)
        if categories:
            categories = categories.split(',')
            categories = Category.objects.filter(id__in=categories)
        
        filters = []
        if categories:
            filters.append(Q(category__in=categories))

        if search:
            filters.append(
            Q(name__icontains=search) |
            Q(description__icontains=search) |
            Q(id__icontains=search)
            )
        
        if name:
            filters.append(Q(name__icontains=name))
        
        if description:
            filters.append(Q(description__icontains=description))

        if locations:
            locations = locations.split(',')
            locations = Warehouse.objects.filter(id__in=locations).get_descendants(include_self=True).distinct() 
            filters.append(Q(packets__location__in=locations))

        if filters:
            queryset = queryset.filter(*filters)
        return queryset.order_by('id')



class ComponentDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Component.objects.all()
    serializer_class = ComponentSerializer
    permission_classes = [IsAuthenticated]


class PacketForm(forms.ModelForm):
    """Form for creating and updating Packet instances."""

    class Meta:
        """Meta class to specify the model and fields."""

        model = Packet
        fields = ['component', 'location', 'is_trackable', 'description']


    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

class ComponentParameterListAPIView(generics.ListCreateAPIView):
    queryset = ComponentParameter.objects.all()
    serializer_class = ComponentParameterSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        component_id = self.kwargs.get('pk')
        queryset = ComponentParameter.objects.all()
        if component_id:
            queryset = queryset.filter(component=component_id)
        return queryset

    def post(self, request, pk, *args, **kwargs):
        component = get_object_or_404(Component, pk=pk)
        data = request.data.copy()
        # Ensure component is set in payload
        if not data.get('component'):
            data['component'] = str(component.id)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=201, headers=headers)

class ComponentParameterCreateAPIView(generics.CreateAPIView):
    queryset = ComponentParameter.objects.all()
    serializer_class = ComponentParameterSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        component_id = self.kwargs.get('pk')
        component = get_object_or_404(Component, pk=component_id)
        
        cp = ComponentParameter(
            component=component,
            parameter_type = ParameterType.objects.all().first(),
        )
        
        cp.save()

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





class SupplierForm(forms.ModelForm):
    class Meta:
        model = Supplier
        fields = ['name', 'contact_info', 'website', 'link_template', 'min_order_quantity']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'contact_info': forms.Textarea(attrs={'class': 'form-control'}),
            'website': forms.URLInput(attrs={'class': 'form-control'}),
            'link_template': forms.TextInput(attrs={'class': 'form-control'}),
            'min_order_quantity': forms.NumberInput(attrs={'class': 'form-control'}),
        }


class SupplierRelationForm(forms.ModelForm):
    class Meta:
        model = SupplierRelation
        fields = ['component', 'supplier', 'symbol', 'custom_url' , 'description', 'api_data']
        widgets = {
            'component': forms.Select(attrs={'class': 'form-control'}),
            'supplier': forms.Select(attrs={'class': 'form-control'}),
            'symbol': forms.TextInput(attrs={'class': 'form-control'}),
            'description': forms.Textarea(attrs={'class': 'form-control'}),
            'api_data': forms.Textarea(attrs={'class': 'form-control', 'readonly': 'readonly'}),
        }


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


class ComponentParameterEditView(FormView):
    template_name = 'warehouse/parameters_edit.html'
    template_partial_name = 'warehouse/parameters_edit_partial.html'
    model = Component
    inline_model = ComponentParameter
    form_class = ComponentParameterForm
    formset_extra = 1
    formset_can_delete = True

    def dispatch(self, request, *args, **kwargs):
        """Načte hlavní objekt (Component)."""
        self.component = get_object_or_404(self.model, id=kwargs['uuid'])
        return super().dispatch(request, *args, **kwargs)

    def get_formset(self, data=None):
        InlineFormset = inlineformset_factory(
            self.model,
            self.inline_model,
            form=self.form_class,
            extra=self.formset_extra,
            can_delete=self.formset_can_delete
        )
        return InlineFormset(instance=self.component, data=data)

    def get(self, request, *args, **kwargs):
        formset = self.get_formset()
        return self.render_to_response(formset, self.template_name)

    def post(self, request, *args, **kwargs):
        formset = self.get_formset(data=request.POST)
        if formset.is_valid():
            instances = formset.save(commit=False)
            for instance in instances:
                instance.component = self.component
                instance.save()
            # Zpracování smazaných objektů
            for instance in formset.deleted_objects:
                instance.delete()
            # For HTMX requests - return partial template
            if request.headers.get('HX-Request'):
                return self.render_to_response(formset, self.template_partial_name)
            return redirect('component-detail', uuid=self.component.id)
        else:
            # Return errors in the appropriate template
            template = self.template_partial_name if request.headers.get('HX-Request') else self.template_name
            return self.render_to_response(formset, template)

    def render_to_response(self, formset, template):
        # Use the provided formset instead of creating a new one
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



class ComponentCreateView(CreateView):
    model = Component
    form_class = ComponentForm
    template_name = "warehouse/component/component_form.html"
    success_url = reverse_lazy("component-list")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        if self.request.POST:
            context["parameter_formset"] = ComponentParameterFormSet(self.request.POST)
            context["document_formset"] = DocumentFormSet(self.request.POST, self.request.FILES)
            context["supplier_formset"] = SupplierRelationFormSet(self.request.POST)
            context["packet_formset"] = PacketFormSet(self.request.POST)
        else:
            context["parameter_formset"] = ComponentParameterFormSet()
            context["document_formset"] = DocumentFormSet()
            context["supplier_formset"] = SupplierRelationFormSet()
            context["packet_formset"] = PacketFormSet()
        return context

    def form_valid(self, form):
        context = self.get_context_data()
        parameter_formset = context["parameter_formset"]
        document_formset = context["document_formset"]
        supplier_formset = context["supplier_formset"]
        packet_formset = context["packet_formset"]

        if (parameter_formset.is_valid() and document_formset.is_valid() and
            supplier_formset.is_valid() and packet_formset.is_valid()):
            self.object = form.save()
            parameter_formset.instance = self.object
            parameter_formset.save()
            document_formset.instance = self.object
            document_formset.save()
            supplier_formset.instance = self.object
            supplier_formset.save()
            packet_formset.instance = self.object
            packet_formset.save()
            return redirect(self.object.get_absolute_url())
        else:
            return self.render_to_response(self.get_context_data(form=form))
