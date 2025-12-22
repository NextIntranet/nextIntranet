from rest_framework import serializers

from rest_framework.permissions import IsAuthenticated
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination

from nextintranet_warehouse.models import Warehouse
from nextintranet_warehouse.models import Warehouse

from django.views.generic import DetailView, ListView

from django.urls import path, re_path


from ..models.category import Category
from ..models.component import Component
from ..models.component import Supplier, SupplierRelation


import django_tables2 as tables

from nextintranet_backend.views.crud import create_crud_urls
from nextintranet_backend.help.crud import NIT_Table

import datetime


from django.views.generic import View
from django.http import HttpResponse
from django.shortcuts import render, redirect
import json
from django.http import HttpResponse, JsonResponse
from django import forms
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Div, Row


from formtools.wizard.views import WizardView
from formtools.wizard.views import SessionWizardView
import requests




def MouserApiRequest(symbol):
    url = 'https://api.mouser.com/api/v2/search/partnumber'
    headers = {
        'accept': 'application/json',
        'Content-Type': 'application/json'
    }
    
    payload = {
        "SearchByPartRequest": {
            "mouserPartNumber": symbol,
        }
    }
    
    params = {
        'apiKey': '7acf75d7-0670-498a-a784-3dfabcfd2a2d'
    }
    
    try:
        print("=======MOUSER_API_REQUEST=======")
        print("URL: ", url)
        print("Headers: ", headers)
        response = requests.post(url, headers=headers, params=params, json=payload)
        response.raise_for_status()  # Raise an exception for 4XX/5XX responses
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error making request to Mouser API: {e}")
        return {"error": str(e)}

def save_mouser_to_supplier_relation(sr, data):
    info = {}
    info['updated'] = datetime.datetime.now()
    info['stock'] = data.get('AvailabilityInStock')
    info['price_breaks'] = data.get('PriceBreaks')

    return info

def TmeApiRequest(symbol):
    url = 'https://api.tme.eu/Products/GetProducts.json'
    headers = {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        "Token": "3c4ed1810d0631dfab993e660a4203b21a68f076fe03e28d04",
    }
    
    payload = {
        "Token": "3c4ed1810d0631dfab993e660a4203b21a68f076fe03e28d04",
        #"ApiSignature": "5ae40d59a8527aaceadb",
        "Symbol": symbol,
        "Country": "CZ",
        "Language": "en",
        # "Currency": "CZK",
        # "PageSize": 10,
        # "PageNumber": 1        
    }
    
    try:
        print("=======TME_API_REQUEST=======")
        print("URL: ", url)
        print("Headers: ", headers)
        params = payload
        response = requests.get(url, headers=headers, params=params)
        print(response.url)
        response.raise_for_status()  # Raise an exception for 4XX/5XX responses
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error making request to TME API: {e}")
        return {"error": str(e)}







class APIView(View):
    def get(self, request):
        return HttpResponse("Hello, World!")


class ComponentSourceForm(forms.Form):
    create_new = forms.BooleanField(
        label='Create New',
        required=False,
        widget=forms.CheckboxInput(attrs={'class': 'form-check-input'})
    )
    component = forms.ModelChoiceField(
        queryset=Component.objects.all().order_by('name'),  # Update with correct model if needed
        required=False,
        widget=forms.Select(attrs={'class': 'form-select'})
    )
    supplier_api = forms.ModelChoiceField(
        queryset=None,
        widget=forms.Select(attrs={'class': 'form-select'})
    )
    symbol = forms.CharField(
        widget=forms.TextInput(attrs={'class': 'form-control', 'readonly': 'readonly'}),
        required=False
    )
    custom_symbol = forms.CharField(
        label='Custom Symbol/MFPN',
        widget=forms.TextInput(attrs={'class': 'form-control'}),
        required=False
    )

    def __init__(self, *args, **kwargs):
        super(ComponentSourceForm, self).__init__(*args, **kwargs)
        # Update with correct model for supplier API
        self.fields['supplier_api'].queryset =  Supplier.objects.all().order_by('name')

        # Define layout for the form
        self.helper = FormHelper()
        self.helper.form_tag = False
        self.helper.layout = Layout(
            Div(
                Div('create_new', css_class='col-md-4'),
                Div('component', css_class='col-md-8'),
                css_class='row mb-3'
            ),
            Div(
                Div('supplier_api', css_class='col-12'),
                css_class='row mb-3'
            ),
            Div(
                Div('symbol', css_class='col-md-6'),
                Div('custom_symbol', css_class='col-md-6'),
                css_class='row mb-3'
            )
        )

