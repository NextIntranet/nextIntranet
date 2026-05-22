from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from nextintranet_backend.authentication import create_unique_service_token
from nextintranet_backend.models.serviceToken import ServiceToken


TOKEN_SCOPE_CHOICES = [scope for scope, _label in ServiceToken.SCOPE_CHOICES]


class ServiceTokenListSerializer(serializers.ModelSerializer):
    scope_labels = serializers.SerializerMethodField()

    class Meta:
        model = ServiceToken
        fields = [
            "id",
            "name",
            "token_prefix",
            "scopes",
            "scope_labels",
            "is_active",
            "expires_at",
            "last_used_at",
            "created_at",
        ]

    def get_scope_labels(self, instance):
        labels = dict(ServiceToken.SCOPE_CHOICES)
        return [labels.get(scope, scope) for scope in (instance.scopes or [])]


class ServiceTokenCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    scopes = serializers.ListField(
        child=serializers.ChoiceField(choices=TOKEN_SCOPE_CHOICES),
        allow_empty=False,
    )
    expires_in = serializers.IntegerField(min_value=60, required=False, allow_null=True)

    def validate_name(self, value):
        normalized = value.strip()
        if not normalized:
            raise serializers.ValidationError("Token name cannot be empty.")
        return normalized

    def validate_scopes(self, scopes):
        normalized = list(dict.fromkeys(scopes))
        if ServiceToken.SCOPE_API_ALL in normalized and ServiceToken.SCOPE_API_READ in normalized:
            normalized = [scope for scope in normalized if scope != ServiceToken.SCOPE_API_READ]
        return normalized

    def validate(self, attrs):
        user = self.context["request"].user
        scopes = attrs["scopes"]
        if ServiceToken.SCOPE_API_ALL in scopes and not self._user_can_write(user):
            raise serializers.ValidationError(
                {"scopes": "You cannot create an API all token without write/admin permissions."}
            )
        if ServiceToken.SCOPE_KICAD_READ in scopes and not self._user_has_area_access(
            user, "warehouse", {"read", "write", "admin"}
        ):
            raise serializers.ValidationError(
                {"scopes": "You need warehouse read access to create KiCad tokens."}
            )
        if ServiceToken.SCOPE_PRINT_RENDER in scopes and not self._user_has_area_access(
            user, "warehouse-operations", {"read", "write", "admin"}
        ):
            raise serializers.ValidationError(
                {"scopes": "You need warehouse-operations read access for print render tokens."}
            )
        if ServiceToken.SCOPE_MCP_WRITE in scopes and not self._user_has_area_access(
            user, "warehouse", {"write", "admin"}
        ):
            raise serializers.ValidationError(
                {"scopes": "You need warehouse write access to create MCP read-write tokens."}
            )
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        expires_in = validated_data.pop("expires_in", None)
        expires_at = None
        if expires_in:
            expires_at = timezone.now() + timedelta(seconds=expires_in)

        token, raw_token = create_unique_service_token(
            name=validated_data["name"],
            scopes=validated_data["scopes"],
            created_by=request.user,
            expires_at=expires_at,
        )
        token._raw_token = raw_token
        return token

    def _user_can_write(self, user):
        if getattr(user, "is_superuser", False):
            return True
        if not hasattr(user, "access_permissions"):
            return False
        return user.access_permissions.filter(level__in=["write", "admin"]).exists()

    def _user_has_area_access(self, user, area, accepted_levels):
        if getattr(user, "is_superuser", False):
            return True
        if not hasattr(user, "access_permissions"):
            return False
        return user.access_permissions.filter(area=area, level__in=accepted_levels).exists()
