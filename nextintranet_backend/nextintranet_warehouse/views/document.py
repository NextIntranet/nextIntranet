from rest_framework import serializers

from rest_framework.permissions import IsAuthenticated
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination

from nextintranet_warehouse.models import Warehouse
from nextintranet_warehouse.models import Warehouse

from django.views.generic import DetailView, ListView

from ..models.component import Document, Component
from rest_framework.response import Response

from django_tables2 import tables
from django_tables2.views import SingleTableView

from django.views.generic.edit import CreateView
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.contrib import messages
from django import forms
from django.forms import inlineformset_factory
from django.views.generic.edit import FormView
from django.shortcuts import render
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Row, Column, Field, Div



class DocumentSerializer(serializers.ModelSerializer):
    get_url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = '__all__'

    def get_get_url(self, obj):
        return obj



class DocumentForm(forms.ModelForm):
    class Meta:
        model = Document
        fields = ['component', 'name', 'doc_type', 'url']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.layout = Layout(
            Row(
                Field('component', css_class='border rounded p-2'),
                Field('name', css_class='border rounded p-2'),
                Field('doc_type', css_class='border rounded p-2'),
                Field('file', css_class='border rounded p-2'),
                Field('url', css_class='border rounded p-2'),
            )
        )


class ComponentDocumentEditView(FormView):
    template_name = 'warehouse/document/document_edit.html'
    template_partial_name = 'warehouse/document/document_edit_partial.html'
    model = Component
    inline_model = Document
    form_class = DocumentForm
    formset_extra = 1
    formset_can_delete = True

    def dispatch(self, request, *args, **kwargs):
        self.component = get_object_or_404(self.model, id=self.kwargs['uuid'])
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
            for instance in formset.deleted_objects:
                instance.delete()
            messages.success(self.request, 'Documents saved.')
            return self.render_to_response(self.get_formset(), self.template_partial_name)
        else:
            print("Formset errors:", formset.errors)
        return self.render_to_response(formset, self.template_partial_name)

    def render_to_response(self, formset, template):
        return render(self.request, template, {
            'formset': formset,
            'component': self.component,
        })



def document_add_row(request, uuid):
    component = get_object_or_404(Component, id=uuid)
    InlineFormset = inlineformset_factory(
        Component,
        Document,
        form=DocumentForm,
        fields='__all__',
        extra=2,
        can_delete=True
    )
    empty_form = InlineFormset(instance=component).empty_form
    return render(request, 'warehouse/document/document_row.html', {'form': empty_form})
