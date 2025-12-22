from django.views import View
from django import forms
from django.urls import path
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render, redirect
from nextintranet_warehouse.models.component import Supplier, Component
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Submit, Field
from django.views.generic.edit import FormView



class ComponentCreateForm(forms.Form):
    api = forms.ModelChoiceField(queryset=Supplier.objects.all(), label='API (Supplier)')
    symbol_mfpn = forms.CharField(label='Symbol/MFPN', max_length=100)
    data_preview = forms.CharField(widget=forms.Textarea(attrs={'rows': 6}), label='Data Preview', required=False)
    create_component = forms.BooleanField(label='Create Component', required=False)
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.form_method = 'post'
        self.helper.layout = Layout(
            Field('api'),
            Field('symbol_mfpn'),
            Submit('submit', 'Create Component', css_class='btn btn-primary')
        )
    api = forms.ModelChoiceField(queryset=Supplier.objects.all(), label='API (Supplier)')
    symbol_mfpn = forms.CharField(label='Symbol/MFPN', max_length=100)

    def clean(self):
        cleaned_data = super().clean()
        api = cleaned_data.get('api')
        symbol_mfpn = cleaned_data.get('symbol_mfpn')
        
        if api and symbol_mfpn:
            # You would typically validate the symbol_mfpn with the selected API here
            # This is a placeholder for the actual validation logic
            
            # For example, you might check if the symbol_mfpn exists in the API's database
            # If not valid, raise a validation error:
            # raise forms.ValidationError("This symbol/MFPN is not valid for the selected supplier.")
            
            # You could also populate the data_preview field here based on the API response
            pass
        
        return cleaned_data

class ComponentCreateFormView(FormView):
    template_name = 'warehouse/component_create_from_api.html'
    form_class = ComponentCreateForm





urlpatterns = [
    path('', ComponentCreateFormView.as_view(), name='component-create-from-api'),
]