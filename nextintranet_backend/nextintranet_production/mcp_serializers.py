from rest_framework import serializers

from nextintranet_production.models import Production, Template, TemplateComponent


class MCPProductionListSerializer(serializers.ModelSerializer):
    folder_id = serializers.UUIDField(read_only=True, allow_null=True)
    folder_name = serializers.CharField(source="folder.name", read_only=True, default=None)
    component_reference_id = serializers.UUIDField(source="component_reference.id", read_only=True, default=None)
    boms_count = serializers.SerializerMethodField()

    class Meta:
        model = Production
        fields = [
            "id", "name", "description", "folder_id", "folder_name",
            "link", "component_reference_id", "boms_count",
        ]

    def get_boms_count(self, obj):
        return obj.templates.count()


class MCPProductionSerializer(MCPProductionListSerializer):
    class Meta(MCPProductionListSerializer.Meta):
        fields = MCPProductionListSerializer.Meta.fields + ["created_at"]


class MCPBomLineSerializer(serializers.ModelSerializer):
    component_id = serializers.UUIDField(source="component.id", read_only=True, default=None)
    component_name = serializers.CharField(source="component.name", read_only=True, default=None)
    sourced_total = serializers.FloatField(read_only=True)
    placed_total = serializers.FloatField(read_only=True)
    qty_override_total = serializers.FloatField(read_only=True, allow_null=True)

    class Meta:
        model = TemplateComponent
        fields = [
            "id", "position", "refs", "ref_group",
            "value", "footprint", "datasheet", "bom_description", "notes",
            "qty_per_board", "qty_override_total",
            "dnp", "exclude_from_bom", "needs_review",
            "component_id", "component_name",
            "sourced_total", "placed_total",
        ]


class MCPBomListSerializer(serializers.ModelSerializer):
    production_id = serializers.UUIDField(source="production.id", read_only=True)
    production_name = serializers.CharField(source="production.name", read_only=True)
    lines_count = serializers.SerializerMethodField()

    class Meta:
        model = Template
        fields = [
            "id", "production_id", "production_name", "name", "version",
            "series_kind", "status", "qty_planned", "planned_date",
            "locked_at", "lines_count", "created_at",
        ]

    def get_lines_count(self, obj):
        return obj.components.count()


class MCPBomDetailSerializer(MCPBomListSerializer):
    locked_by_name = serializers.CharField(source="locked_by.full_name", read_only=True, default=None)
    lines = MCPBomLineSerializer(source="components", many=True, read_only=True)

    class Meta(MCPBomListSerializer.Meta):
        fields = MCPBomListSerializer.Meta.fields + [
            "description", "source_url", "ibom_url", "locked_by_name", "lines",
        ]
