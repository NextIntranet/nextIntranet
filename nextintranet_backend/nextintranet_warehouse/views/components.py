from rest_framework import serializers

from rest_framework.permissions import IsAuthenticated
from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.views import APIView

from django.forms import ModelForm
from django.views.generic.edit import FormView

from rest_framework import serializers

from nextintranet_warehouse.models import Warehouse
from nextintranet_warehouse.models import Warehouse
from nextintranet_backend.models.userSettings import UserSetting

from django.views.generic import DetailView, ListView

from ..models.warehouse import Warehouse
from ..models.component import (
    Component,
    ComponentParameter,
    Supplier,
    SupplierRelation,
    Packet,
    StockOperation,
    Reservation,
)
from rest_framework.response import Response

from django.views.generic.edit import CreateView
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.contrib import messages
from django import forms

from django.db import models, transaction
from django.db.models import Prefetch
from django.db.models import Q, Sum, Value, Case, When, F, DecimalField, Subquery, OuterRef
from django.db.models.functions import Coalesce

from ..models.component import Component, Identifier
from ..models.purchase import PurchaseRequest
from ..models.component import Tag
from ..models.category import Category
from django.contrib.contenttypes.models import ContentType
from .category import CategorySerializer
from .document import DocumentSerializer
from django.conf import settings
from urllib.parse import urlparse
from .warehouse import WarehouseSerializer
from .tags import TagSerializer
from .parameters import ComponentParameterSerializer
import django_tables2 as tables

from django_select2.forms import ModelSelect2Widget, Select2Widget

from nextintranet_backend.views.crud import create_crud_urls
from nextintranet_backend.help.crud import NIT_Table



from django.forms.models import inlineformset_factory
from nextintranet_warehouse.models.component import ComponentParameter, ParameterType

from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Row, Column
from django.views.generic.edit import FormView
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.shortcuts import render


from django.shortcuts import redirect, render, get_object_or_404
from django.views.generic.edit import CreateView
from django.urls import reverse_lazy
from ..models.component import Component
from ..forms.components import ComponentForm, ComponentParameterFormSet, DocumentFormSet, SupplierRelationFormSet, PacketFormSet




class ComponentTableView(NIT_Table):
    class Meta(NIT_Table.Meta):
        model = Component
        #fields = ('id', 'name', 'description', 'category')

    id = tables.LinkColumn('component-detail', args=[tables.A('pk')], verbose_name='ID')

urlpatterns = create_crud_urls(Component, table_class_object=ComponentTableView)



class ComponentForm(forms.ModelForm):
    class Meta:
        model = Component
        fields = ['name', 'description', 'category', 'primary_image']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'description': forms.Textarea(attrs={'class': 'form-control'}),
            'category': ModelSelect2Widget(model=Component, search_fields=['name__icontains']),
            'primary_image': ModelSelect2Widget(model=Component, search_fields=['name__icontains']),
        }



class PacketSerializer(serializers.ModelSerializer):
    location = WarehouseSerializer()
    last_used_at = serializers.SerializerMethodField()

    class Meta:
        model = Packet
        fields = '__all__'

    def get_last_used_at(self, instance):
        if instance.last_operation_id and instance.last_operation:
            return instance.last_operation.timestamp
        return None

    def to_representation(self, instance):
        if instance.count == 0 and instance.operations.exists():
            instance.calculate()
        return super().to_representation(instance)

class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'

class SupplierRelationSerializer(serializers.ModelSerializer):
    supplier = SupplierSerializer()
    url = serializers.SerializerMethodField()
    class Meta:
        model = SupplierRelation
        fields = '__all__'

    def get_url(self, obj):
        return obj.url

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            'total_count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data
        })

def get_url(self, obj):
    return obj.url


class ComponentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a component (POST). Accepts only the fields needed for create."""
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        required=True,
        allow_null=False,
    )
    tags = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(),
        many=True,
        required=False,
        default=list,
    )

    class Meta:
        model = Component
        fields = ['id', 'name', 'description', 'category', 'tags', 'unit_type']
        read_only_fields = ['id']


class ComponentListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the component list view — no packets, documents, or suppliers."""
    primary_image_url = serializers.SerializerMethodField()
    inventory_summary = serializers.SerializerMethodField()
    category = CategorySerializer(read_only=True)

    class Meta:
        model = Component
        fields = [
            'id', 'name', 'description', 'category',
            'primary_image_url', 'inventory_summary',
            'selling_price', 'internal_price', 'unit_type',
        ]

    def get_primary_image_url(self, instance):
        # Use prefetched documents if available
        docs = instance.documents.all()
        primary = None
        for doc in docs:
            if doc.is_primary:
                primary = doc
                break
        if primary:
            url = primary.get_url
        else:
            url = instance.primary_image
        if not url:
            return None

        public_endpoint = getattr(settings, 'S3_PUBLIC_ENDPOINT_URL', None)
        internal_endpoint = getattr(settings, 'S3_ENDPOINT_URL', None)
        bucket = getattr(settings, 'S3_STORAGE_BUCKET_NAME', None)
        if not public_endpoint:
            public_endpoint = getattr(settings, 'AWS_S3_PUBLIC_ENDPOINT_URL', None)
        if not internal_endpoint:
            internal_endpoint = getattr(settings, 'AWS_S3_ENDPOINT_URL', None)
        if not bucket:
            bucket = getattr(settings, 'AWS_STORAGE_BUCKET_NAME', None)

        if public_endpoint and internal_endpoint and url.startswith(internal_endpoint):
            return public_endpoint.rstrip('/') + url[len(internal_endpoint):]

        parsed = urlparse(url)
        path = parsed.path or ''
        if public_endpoint and bucket and path.startswith(f'/{bucket}/'):
            return f"{public_endpoint.rstrip('/')}{path}"
        if public_endpoint and bucket and path.startswith('/documents/'):
            return f"{public_endpoint.rstrip('/')}/{bucket}{path}"

        return url

    def get_inventory_summary(self, instance):
        # Use annotated values from queryset when available (avoids N+1)
        total_quantity = getattr(instance, '_total_quantity', None)
        home_quantity = getattr(instance, '_home_quantity', None)
        reserved_quantity = getattr(instance, '_reserved_quantity', None)
        purchase_quantity = getattr(instance, '_purchase_requested_quantity', None)
        ordered_quantity = getattr(instance, '_purchase_ordered_quantity', None)

        if total_quantity is not None:
            return {
                'total_quantity': float(total_quantity),
                'home_quantity': float(home_quantity) if home_quantity is not None else None,
                'reserved_quantity': float(reserved_quantity or 0),
                'purchase_quantity': float(purchase_quantity or 0),
                'purchase_requested_quantity': float(purchase_quantity or 0),
                'purchase_ordered_quantity': float(ordered_quantity or 0),
            }

        # Fallback: compute in Python (shouldn't happen with optimized queryset)
        home_location_ids = self.context.get('home_location_ids')
        total = 0
        home = 0
        for packet in instance.packets.all():
            packet_count = packet.count or 0
            total += packet_count
            if home_location_ids and packet.location_id in home_location_ids:
                home += packet_count
        res_qty = instance.reservations.aggregate(
            total_reserved=Sum('quantity')
        )['total_reserved'] or 0
        purch_qty = PurchaseRequest.objects.filter(
            component=instance, purchase__isnull=True,
        ).aggregate(total_requested=Sum('quantity'))['total_requested'] or 0
        ord_qty = PurchaseRequest.objects.filter(
            component=instance, purchase__isnull=False,
        ).aggregate(total_ordered=Sum('quantity'))['total_ordered'] or 0
        return {
            'total_quantity': float(total),
            'home_quantity': float(home) if home_location_ids else None,
            'reserved_quantity': float(res_qty),
            'purchase_quantity': float(purch_qty),
            'purchase_requested_quantity': float(purch_qty),
            'purchase_ordered_quantity': float(ord_qty),
        }


class ExternalIdentifierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Identifier
        fields = ['id', 'scheme', 'identifier']
        read_only_fields = ['id']


class ComponentSerializer(serializers.ModelSerializer):
    documents = DocumentSerializer(many=True, read_only=True)
    primary_image_url = serializers.SerializerMethodField()
    inventory_summary = serializers.SerializerMethodField()
    external_identifiers = serializers.SerializerMethodField()
    last_modified_at = serializers.SerializerMethodField()

    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all()
    )

    tags = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(),
        many=True
    )

    packets = PacketSerializer(many=True, read_only=True)
    suppliers = SupplierRelationSerializer(many=True, read_only=True)
    
    def get_primary_image_url(self, instance):
        primary_document = instance.documents.filter(is_primary=True).order_by('id').first()
        if primary_document:
            url = primary_document.get_url
        else:
            url = instance.primary_image
        if not url:
            return None

        public_endpoint = getattr(settings, 'S3_PUBLIC_ENDPOINT_URL', None)
        internal_endpoint = getattr(settings, 'S3_ENDPOINT_URL', None)
        bucket = getattr(settings, 'S3_STORAGE_BUCKET_NAME', None)
        if not public_endpoint:
            public_endpoint = getattr(settings, 'AWS_S3_PUBLIC_ENDPOINT_URL', None)
        if not internal_endpoint:
            internal_endpoint = getattr(settings, 'AWS_S3_ENDPOINT_URL', None)
        if not bucket:
            bucket = getattr(settings, 'AWS_STORAGE_BUCKET_NAME', None)

        if public_endpoint and internal_endpoint and url.startswith(internal_endpoint):
            return public_endpoint.rstrip('/') + url[len(internal_endpoint):]

        parsed = urlparse(url)
        path = parsed.path or ''
        if public_endpoint and bucket and path.startswith(f'/{bucket}/'):
            return f"{public_endpoint.rstrip('/')}{path}"
        if public_endpoint and bucket and path.startswith('/documents/'):
            return f"{public_endpoint.rstrip('/')}/{bucket}{path}"

        return url

    def get_external_identifiers(self, instance):
        ct = ContentType.objects.get_for_model(Component)
        qs = Identifier.objects.filter(content_type=ct, object_id=str(instance.pk))
        return ExternalIdentifierSerializer(qs, many=True).data

    def get_last_modified_at(self, instance):
        timestamps = [instance.created_at]
        for packet in instance.packets.all():
            timestamps.append(packet.created_at)
            if packet.date_added:
                timestamps.append(packet.date_added)
            if packet.last_operation_id and packet.last_operation:
                timestamps.append(packet.last_operation.timestamp)
        for document in instance.documents.all():
            timestamps.append(document.created_at)
        return max(timestamps)

    def get_inventory_summary(self, instance):
        total_quantity = 0
        home_quantity = 0
        reserved_quantity = instance.reservations.aggregate(
            total_reserved=models.Sum('quantity')
        )['total_reserved'] or 0
        home_location_ids = self.context.get('home_location_ids')
        for packet in instance.packets.all():
            # Disabled: avoid recalculating on read; rely on StockOperation.save() for count updates.
            # if packet.count == 0 and packet.operations.exists():
            #     packet.calculate()
            packet_count = packet.count or 0
            total_quantity += packet_count
            if home_location_ids and packet.location_id in home_location_ids:
                home_quantity += packet_count
        purchase_quantity = PurchaseRequest.objects.filter(
            component=instance,
            purchase__isnull=True,
        ).aggregate(total_requested=models.Sum('quantity'))['total_requested'] or 0
        ordered_quantity = PurchaseRequest.objects.filter(
            component=instance,
            purchase__isnull=False,
        ).aggregate(total_ordered=models.Sum('quantity'))['total_ordered'] or 0
        return {
            'total_quantity': float(total_quantity),
            'home_quantity': float(home_quantity) if home_location_ids else None,
            'reserved_quantity': float(reserved_quantity),
            'purchase_quantity': float(purchase_quantity),
            'purchase_requested_quantity': float(purchase_quantity),
            'purchase_ordered_quantity': float(ordered_quantity),
        }


    def to_representation(self, instance):
        data = super().to_representation(instance)

        data['category'] = CategorySerializer(instance.category).data
        data['tags'] = TagSerializer(instance.tags, many=True).data
        return data

    class Meta:
        model = Component
        fields = '__all__'



