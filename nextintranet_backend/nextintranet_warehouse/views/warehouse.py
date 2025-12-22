from rest_framework import serializers

from rest_framework.permissions import IsAuthenticated
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination

from rest_framework import serializers
from django.db.models import Q



from nextintranet_warehouse.models import Warehouse
from nextintranet_warehouse.models.category import Category
from nextintranet_warehouse.models.component import Component, Tag, Document, SupplierRelation, ComponentParameter

from django.views.generic import DetailView, ListView

from ..models.warehouse import Warehouse
from ..models.component import Component

from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import serializers
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination



from django.core.paginator import Paginator
from django.shortcuts import render

from nextintranet_warehouse.models.component import Component
from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Submit
from django.forms import modelformset_factory
from django.shortcuts import redirect
from django.views.generic.edit import FormView
from django.shortcuts import get_object_or_404

from django_select2.forms import Select2MultipleWidget, Select2Widget
from django_filters import rest_framework as filters
from crispy_forms.layout import Layout, Row, Column, Field
from django.forms import inlineformset_factory
from nextintranet_warehouse.models.component import Component, Packet
from django.forms import ModelForm

from django.forms import formset_factory
from django.views.generic.edit import FormView
from crispy_forms.layout import Fieldset, HTML
from crispy_forms.utils import render_field

from mptt.models import MPTTModel



class HomeView(ListView):
    permission_classes = [IsAuthenticated]
    template_name = 'warehouse/home.html'
    model = Component
    context_object_name = 'components'
    paginate_by = 25



class StandardResultsSetPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100

# Serializer for Warehouse model
class WarehouseSerializer(serializers.ModelSerializer):
    full_path = serializers.CharField()
    class Meta:
        model = Warehouse
        # fields = '__all__'  # zachováme všechna pole modelu
        exclude = ['lft', 'rght', 'tree_id', 'level']
    
    def get_full_path(self, obj):
        return obj.full_path

class WarehousePositionsListAPIView(generics.ListAPIView):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    permission_classes = [IsAuthenticated]

class WarehousePositionsDetailAPIView(generics.RetrieveAPIView):
    def get_queryset(self):
        return Warehouse.objects.filter(uuid=self.kwargs['uuid'])
    serializer_class = WarehouseSerializer
    permission_classes = [IsAuthenticated]


    from rest_framework import serializers



# TODO: this is not working
class WarehouseTreeSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = Warehouse
        fields = ('id','uuid','name','location','can_store_items','description','full_path','children')

    def get_children(self, obj):
        qs = obj.sub_units.all().order_by('name')
        return WarehouseTreeSerializer(qs, many=True).data


class WarehousePositionsTreeAPIView(generics.ListAPIView):
    serializer_class = WarehouseTreeSerializer

    def get_queryset(self):
        return Warehouse.objects.filter(parent__isnull=True)\
                                .order_by('name')\
                                .prefetch_related('sub_units')

def item_list(request):
    items = Component.objects.all()

    query = request.GET.get('q', '')

    # Filtrování na základě vyhledávacího dotazu
    if query:
        print("Query:", query)
        items = items.filter(
            Q(name__icontains=query) | Q(description__icontains=query)
        )

    paginator = Paginator(items, 20)
    page_number = request.GET.get('page', 1)
    page = paginator.get_page(page_number)

    if request.headers.get('Hx-Request'):
        return render(request, 'warehouse/stock/component_list/item_card.html', {'page': page})

    return render(request, 'warehouse/stock/items_list.html', {'page': page})


class ComponentFilter(filters.FilterSet):
    q = filters.CharFilter(method='search_filter', label='Search')
    category = filters.ModelChoiceFilter(queryset=Category.objects.all())
    tags = filters.ModelMultipleChoiceFilter(queryset=Tag.objects.all())

    class Meta:
        model = Component
        fields = ['q', 'category', 'tags']

    def search_filter(self, queryset, name, value):
        if value:
            return queryset.filter(
                Q(name__icontains=value) | Q(description__icontains=value) | Q(suppliers__symbol__icontains=value)
            ).distinct()
        return queryset

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.form.fields['tags'].widget = Select2MultipleWidget()


class ComponentListView(ListView):
    model = Component
    template_name = 'warehouse/stock/items_list.html'
    paginate_by = 5
    # context_object_name = 'items'
    filterset_class = ComponentFilter


    def get_queryset(self):
        queryset = super().get_queryset()
        self.filterset = ComponentFilter(self.request.GET, queryset=queryset)
        return self.filterset.qs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['form'] = self.filterset.form

        query_params = self.request.GET.copy()
        query_params.pop('page', None)
        context['query_string'] = query_params.urlencode()
        return context

    def render_to_response(self, context, **response_kwargs):
        # If it's an HTMX request, return only the partial template
        if self.request.headers.get('Hx-Request'):
            self.template_name = 'warehouse/stock/component_list/item_card.html'
        return super().render_to_response(context, **response_kwargs)

class ComponentDetailView(DetailView):
    model = Component
    template_name = 'warehouse/stock/item_detail.html'
    context_object_name = 'item'
    pk_url_kwarg = 'uuid'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['title'] = 'Detail komponenty'
        context['packet'] = self.request.GET.get('packet', None)
        return context
    



class PacketForm(ModelForm):
    class Meta:
        model = Packet
        fields = ['description']


PacketFormSet = inlineformset_factory(
    Component,
    Packet,
    form=PacketForm,
    extra=1,
    can_delete=True
)

    
class ComponentForm(forms.ModelForm):
    """
    Form for creating and updating a single Component instance.
    """

    #packets = formset_factory(PacketForm, extra=1, can_delete=True)
    # packets = inlineformset_factory(Component, Packet, form=PacketForm, extra=1, can_delete=True)

    class Meta:
        model = Component
        fields = ['name', 'description', 'category', 'tags', 'unit_type', 'selling_price', 'internal_price', 'primary_image']

        widgets = {
            'description': forms.Textarea(attrs={'rows': 3}),
            'tags': Select2MultipleWidget(),
            #'category': forms.Select(attrs={'class': 'form-select'}),
            'category': Select2Widget(),
            'unit_type': forms.Select(attrs={'class': 'form-select'}),
            'selling_price': forms.NumberInput(attrs={'class': 'form-control'}),
            'internal_price': forms.NumberInput(attrs={'class': 'form-control'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.add_input(Submit('submit', 'Save'))

        # Set up the form layout
        self.helper.layout = Layout(
            Row(
                Column('name', css_class='col-md-4')
            ),
            Row(
                Column('category', css_class='col-md-4'),
                Column('tags', css_class='col-md-4'),
                css_class='form-row'
            ),
            Row(
                Column('description', css_class='col-md-12'),
                css_class='form-row'
            ),
            Row(
                Column('unit_type', css_class='col-md-2'),
                Column('selling_price', css_class='col-md-2'),
                Column('internal_price', css_class='col-md-2'),
                css_class='form-row'
            ),
        )



# Zobrazení pro editaci jedné 
class ComponentEditView(FormView):
    template_name = 'warehouse/stock/component_edit.html'
    form_class = ComponentForm

    def get_form(self, *args, **kwargs):
        component_id = self.kwargs.get('uuid')
        instance = get_object_or_404(Component, pk=component_id)
        return self.form_class(instance=instance, **self.get_form_kwargs())

    def form_valid(self, form):
        form.save()
        return redirect('component-detail', uuid=form.instance.id)

    def form_invalid(self, form):
        return self.render_to_response(self.get_context_data(form=form))
