from rest_framework import serializers

from nextintranet_backend.labels.template import validate_template_definition
from nextintranet_backend.models.labelTemplate import LABEL_FORMATS, LabelTemplate


class LabelTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabelTemplate
        fields = [
            "id",
            "name",
            "label_type",
            "enabled",
            "supported_formats",
            "is_default",
            "definition",
            "created_at",
            "updated_at",
        ]

    def validate_supported_formats(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError("Select at least one supported format.")
        invalid = [item for item in value if item not in LABEL_FORMATS]
        if invalid:
            raise serializers.ValidationError(
                f"Unknown formats: {invalid}. Valid formats: {LABEL_FORMATS}."
            )
        return value

    def validate_definition(self, value):
        errors = validate_template_definition(value)
        if errors:
            raise serializers.ValidationError(errors)
        return value