class ComponentListAPIView(generics.ListCreateAPIView):
    serializer_class = ComponentListSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ComponentCreateSerializer
        return ComponentListSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        user_settings = UserSetting.objects.filter(user=self.request.user).select_related('home_location').first()
        if user_settings and user_settings.home_location:
            location_ids = user_settings.home_location.get_descendants(include_self=True).values_list('id', flat=True)
            context['home_location_ids'] = set(location_ids)
        else:
            context['home_location_ids'] = None
        return context

    def get_queryset(self):
        queryset = Component.objects.all()
        name = self.request.query_params.get('name', None)
        description = self.request.query_params.get('description', None)
        search = self.request.query_params.get('search', None)
        categories = self.request.query_params.get('categories', None)
        locations = self.request.query_params.get('locations', None)
        if categories:
            categories = categories.split(',')
            categories = Category.objects.filter(id__in=categories)

        filters = []
        if categories:
            filters.append(Q(category__in=categories))

        if search:
            filters.append(
            Q(name__icontains=search) |
            Q(description__icontains=search) |
            Q(id__icontains=search)
            )

        if name:
            filters.append(Q(name__icontains=name))

        if description:
            filters.append(Q(description__icontains=description))

        if locations:
            locations = locations.split(',')
            locations = Warehouse.objects.filter(id__in=locations).get_descendants(include_self=True).distinct()
            filters.append(Q(packets__location__in=locations))

        if filters:
            queryset = queryset.filter(*filters)

        # Build home_quantity annotation
        home_location_ids = None
        user_settings = UserSetting.objects.filter(
            user=self.request.user
        ).select_related('home_location').first()
        if user_settings and user_settings.home_location:
            home_location_ids = set(
                user_settings.home_location.get_descendants(include_self=True)
                .values_list('id', flat=True)
            )

        # Subquery-based annotations to avoid cartesian product from multiple JOINs
        annotations = {
            '_total_quantity': Coalesce(
                Subquery(
                    Packet.objects.filter(component=OuterRef('pk'))
                    .values('component')
                    .annotate(s=Sum('count'))
                    .values('s')[:1]
                ),
                Value(0),
                output_field=DecimalField(),
            ),
            '_reserved_quantity': Coalesce(
                Subquery(
                    Reservation.objects.filter(component=OuterRef('pk'))
                    .values('component')
                    .annotate(s=Sum('quantity'))
                    .values('s')[:1]
                ),
                Value(0),
                output_field=DecimalField(),
            ),
            '_purchase_requested_quantity': Coalesce(
                Subquery(
                    PurchaseRequest.objects.filter(component=OuterRef('pk'), purchase__isnull=True)
                    .values('component')
                    .annotate(s=Sum('quantity'))
                    .values('s')[:1]
                ),
                Value(0),
                output_field=DecimalField(),
            ),
            '_purchase_ordered_quantity': Coalesce(
                Subquery(
                    PurchaseRequest.objects.filter(component=OuterRef('pk'), purchase__isnull=False)
                    .values('component')
                    .annotate(s=Sum('quantity'))
                    .values('s')[:1]
                ),
                Value(0),
                output_field=DecimalField(),
            ),
        }

        if home_location_ids:
            annotations['_home_quantity'] = Coalesce(
                Subquery(
                    Packet.objects.filter(component=OuterRef('pk'), location_id__in=home_location_ids)
                    .values('component')
                    .annotate(s=Sum('count'))
                    .values('s')[:1]
                ),
                Value(0),
                output_field=DecimalField(),
            )

        queryset = (
            queryset
            .select_related('category')
            .prefetch_related('documents')
            .annotate(**annotations)
            .order_by('id')
        )

        return queryset



class ComponentDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Component.objects.all()
    serializer_class = ComponentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from django.db.models import Prefetch

        return Component.objects.prefetch_related(
            Prefetch(
                'packets',
                queryset=Packet.objects.select_related('location', 'last_operation'),
            ),
            'documents',
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        user_settings = UserSetting.objects.filter(user=self.request.user).select_related('home_location').first()
        if user_settings and user_settings.home_location:
            location_ids = user_settings.home_location.get_descendants(include_self=True).values_list('id', flat=True)
            context['home_location_ids'] = set(location_ids)
        else:
            context['home_location_ids'] = None
        return context


class ComponentIdentifierListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        component = get_object_or_404(Component, pk=pk)
        ct = ContentType.objects.get_for_model(Component)
        qs = Identifier.objects.filter(content_type=ct, object_id=str(component.pk))
        return Response(ExternalIdentifierSerializer(qs, many=True).data)

    def post(self, request, pk):
        component = get_object_or_404(Component, pk=pk)
        serializer = ExternalIdentifierSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ct = ContentType.objects.get_for_model(Component)
        serializer.save(content_type=ct, object_id=str(component.pk))
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ComponentIdentifierDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, component_pk, identifier_pk):
        component = get_object_or_404(Component, pk=component_pk)
        ct = ContentType.objects.get_for_model(Component)
        identifier = get_object_or_404(
            Identifier,
            pk=identifier_pk,
            content_type=ct,
            object_id=str(component.pk),
        )
        identifier.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ComponentDuplicateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def _serializer_context(self, request):
        user_settings = UserSetting.objects.filter(user=request.user).select_related('home_location').first()
        if user_settings and user_settings.home_location:
            location_ids = user_settings.home_location.get_descendants(include_self=True).values_list('id', flat=True)
            home_location_ids = set(location_ids)
        else:
            home_location_ids = None
        return {
            'request': request,
            'home_location_ids': home_location_ids,
        }

    def post(self, request, pk):
        source = get_object_or_404(
            Component.objects.prefetch_related('tags', 'parameters', 'suppliers'),
            pk=pk,
        )

        with transaction.atomic():
            duplicate = Component.objects.create(
                name=f'[copy] {source.name}',
                description=source.description,
                category=source.category,
                unit_type=source.unit_type,
                selling_price=source.selling_price,
                internal_price=source.internal_price,
                primary_image=source.primary_image,
            )
            duplicate.tags.set(source.tags.all())

            if source.parameters.exists():
                ComponentParameter.objects.bulk_create([
                    ComponentParameter(
                        component=duplicate,
                        parameter_type=parameter.parameter_type,
                        value=parameter.value,
                        value_number=parameter.value_number,
                        is_inherited=parameter.is_inherited,
                        source_rule=parameter.source_rule,
                    )
                    for parameter in source.parameters.all()
                ])

            if source.suppliers.exists():
                SupplierRelation.objects.bulk_create([
                    SupplierRelation(
                        component=duplicate,
                        supplier=relation.supplier,
                        symbol=relation.symbol,
                        description=relation.description,
                        custom_url=relation.custom_url,
                        api_data=relation.api_data,
                        api_data_hash=relation.api_data_hash,
                        api_fetched_at=relation.api_fetched_at,
                        api_applied_at=relation.api_applied_at,
                        api_price=relation.api_price,
                        api_availability=relation.api_availability,
                    )
                    for relation in source.suppliers.all()
                ])

        duplicate = (
            Component.objects.prefetch_related(
                Prefetch(
                    'packets',
                    queryset=Packet.objects.select_related('location', 'last_operation'),
                ),
                'documents',
                'tags',
                'parameters',
                'suppliers',
            )
            .get(pk=duplicate.pk)
        )
        serializer = ComponentSerializer(duplicate, context=self._serializer_context(request))
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ComponentHistoryAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        component = get_object_or_404(Component, pk=pk)
        packets = list(
            Packet.objects.filter(component=component)
            .select_related('location')
            .order_by('created_at', 'id')
        )

        packet_items = [
            {
                'id': str(packet.id),
                'label': packet.location.full_path if packet.location else str(packet.id),
            }
            for packet in packets
        ]

        levels = {str(packet.id): 0.0 for packet in packets}
        operations = (
            StockOperation.objects.filter(packet__component=component)
            .select_related('packet')
            .order_by('timestamp', 'id')
        )

        history = []
        for operation in operations:
            packet_id = str(operation.packet_id)
            current = levels.get(packet_id, 0.0)
            if operation.relative_quantity:
                next_value = current + (operation.quantity or 0.0)
            else:
                next_value = operation.quantity or 0.0
            levels[packet_id] = float(next_value)
            snapshot = {key: float(value) for key, value in levels.items()}
            history.append(
                {
                    'timestamp': operation.timestamp.isoformat(),
                    'levels': snapshot,
                    'total': float(sum(snapshot.values())),
                }
            )

        return Response({'packets': packet_items, 'history': history})


