from django import forms
from nextintranet_warehouse.models.component import Supplier
from nextintranet_warehouse.models.component import SupplierRelation
from nextintranet_warehouse.models.component import Component
from django.urls import reverse
from django.contrib import messages
from django.views.generic.base import View
from django.views.generic.edit import FormView
from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse
from django.contrib import messages
from django.views.generic.base import View
from django.views.generic.edit import FormView
from django.views.generic.edit import CreateView, UpdateView
from django.views.generic.list import ListView
from django.views.generic.detail import DetailView

from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework import generics
from rest_framework import status

from django.urls import reverse_lazy
from nextintranet_backend.views.crud import create_crud_urls

import django_tables2 as tables

from django_tables2.utils import A
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Div, Field, Row, Column, HTML, Submit
from rest_framework.pagination import PageNumberPagination
from rest_framework import viewsets
from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter
from rest_framework.response import Response


class SupplierModelTable(tables.Table):
    class Meta:
        model = Supplier
        template_name = "django_tables2/bootstrap5-responsive.html"
        fields = ('name', 'contact_info', 'website', 'link_template')
        attrs = {'class': 'table table-striped table-hover'}
    
    name = tables.LinkColumn('supplier-detail', args=[tables.A('pk')], verbose_name='Path')

    
urlpatterns = create_crud_urls(Supplier, base_url="supplier", table_class_object=SupplierModelTable)
print(urlpatterns)


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'

class SupplierRelationSerializer(serializers.ModelSerializer):
    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all(), required=False, allow_null=True)
    url = serializers.SerializerMethodField( read_only=True )

    def get_url(self, obj):
        return obj.url

    class Meta:
        model = SupplierRelation
        fields = '__all__'

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation['supplier'] = SupplierSerializer(instance.supplier).data
        return representation


class SupplierRelationAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = SupplierRelation.objects.all()
    serializer_class = SupplierRelationSerializer
    permission_classes = [IsAuthenticated]


class ComponentSuppliersRelationListAPIView(generics.ListCreateAPIView):
    queryset = SupplierRelation.objects.all()
    serializer_class = SupplierRelationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        component = get_object_or_404(Component, pk=self.kwargs.get('pk'))
        return SupplierRelation.objects.filter(component=component)
    
    def post(self, request, pk, *args, **kwargs):
        component = get_object_or_404(Component, pk=pk)
        supplier = Supplier.objects.all().first()

        serializer = SupplierRelationSerializer(data=request.data)
        serializer.supplier = supplier
        serializer.is_valid(raise_exception=True)
        serializer.save(component=component)

        return Response(serializer.data, status=status.HTTP_201_CREATED)




class ComponentSuppliersRelationCreateAPIView(generics.CreateAPIView):
    queryset = SupplierRelation.objects.all()
    serializer_class = SupplierRelationSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        component = get_object_or_404(Component, pk=self.kwargs.get('pk'))
        serializer.save(component=component)



class CustomPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 1000

class SupplierListCreateAPIView(generics.ListCreateAPIView):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = CustomPagination

class SupplierDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]



################
## TODO: Clean following code, remove unused imports and functions
################

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
        fields = ['component', 'supplier', 'symbol', 'custom_url', 'description', 'api_data']
        widgets = {
            'component': forms.Select(attrs={'class': 'form-control'}),
            'supplier': forms.Select(attrs={'class': 'form-control'}),
            'symbol': forms.TextInput(attrs={'class': 'form-control'}),
            'custom_url': forms.URLInput(attrs={'class': 'form-control'}),
            'description': forms.Textarea(attrs={'class': 'form-control'}),
            'api_data': forms.Textarea(attrs={'class': 'form-control', 'readonly': 'readonly'}),
        }


class SupplierListView(ListView):
    model = Supplier
    template_name = 'warehouse/supplier_list.html'

class SupplierDetailView(View):
    def get(self, request, pk):
        supplier = get_object_or_404(Supplier, pk=pk)
        return redirect(reverse('supplier-edit', kwargs={'pk': pk}))

class SupplierCreateView(CreateView):
    model = Supplier
    template_name = 'warehouse/supplier_edit.html'
    fields = ['name', 'contact_info', 'website', 'link_template', 'min_order_quantity']
    success_url = reverse_lazy('supplier-list')

    def form_valid(self, form):
        messages.success(self.request, 'Supplier created.')
        return super().form_valid(form)
    

class SupplierEditView(UpdateView):
    """View for editing existing supplier information."""
    model = Supplier
    form_class = SupplierForm
    template_name = 'warehouse/supplier_edit.html'
    success_url = reverse_lazy('supplier-list')

    def form_valid(self, form):
        messages.success(self.request, 'Supplier saved.')
        return super().form_valid(form)




class SupplierRelationEditView(FormView):
    template_name = 'warehouse/supplier_relation_edit.html'
    form_class = SupplierRelationForm

    def get_form(self):
        instance_id = self.kwargs.get('uuid')
        instance = get_object_or_404(SupplierRelation, pk=instance_id)
        return self.form_class(instance=instance, **self.get_form_kwargs())

    def form_valid(self, form):
        form.save()
        messages.success(self.request, 'Supplier relation saved.')
        return redirect(reverse('component-detail', kwargs={'uuid': form.cleaned_data['component'].id}))

class SupplierRelationDeleteView(CreateView):
    model = SupplierRelation

    def get(self, request, *args, **kwargs):
        relation = get_object_or_404(SupplierRelation, pk=self.kwargs.get('uuid'))
        component_uuid = relation.component.id
        relation.delete()
        messages.success(self.request, 'Supplier relation deleted.')
        return redirect(reverse('component-detail', kwargs={'uuid': component_uuid}))

class NewSupplierRelationView(CreateView):
    model = SupplierRelation
    form_class = SupplierRelationForm
    template_name = 'warehouse/supplier_relation_edit.html'
    

    def get_initial(self):
        initial = super().get_initial()
        component_uuid = self.kwargs.get('uuid')
        component = get_object_or_404(Component, pk=component_uuid)
        initial['component'] = component
        return initial

    def get_form(self, form_class=None):
        form = super().get_form(form_class)
        form.fields['component'].widget.attrs['readonly'] = True
        # form.fields['component'].widget.attrs['disabled'] = True
        return form
    
    def form_valid(self, form):
        component_uuid = self.kwargs.get('uuid')
        component = get_object_or_404(Component, pk=component_uuid)
        form.instance.component = component
        messages.success(self.request, 'New supplier relation created.')
        #return super().form_valid(form)
        form.save()
        return redirect(reverse('component-detail', kwargs={'uuid': component_uuid}))

    ##########
    ########## API
    ##########

class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = CustomPagination


class SupplierRelationViewSet(viewsets.ModelViewSet):
    queryset = SupplierRelation.objects.all()
    serializer_class = SupplierRelationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = CustomPagination


SupplierRouter = DefaultRouter(trailing_slash=True)
SupplierRouter.register(r'', SupplierViewSet)

SupplierRelationRouter = DefaultRouter(trailing_slash=True)
SupplierRelationRouter.register(r'', SupplierRelationViewSet)