class JSONStructureForm(forms.Form):
    json_data = forms.CharField(
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'rows': 100,
            'readonly': 'readonly'
        }),
        required=False,
        label='Data Structure'
    )
    processed_data = forms.CharField(
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'rows': 100,
            #'readonly': 'readonly'
        }),
        required=False,
        label='Processed Data'
    )
    
    def __init__(self, *args, **kwargs):
        json_structure = kwargs.pop('data', None)
        super(JSONStructureForm, self).__init__(*args, **kwargs)
        
        if json_structure:
            self.fields['json_data'].initial = json.dumps(json_structure, indent=4)
            
        # Create layout for the JSON display
        self.helper = FormHelper()
        self.helper.form_tag = False
        self.helper.layout = Layout(
            Div(
                Div('json_data', css_class='col-12'),
                css_class='row mb-3'
            )
        )


class ComponentFillForm(forms.ModelForm):
    class Meta:
        model = Component
        fields = ['name', 'description', 'category', 'tags', 'unit_type', 'selling_price', 'internal_price', 'primary_image']
        widgets = {
            'description': forms.Textarea(attrs={'rows': 3}),
            'tags': forms.CheckboxSelectMultiple(),
        }


        
class ComponentSourceFormView(View):
    template_name = 'warehouse/api_source/component_source_form.html'
    
    def get(self, request):

        component_id = request.GET.get('component')
        supplier_relation_id = request.GET.get('supplierRelation')

        component = None
        supplier_relation = None

        if component_id:
            try:
                component = Component.objects.get(id=component_id)
            except Component.DoesNotExist:
                print("Component not found")
                pass

        if supplier_relation_id:
            try:
                supplier_relation = SupplierRelation.objects.get(id=supplier_relation_id)
            except SupplierRelation.DoesNotExist:
                print("SupplierRelation not found")
                pass
    
        print("Component: ", component_id)
        print("Component", component)
        print("SupplierRelation: ", supplier_relation_id)
        print("SupplierRelation", supplier_relation)


        initial_data = {}
        if component:
            initial_data['component'] = component
            initial_data['create_new'] = False
        if supplier_relation:
            initial_data['supplier_api'] = supplier_relation.supplier
            initial_data['symbol'] = supplier_relation.symbol
            
        form = ComponentSourceForm(initial=initial_data)
        
        # Disable fields that have initial values
        if component:
            form.fields['component'].disabled = True
            form.fields['create_new'].disabled = True
        if supplier_relation:
            form.fields['supplier_api'].disabled = True
            form.fields['symbol'].disabled = True

        form = ComponentSourceForm(initial=initial_data)

        #form = ComponentSourceForm()
        if request.headers.get('HX-Request'):
            return render(request, 'warehouse/api_source/partials/component_source_form.html', {'form': form})
        return render(request, self.template_name, {'form': form})
    
    def post(self, request):
        form = ComponentSourceForm(request.POST)
        if form.is_valid():
            # Process form data
            if request.headers.get('HX-Request'):
                return HttpResponse(
                    status=200,
                    headers={
                        'HX-Redirect': request.build_absolute_uri('/success/')  # Replace with actual URL
                    }
                )
            return redirect('success_url')  # Replace with actual URL
        
        if request.headers.get('HX-Request'):
            return render(request, 'warehouse/api_source/partials/component_source_form.html', {'form': form})
        return render(request, self.template_name, {'form': form})