class PacketForm(forms.ModelForm):
    """Form for creating and updating Packet instances."""

    class Meta:
        """Meta class to specify the model and fields."""

        model = Packet
        fields = ['component', 'location', 'is_trackable', 'description']


    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

class ComponentParameterListAPIView(generics.ListCreateAPIView):
    queryset = ComponentParameter.objects.all()
    serializer_class = ComponentParameterSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        component_id = self.kwargs.get('pk')
        queryset = ComponentParameter.objects.all()
        if component_id:
            queryset = queryset.filter(component=component_id)
        return queryset

    def post(self, request, pk, *args, **kwargs):
        component = get_object_or_404(Component, pk=pk)
        data = request.data.copy()
        # Ensure component is set in payload
        if not data.get('component'):
            data['component'] = str(component.id)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=201, headers=headers)

class ComponentParameterCreateAPIView(generics.CreateAPIView):
    queryset = ComponentParameter.objects.all()
    serializer_class = ComponentParameterSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        component_id = self.kwargs.get('pk')
        component = get_object_or_404(Component, pk=component_id)
        
        cp = ComponentParameter(
            component=component,
            parameter_type = ParameterType.objects.all().first(),
        )
        
        cp.save()

class PacketNewView(CreateView):
    model = Packet
    form_class = PacketForm
    template_name = 'warehouse/packet_edit.html'

    def get_initial(self):
        initial = super().get_initial()
        component_uuid = self.kwargs.get('uuid')
        component = get_object_or_404(Component, pk=component_uuid)
        initial['component'] = component
        return initial

    def get_form(self, form_class=None):
        form = super().get_form(form_class)
        form.fields['component'].widget.attrs['readonly'] = True
        return form

    def form_valid(self, form):
        component_uuid = self.kwargs.get('uuid')
        form.save()
        messages.success(self.request, 'Packet created.')
        return redirect(reverse('component-detail', kwargs={'uuid': component_uuid}))

class PacketEditView(FormView):
    template_name = 'warehouse/packet_edit.html'
    form_class = PacketForm

    def get_form(self):
        instance_id = self.kwargs.get('uuid')
        instance = get_object_or_404(Packet, pk=instance_id)
        return self.form_class(instance=instance, **self.get_form_kwargs())

    def form_valid(self, form):
        form.save()
        messages.success(self.request, 'Packet saved.')
        return redirect(reverse('component-detail', kwargs={'uuid': form.cleaned_data['component'].id}))

class PacketDeleteView(CreateView):
    model = Packet

    def get(self, request, *args, **kwargs):
        packet = get_object_or_404(Packet, pk=self.kwargs.get('uuid'))
        component_uuid = packet.component.id
        packet.delete()
        messages.success(self.request, 'Packet deleted.')
        return redirect(reverse('component-detail', kwargs={'uuid': component_uuid}))





