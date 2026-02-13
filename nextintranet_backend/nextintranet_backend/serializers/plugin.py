from django.contrib.auth.models import Group
from rest_framework import serializers

from nextintranet_backend.models.plugin import PluginInstance


class PluginInstanceSerializer(serializers.ModelSerializer):
    roles = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Group.objects.all(),
        required=False,
    )

    class Meta:
        model = PluginInstance
        fields = [
            "id",
            "definition_key",
            "name",
            "enabled",
            "config",
            "roles",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["created_at", "updated_at", "created_by"]