class ComponentInfoView(View):
    def get(self, request):
        component_id = request.GET.get('component_id')
        try:
            component = Warehouse.objects.get(id=component_id)
            data = {'symbol': component.symbol}
            return JsonResponse(data)
        except Warehouse.DoesNotExist:
            return JsonResponse({'error': 'Component not found'}, status=404)


class ApiSourceWizardView(SessionWizardView):
    template_name = 'warehouse/api_source/wizard.html'
    form_list = [ComponentSourceForm, JSONStructureForm, ComponentFillForm]
    success_url = '/success/'  # Replace with actual URL

    def done(self, form_list, **kwargs):
        # Process form data
        return redirect(self.success_url)
    

    def get_form_initial(self, step):
        initial = super().get_form_initial(step)
        
        if step == '0': 
            component_id = self.request.GET.get('component')
            supplier_relation_id = self.request.GET.get('supplierRelation')
            
            component = None
            supplier_relation = None
            
            if component_id:
                try:
                    component = Component.objects.get(id=component_id)
                except Component.DoesNotExist:
                    pass
                    
            if supplier_relation_id:
                try:
                    supplier_relation = SupplierRelation.objects.get(id=supplier_relation_id)
                except SupplierRelation.DoesNotExist:
                    pass
                    
            if component:
                initial['component'] = component
                initial['create_new'] = False
            if supplier_relation:
                initial['supplier_api'] = supplier_relation.supplier
                initial['symbol'] = supplier_relation.symbol
        
        if step == '1':
            step_0_data = self.get_cleaned_data_for_step('0')
            if step_0_data:
                supplier = step_0_data.get('supplier_api')
                custom_symbol = step_0_data.get('custom_symbol')
                symbol = step_0_data.get('symbol') or custom_symbol
                # if supplier == 'Mouser':
                print(type(supplier))
                if supplier.name == 'Mouser':
                    json_data = MouserApiRequest(symbol)['SearchResults']['Parts'][0]
                    processed_data = json_data
                    supplier.api_data = save_mouser_to_supplier_relation(supplier, json_data)
                    supplier.save()

                elif supplier.name == 'TME':
                    json_data = TmeApiRequest(symbol)
                    processed_data = json_data

                initial['json_data'] = json.dumps(json_data, indent=4, sort_keys=True) if json_data else "{}"
                initial['processed_data'] = json.dumps(processed_data, indent=4, sort_keys=True) if json_data else "{}"
        
        if step == '2':
            step_0_data = self.get_cleaned_data_for_step('0')
            step_1_data = self.get_cleaned_data_for_step('1')

            print(step_1_data)
            if step_0_data.get('create_new'):
                print("CREATE NEW...")
                processed_data = step_1_data.get('processed_data')
                initial['name'] = step_1_data.get('processed_data').get('ManufacturerPartNumber')

        return initial


    def get_form(self, step=None, data=None, files=None):
        form = super().get_form(step, data, files)
        print("GET FORM", step)
        
        # Current step if not specified
        current_step = step or self.steps.current
        
        if current_step == '0':
            component_id = self.request.GET.get('component')
            supplier_relation_id = self.request.GET.get('supplierRelation')
            
            if component_id:
                try:
                    component = Component.objects.get(id=component_id)
                    form.fields['component'].disabled = True
                    form.fields['create_new'].disabled = True
                except Component.DoesNotExist:
                    pass
                    
            if supplier_relation_id:
                try:
                    supplier_relation = SupplierRelation.objects.get(id=supplier_relation_id)
                    form.fields['supplier_api'].disabled = True
                    form.fields['symbol'].disabled = True
                except SupplierRelation.DoesNotExist:
                    pass
                    
        return form


# /store/api_source?source=<supplier>&component=<id>
urlpatterns = [
    re_path(r'^(?P<step>.+)/$', ApiSourceWizardView.as_view(), name='api_source_step'),
    path('', ApiSourceWizardView.as_view(), name='api_source'),
]