class SupplierForm(forms.ModelForm):
    class Meta:
        model = Supplier
        fields = [
            'name',
            'contact_info',
            'website',
            'link_template',
            'min_order_quantity',
            'api_plugin_instance',
            'api_config',
            'api_mapping',
        ]
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'contact_info': forms.Textarea(attrs={'class': 'form-control'}),
            'website': forms.URLInput(attrs={'class': 'form-control'}),
            'link_template': forms.TextInput(attrs={'class': 'form-control'}),
            'min_order_quantity': forms.NumberInput(attrs={'class': 'form-control'}),
            'api_plugin_instance': forms.Select(attrs={'class': 'form-select'}),
            'api_config': forms.Textarea(attrs={'class': 'form-control', 'rows': 6}),
            'api_mapping': forms.Textarea(attrs={'class': 'form-control', 'rows': 6}),
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


class ComponentParameterForm(forms.ModelForm):
    class Meta:
        model = ComponentParameter
        fields = ['parameter_type', 'value']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.layout = Layout(
            Row(
                Column('parameter_type', css_class="form-group col-md-6"),
                Column('value', css_class="form-group col-md-6"),
            )
        )


class ComponentParameterEditView(FormView):
    template_name = 'warehouse/parameters_edit.html'
    template_partial_name = 'warehouse/parameters_edit_partial.html'
    model = Component
    inline_model = ComponentParameter
    form_class = ComponentParameterForm
    formset_extra = 1
    formset_can_delete = True

    def dispatch(self, request, *args, **kwargs):
        """Načte hlavní objekt (Component)."""
        self.component = get_object_or_404(self.model, id=kwargs['uuid'])
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
            # Zpracování smazaných objektů
            for instance in formset.deleted_objects:
                instance.delete()
            # For HTMX requests - return partial template
            if request.headers.get('HX-Request'):
                return self.render_to_response(formset, self.template_partial_name)
            return redirect('component-detail', uuid=self.component.id)
        else:
            # Return errors in the appropriate template
            template = self.template_partial_name if request.headers.get('HX-Request') else self.template_name
            return self.render_to_response(formset, template)

    def render_to_response(self, formset, template):
        # Use the provided formset instead of creating a new one
        return render(self.request, template, {
            'formset': formset,
            'component': self.component,
        })


def add_row(request, uuid):
    component = get_object_or_404(Component, id=uuid)
    InlineFormset = inlineformset_factory(
        Component,
        ComponentParameter,
        form=ComponentParameterForm,
        extra=1,
        can_delete=True
    )
    empty_form = InlineFormset(instance=component).empty_form
    return render(request, 'warehouse/parameter_row.html', {'form': empty_form})



class ComponentCreateView(CreateView):
    model = Component
    form_class = ComponentForm
    template_name = "warehouse/component/component_form.html"
    success_url = reverse_lazy("component-list")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        if self.request.POST:
            context["parameter_formset"] = ComponentParameterFormSet(self.request.POST)
            context["document_formset"] = DocumentFormSet(self.request.POST, self.request.FILES)
            context["supplier_formset"] = SupplierRelationFormSet(self.request.POST)
            context["packet_formset"] = PacketFormSet(self.request.POST)
        else:
            context["parameter_formset"] = ComponentParameterFormSet()
            context["document_formset"] = DocumentFormSet()
            context["supplier_formset"] = SupplierRelationFormSet()
            context["packet_formset"] = PacketFormSet()
        return context

    def form_valid(self, form):
        context = self.get_context_data()
        parameter_formset = context["parameter_formset"]
        document_formset = context["document_formset"]
        supplier_formset = context["supplier_formset"]
        packet_formset = context["packet_formset"]

        if (parameter_formset.is_valid() and document_formset.is_valid() and
            supplier_formset.is_valid() and packet_formset.is_valid()):
            self.object = form.save()
            parameter_formset.instance = self.object
            parameter_formset.save()
            document_formset.instance = self.object
            document_formset.save()
            supplier_formset.instance = self.object
            supplier_formset.save()
            packet_formset.instance = self.object
            packet_formset.save()
            return redirect(self.object.get_absolute_url())
        else:
            return self.render_to_response(self.get_context_data(form=form))
