from django.views.generic import CreateView, UpdateView, DeleteView
from django_tables2.views import SingleTableView
import django_tables2 as tables
from django.urls import path, reverse_lazy

def create_crud_urls(model_object, base_url=None, table_class_object=None, template_base="django_tables2/bootstrap.html"):

    model_name = model_object._meta.model_name
    model_verbose = model_object._meta.verbose_name_plural.capitalize()
    base_url = base_url or model_name

    # Automatická tabulka, pokud není specifikována
    class AutoTable(tables.Table):
        class Meta:
            model = model_object
            template_name = template_base

    # Automatický formulář
    from django.forms import modelform_factory
    AutoForm = modelform_factory(model_object, fields="__all__")

    class ListView(SingleTableView):
        model = model_object
        table_class = table_class_object or AutoTable
        template_name = "crud/list.html"

        def get_context_data(self, **kwargs):
            context = super().get_context_data(**kwargs)
            context["model_name"] = model_name
            context["model_verbose"] = model_verbose
            context["admin_url"] = f"/admin/{model_object._meta.app_label}/{model_object._meta.model_name}"
            return context

    class CreateModelView(CreateView):
        model = model_object
        form_class = AutoForm
        template_name = "crud/form.html"
        success_url = reverse_lazy(f"{base_url}-list")

    class UpdateModelView(UpdateView):
        model = model_object
        form_class = AutoForm
        template_name = "crud/form.html"
        success_url = reverse_lazy(f"{base_url}-list")

    class DeleteModelView(DeleteView):
        model = model_object
        template_name = "crud/confirm_delete.html"
        success_url = reverse_lazy(f"{base_url}-list")

    # Vrácení seznamu URL patterns
    urllist =  [
        path("", ListView.as_view(), name=f"{base_url}-list"),
        path("create/", CreateModelView.as_view(), name=f"{base_url}-create"),
        path("<uuid:pk>/", UpdateModelView.as_view(), name=f"{base_url}-detail"),
        path("<uuid:pk>/update/", UpdateModelView.as_view(), name=f"{base_url}-update"),
        path("<uuid:pk>/delete/", DeleteModelView.as_view(), name=f"{base_url}-delete"),
    ]
    return urllist
