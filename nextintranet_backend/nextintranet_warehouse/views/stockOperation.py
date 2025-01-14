from django import forms
from django.views.generic.edit import FormView
from django.shortcuts import redirect
from django.views.generic.edit import CreateView
#from .models import StockOperation
from nextintranet_warehouse.models.component import StockOperation
from nextintranet_warehouse.models.component import Packet

class StockOperationForm(forms.ModelForm):
    class Meta:
        model = StockOperation
        fields = ['packet', 'previous_operation', 'operation_type', 'quantity', 'relative_quantity', 'unit_price']
        widgets = {
            'operation_type': forms.Select(attrs={'class': 'form-select'}),
            'quantity': forms.NumberInput(attrs={'class': 'form-control', 'step': 'any'}),
            'relative_quantity': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'unit_price': forms.NumberInput(attrs={'class': 'form-control', 'step': 'any'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['packet'].queryset = self.fields['packet'].queryset.select_related('component')
        self.fields['packet'].widget.attrs.update({'class': 'form-select'})

class StockOperationCreateView(FormView):
    template_name = 'warehouse/stock_operation_form.html'
    form_class = StockOperationForm

    def get_initial(self):
        """Nastavení výchozích hodnot formuláře."""
        initial = super().get_initial()
        packet_uuid_query = self.kwargs.get('uuid')
        packet = Packet.objects.get(pk=packet_uuid_query)

        initial['packet'] = packet
        initial['previous_operation'] = packet.last_operation
        
        initial['quantity'] = 0
        initial['relative_quantity'] = True
        initial['unit_price'] = 0.0
        return initial

    def form_valid(self, form):
        form.save()
        return redirect('component-detail', uuid=form.instance.packet.component.id)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['operation_types'] = dict(StockOperation.OPERATION_TYPE)
        return context


# class StockOperationCreateView(CreateView):
#     template_name = 'warehouse/stock_operation_form.html'
#     model = StockOperation
#     form_class = StockOperationForm
#     success_url = '/stock/operations/'  # URL, kam se uživatel přesměruje po uložení
