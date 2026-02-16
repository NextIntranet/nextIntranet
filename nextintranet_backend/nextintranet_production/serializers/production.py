from rest_framework import serializers
from nextintranet_production.models import (
    ProductionFolder,
    Production,
    Template,
    TemplateComponent,
    Realization,
    RealizationComponent,
    TemplateComponentScan,
)
from nextintranet_warehouse.serializers.components import ComponentSerializer


class ProductionFolderSerializer(serializers.ModelSerializer):
    """Serializer pro ProductionFolder s podporou hierarchie"""
    children = serializers.SerializerMethodField()
    full_path = serializers.ReadOnlyField()
    
    class Meta:
        model = ProductionFolder
        fields = ['id', 'name', 'description', 'parent', 'children', 'full_path', 'created_at']
    
    def get_children(self, obj):
        if hasattr(obj, 'get_children'):
            children = obj.get_children()
            return ProductionFolderSerializer(children, many=True).data
        return []


class ProductionFolderListSerializer(serializers.ModelSerializer):
    """Jednoduchý serializer pro seznam složek bez children"""
    full_path = serializers.ReadOnlyField()
    
    class Meta:
        model = ProductionFolder
        fields = ['id', 'name', 'description', 'parent', 'full_path', 'created_at']


class TemplateComponentScanInlineSerializer(serializers.ModelSerializer):
    class Meta:
        model = TemplateComponentScan
        fields = [
            'id',
            'mode',
            'barcode',
            'resolved_component',
            'resolved_packet_id',
            'qty',
            'created_at',
        ]


class TemplateComponentSerializer(serializers.ModelSerializer):
    """Serializer pro TemplateComponent"""
    component_detail = ComponentSerializer(source='component', read_only=True)
    component_name = serializers.CharField(source='component.name', read_only=True)
    linked_component = serializers.UUIDField(source='component.id', read_only=True)
    component_kicad_footprint = serializers.SerializerMethodField()
    scans = TemplateComponentScanInlineSerializer(many=True, read_only=True)
    
    class Meta:
        model = TemplateComponent
        fields = [
            'id', 'template', 'component', 'component_detail', 'component_name',
            'linked_component', 'component_kicad_footprint',
            'position', 'notes', 'attributes',
            'source_type', 'ref_group', 'refs',
            'qty_per_board', 'qty_override_total',
            'value', 'footprint', 'datasheet', 'bom_description',
            'dnp', 'needs_review', 'import_snapshot',
            'sourced_total', 'placed_total', 'scans',
            'created_at'
        ]

    def get_component_kicad_footprint(self, obj):
        component = getattr(obj, 'component', None)
        if not component:
            return None

        parameters = component.parameters.select_related('parameter_type').all()
        fallback_value = None
        for parameter in parameters:
            parameter_name = (parameter.parameter_type.name if parameter.parameter_type else '') or ''
            name_normalized = parameter_name.strip().lower()
            value = (parameter.value or '').strip()
            if not value:
                continue
            if name_normalized == 'kicad:footprint':
                return value
            if name_normalized in {'kicad footprint', 'kicad_footprint'}:
                fallback_value = value
        return fallback_value


class TemplateSerializer(serializers.ModelSerializer):
    """Serializer pro Template"""
    components = TemplateComponentSerializer(many=True, read_only=True)
    production_name = serializers.CharField(source='production.name', read_only=True)
    components_count = serializers.SerializerMethodField()
    source_file_url = serializers.SerializerMethodField()
    ibom_file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Template
        fields = [
            'id', 'production', 'production_name', 'name', 'description', 
            'version',
            'status', 'qty_planned', 'planned_date',
            'source_url', 'source_hash', 'source_file', 'source_file_url', 'source_imported_at',
            'ibom_url', 'ibom_file', 'ibom_file_url', 'ibom_updated_at',
            'production_checkpoint', 'locked_at', 'locked_by',
            'components', 'components_count', 'created_at'
        ]
    
    def get_components_count(self, obj):
        return obj.components.count()

    def get_source_file_url(self, obj):
        if obj.source_file:
            return obj.source_file.url
        return None

    def get_ibom_file_url(self, obj):
        if obj.ibom_file:
            return obj.ibom_file.url
        return None


