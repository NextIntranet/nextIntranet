from django import forms
from django.forms import inlineformset_factory
from ..models.component import Component, ComponentParameter, Document, SupplierRelation, Packet

class ComponentForm(forms.ModelForm):
    class Meta:
        model = Component
        fields = [
            'name', 'description', 'category', 'tags', 'unit_type', 
            'selling_price', 'internal_price', 'primary_image'
        ]
        widgets = {
            'description': forms.Textarea(attrs={'rows': 3}),
            'tags': forms.CheckboxSelectMultiple(),
        }

# Inline formuláře pro související modely
ComponentParameterFormSet = inlineformset_factory(
    Component, ComponentParameter, 
    fields=['parameter_type', 'value'], 
    extra=1, can_delete=True
)

DocumentFormSet = inlineformset_factory(
    Component, Document, 
    fields=['name', 'doc_type', 'file', 'url'], 
    extra=1, can_delete=True
)

SupplierRelationFormSet = inlineformset_factory(
    Component, SupplierRelation, 
    fields=['supplier', 'symbol', 'description', 'custom_url'], 
    extra=1, can_delete=True
)

PacketFormSet = inlineformset_factory(
    Component, Packet, 
    fields=['location', 'description', 'is_trackable'], 
    extra=1, can_delete=True
)
