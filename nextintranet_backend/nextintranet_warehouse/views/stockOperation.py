import re

from django import forms
from django.db import transaction
from django.views.generic.edit import FormView
from django.shortcuts import redirect
from django.views.generic.edit import CreateView
#from .models import StockOperation
from nextintranet_warehouse.models.component import StockOperation
from nextintranet_warehouse.models.component import Packet
from django.forms import ModelForm
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from rest_framework import serializers
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination




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
        help_texts = {
            'quantity': _('Use negative numbers for stock removals.'),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['packet'].queryset = self.fields['packet'].queryset.select_related('component')
        self.fields['packet'].widget.attrs.update({'class': 'form-select'})

        self.fields['previous_operation'].disabled = True
        self.fields['previous_operation'].widget.attrs['readonly'] = True
        self.fields['packet'].disabled = True
        self.fields['packet'].widget.attrs['readonly'] = True

class StockOperationCreateView(FormView):
    template_name = 'warehouse/stock_operation_form.html'
    form_class = StockOperationForm

    def get_initial(self):
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
        print("VALIDACE FORMULÁŘE...")
        form.save()
        return redirect('component-detail', uuid=form.instance.packet.component.id)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['operation_types'] = dict(StockOperation.OPERATION_TYPE)
        return context


_INVENTORY_AUDIT_RE = re.compile(r"\s*\|\s*Physical count:.*$", re.IGNORECASE)


def _inventory_audit_note(counted_quantity: float, recorded_count: float) -> str:
    return f"Physical count: {counted_quantity} (recorded: {recorded_count})"


def _apply_inventory_description(
    validated_data: dict,
    counted_quantity: float,
    recorded_count: float,
) -> None:
    audit_note = _inventory_audit_note(counted_quantity, recorded_count)
    description = (validated_data.get("description") or "").strip()

    if description.lower().startswith("fast inventory |"):
        validated_data["description"] = f"Fast inventory | {audit_note}"
        return

    if description:
        prefix = _INVENTORY_AUDIT_RE.sub("", description).strip()
        validated_data["description"] = (
            f"{prefix} | {audit_note}" if prefix else audit_note
        )
        return

    validated_data["description"] = audit_note


class StockOperationSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    absolute_quantity = serializers.FloatField(write_only=True, required=False)
    quantity = serializers.FloatField(required=False)

    class Meta:
        model = StockOperation
        fields = "__all__"

    def get_author_name(self, instance):
        author = instance.author
        if not author:
            return None
        full_name = author.get_full_name().strip()
        return full_name or author.username

    def validate(self, attrs):
        absolute_quantity = attrs.pop("absolute_quantity", None)
        operation_type = attrs.get("operation_type") or (
            self.instance.operation_type if self.instance else None
        )

        if absolute_quantity is not None:
            if operation_type != "inventory":
                raise serializers.ValidationError(
                    {"absolute_quantity": "Only supported for inventory operations."}
                )
            if absolute_quantity < 0:
                raise serializers.ValidationError(
                    {"absolute_quantity": "Counted quantity cannot be negative."}
                )
            attrs["_absolute_quantity"] = absolute_quantity
        elif self.instance is None and operation_type == "inventory" and "quantity" not in attrs:
            raise serializers.ValidationError(
                {"quantity": "Provide quantity or absolute_quantity for inventory operations."}
            )
        elif self.instance is None and operation_type != "inventory" and "quantity" not in attrs:
            raise serializers.ValidationError({"quantity": "This field is required."})

        return attrs

    def create(self, validated_data):
        absolute_quantity = validated_data.pop("_absolute_quantity", None)

        if absolute_quantity is not None:
            packet = validated_data["packet"]
            with transaction.atomic():
                locked_packet = Packet.objects.select_for_update().get(pk=packet.pk)
                recorded_count = float(locked_packet.count or 0)
                validated_data["quantity"] = absolute_quantity - recorded_count
                validated_data["relative_quantity"] = True
                validated_data["packet"] = locked_packet
                _apply_inventory_description(
                    validated_data, absolute_quantity, recorded_count
                )

        validated_data.setdefault("metadata", {})
        validated_data["metadata"].setdefault("counted_quantity", absolute_quantity)
        validated_data["metadata"].setdefault("recorded_quantity", recorded_count)
        if "counted_price" not in validated_data["metadata"]:
            item_value = float(locked_packet.itemValue or 0)
            validated_data["metadata"]["counted_price"] = item_value if item_value else None

        return super().create(validated_data)

    # def to_representation(self, instance):
    #     data = super().to_representation(instance)
    #     # data['operation_type'] = instance.get_operation_type_display()
    #     # data['created_at'] = instance.created_at.strftime('%Y-%m-%d %H:%M')
    #     # data['packet'] = instance.packet.uuid
    #     return data

    # def to_internal_value(self, data):
    #     data = data.copy()
    #     data['packet'] = Packet.objects.get(uuid=data['packet'])
    #     return data

    # def create(self, validated_data):
    #     return StockOperation.objects.create(**validated_data)

    # def update(self, instance, validated_data):
    #     instance.operation_type = validated_data.get('operation_type', instance.operation_type)
    #     instance.quantity = validated_data.get('quantity', instance.quantity)
    #     instance.relative_quantity = validated_data.get('relative_quantity', instance.relative_quantity)
    #     instance.unit_price = validated_data.get('unit_price', instance.unit_price)
    #     instance.save()
    #     return instance


class StockOperationViewSet(viewsets.ModelViewSet):
    queryset = StockOperation.objects.select_related('author').all()
    serializer_class = StockOperationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['packet', 'operation_type', 'created_at', 'reference']
    # pagination_class = PageNumberPagination

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


StockOperationRouter = DefaultRouter(trailing_slash=True)
StockOperationRouter.register(r'', StockOperationViewSet)