class TemplateListSerializer(serializers.ModelSerializer):
    """Jednoduchý serializer pro seznam šablon"""
    production_name = serializers.CharField(source='production.name', read_only=True)
    components_count = serializers.SerializerMethodField()
    source_file_url = serializers.SerializerMethodField()
    ibom_file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Template
        fields = [
            'id', 'production', 'production_name', 'name', 
            'version',
            'status', 'qty_planned', 'planned_date',
            'source_url', 'source_hash', 'source_file_url', 'source_imported_at',
            'ibom_url', 'ibom_file_url', 'ibom_updated_at',
            'locked_at',
            'components_count', 'created_at'
        ]
    
    def get_components_count(self, obj):
        return obj.components.count()

    def get_source_file_url(self, obj):
        if obj.source_file:
            return obj.source_file.url
        return None

    def get_ibom_file_url(self, obj):
        if obj.ibom_file:
            return obj.ibom_file.url
        return None


class RealizationComponentSerializer(serializers.ModelSerializer):
    """Serializer pro RealizationComponent"""
    component_detail = ComponentSerializer(source='component', read_only=True)
    component_name = serializers.CharField(source='component.name', read_only=True)
    template_component_id = serializers.UUIDField(source='template_component.id', read_only=True)
    
    class Meta:
        model = RealizationComponent
        fields = [
            'id', 'realization', 'template_component', 'template_component_id',
            'component', 'component_detail', 'component_name',
            'position', 'notes', 'attributes', 'is_modified', 'created_at'
        ]


class RealizationSerializer(serializers.ModelSerializer):
    """Serializer pro Realization"""
    components = RealizationComponentSerializer(many=True, read_only=True)
    production_name = serializers.CharField(source='production.name', read_only=True)
    template_name = serializers.CharField(source='template.name', read_only=True)
    components_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Realization
        fields = [
            'id', 'production', 'production_name', 'template', 'template_name',
            'name', 'description', 'status', 'started_at', 'completed_at',
            'components', 'components_count', 'created_at'
        ]
    
    def get_components_count(self, obj):
        return obj.components.count()


class RealizationListSerializer(serializers.ModelSerializer):
    """Jednoduchý serializer pro seznam realizací"""
    production_name = serializers.CharField(source='production.name', read_only=True)
    template_name = serializers.CharField(source='template.name', read_only=True)
    components_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Realization
        fields = [
            'id', 'production', 'production_name', 'template', 'template_name',
            'name', 'status', 'started_at', 'completed_at',
            'components_count', 'created_at'
        ]
    
    def get_components_count(self, obj):
        return obj.components.count()


class ProductionSerializer(serializers.ModelSerializer):
    """Serializer pro Production s detaily"""
    templates = TemplateListSerializer(many=True, read_only=True)
    realizations = RealizationListSerializer(many=True, read_only=True)
    folder_name = serializers.CharField(source='folder.name', read_only=True)
    component_reference_detail = ComponentSerializer(source='component_reference', read_only=True)
    templates_count = serializers.SerializerMethodField()
    realizations_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Production
        fields = [
            'id', 'name', 'description', 'folder', 'folder_name',
            'link', 'component_reference', 'component_reference_detail',
            'templates', 'templates_count', 'realizations', 'realizations_count',
            'created_at'
        ]
    
    def get_templates_count(self, obj):
        return obj.templates.count()
    
    def get_realizations_count(self, obj):
        return obj.realizations.count()


class ProductionListSerializer(serializers.ModelSerializer):
    """Jednoduchý serializer pro seznam productions"""
    folder_name = serializers.CharField(source='folder.name', read_only=True)
    folder_path = serializers.CharField(source='folder.full_path', read_only=True)
    templates_count = serializers.SerializerMethodField()
    realizations_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Production
        fields = [
            'id', 'name', 'description', 'folder', 'folder_name', 'folder_path',
            'link', 'component_reference', 'templates_count', 'realizations_count',
            'created_at'
        ]
    
    def get_templates_count(self, obj):
        return obj.templates.count()
    
    def get_realizations_count(self, obj):
        return obj.realizations.count()


class TemplateComponentScanSerializer(serializers.ModelSerializer):
    resolved_component_detail = ComponentSerializer(source='resolved_component', read_only=True)

    class Meta:
        model = TemplateComponentScan
        fields = [
            'id',
            'template',
            'template_component',
            'mode',
            'barcode',
            'resolved_component',
            'resolved_component_detail',
            'resolved_packet_id',
            'qty',
            'created_at',
        ]
