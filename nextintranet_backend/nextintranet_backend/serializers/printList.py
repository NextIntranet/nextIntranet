from rest_framework import serializers
from nextintranet_backend.models.printList import PrintList, PrintItem, PrintRenderJob


class PrintItemSerializer(serializers.ModelSerializer):
    """
    Serializer for PrintItem model.
    """

    content_type_model = serializers.SerializerMethodField()
    content_label = serializers.SerializerMethodField()
    content_url = serializers.SerializerMethodField()

    class Meta:
        model = PrintItem
        fields = [
            "id",
            "print_list",
            "kind",
            "status",
            "payload",
            "content_type",
            "object_id",
            "content_type_model",
            "content_label",
            "content_url",
            "created_at",
            "printed_at",
        ]

    def get_content_type_model(self, obj):
        return obj.content_type.model if obj.content_type else None

    def get_content_label(self, obj):
        content = obj.content_object
        if not content:
            return None
        if obj.content_type and obj.content_type.model == "packet":
            serial_code = getattr(content, "serial_code", "") or ""
            component = getattr(content, "component", None)
            component_name = getattr(component, "name", "") if component else ""
            detail = " ".join(part for part in [serial_code, component_name] if part)
            return f"Packet {detail}".strip() if detail else f"Packet {obj.object_id}"
        if hasattr(content, "name") and content.name:
            return content.name
        return str(getattr(content, "id", content))

    def get_content_url(self, obj):
        content = obj.content_object
        if not content:
            return None
        if hasattr(content, "url"):
            try:
                return content.url
            except Exception:
                return None
        if hasattr(content, "get_url"):
            try:
                return content.get_url
            except Exception:
                return None
        return None


class PrintQueueSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for print queues.
    """

    items_count = serializers.SerializerMethodField()

    class Meta:
        model = PrintList
        fields = [
            "id",
            "name",
            "created_at",
            "printed_at",
            "owner",
            "is_public",
            "is_default",
            "items_count",
        ]

    def get_items_count(self, obj):
        return obj.items.count()


class PrintListSerializer(serializers.ModelSerializer):
    """
    Serializer for PrintList model.
    Includes nested PrintItems.
    """

    items = PrintItemSerializer(many=True, read_only=True)

    class Meta:
        model = PrintList
        fields = "__all__"
        # read_only_fields = ['owner', 'created_at', 'updated_at']


class PrintRenderJobSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    expires_at = serializers.SerializerMethodField()
    items = serializers.PrimaryKeyRelatedField(read_only=True, many=True)

    class Meta:
        model = PrintRenderJob
        fields = [
            "id",
            "status",
            "payload",
            "print_list",
            "items",
            "file",
            "file_url",
            "expires_at",
            "error",
            "created_at",
            "completed_at",
        ]

    def get_file_url(self, obj):
        if not obj.file:
            return None
        return obj.file.url

    def get_expires_at(self, obj):
        if not obj.file:
            return None
        return obj.file.expires_at
