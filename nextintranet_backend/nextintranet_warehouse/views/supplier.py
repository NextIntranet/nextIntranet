from django import forms
from nextintranet_warehouse.models.component import Supplier
from nextintranet_warehouse.models.component import SupplierRelation
from nextintranet_warehouse.models.component import Component
from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse
from django.contrib import messages
from django.views.generic.edit import FormView
from django.views.generic.edit import CreateView

from django.urls import reverse_lazy

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