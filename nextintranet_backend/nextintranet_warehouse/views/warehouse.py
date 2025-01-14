from rest_framework import serializers

from rest_framework.permissions import IsAuthenticated
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination

from rest_framework import serializers
from django.db.models import Q



from nextintranet_warehouse.models import Warehouse
from nextintranet_warehouse.models import Warehouse

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

from django_select2.forms import Select2MultipleWidget



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



def item_list(request):
    items = Component.objects.all()

    query = request.GET.get('q', '')  # Získání vyhledávacího dotazu

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


class ComponentListView(ListView):
    model = Component
    template_name = 'warehouse/stock/items_list.html'
    # context_object_name = 'items'
    # paginate_by = 20

    def get_queryset(self):
        query = self.request.GET.get('q', '')  # Získání vyhledávacího dotazu
        items = Component.objects.all()

        # Filtrování na základě vyhledávacího dotazu
        if query:
            items = items.filter(
                Q(name__icontains=query) | Q(description__icontains=query)
            )

        return items.order_by('id')

    def render_to_response(self, context, **response_kwargs):
        # Pokud HTMX požaduje data, vrátíme částečnou šablonu
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
    
class ComponentForm(forms.ModelForm):
    """
    Form for creating and updating a single Component instance.
    """

    class Meta:
        model = Component
        fields = ['name', 'description', 'category', 'tags', 'unit_type', 'selling_price', 'internal_price']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.add_input(Submit('submit', 'Save'))



# Zobrazení pro editaci jedné instance
class ComponentEditView(FormView):
    template_name = 'warehouse/stock/component_edit.html'  # Cesta k šabloně
    form_class = ComponentForm

    def get_form(self, *args, **kwargs):
        # Získej instanci modelu Component na základě ID
        component_id = self.kwargs.get('uuid')
        instance = get_object_or_404(Component, pk=component_id)
        return self.form_class(instance=instance, **self.get_form_kwargs())

    def form_valid(self, form):
        form.save()  # Ulož změny do databáze
        return redirect('component-detail', uuid=form.instance.id)  # Přesměruj na seznam komponent

    def form_invalid(self, form):
        return self.render_to_response(self.get_context_data(form=form))
