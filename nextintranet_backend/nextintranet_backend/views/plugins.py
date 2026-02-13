from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated, SAFE_METHODS
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from nextintranet_backend.models.plugin import PluginInstance
from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter
from nextintranet_backend.serializers.plugin import PluginInstanceSerializer
from nextintranet_plugins import get_plugin_definition


class IsSuperuserOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


def user_can_access_instance(user, instance):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if not instance.enabled:
        return False
    role_ids = list(instance.roles.values_list("id", flat=True))
    if not role_ids:
        return True
    user_group_ids = set(user.groups.values_list("id", flat=True))
    return any(role_id in user_group_ids for role_id in role_ids)


class PluginInstanceViewSet(ModelViewSet):
    serializer_class = PluginInstanceSerializer
    permission_classes = [IsAuthenticated, IsSuperuserOrReadOnly]

    def get_queryset(self):
        if self.request.user.is_superuser:
            return PluginInstance.objects.all()

        user_groups = self.request.user.groups.all()
        return PluginInstance.objects.filter(enabled=True).filter(
            Q(roles__in=user_groups) | Q(roles__isnull=True)
        ).distinct()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        data = []
        for instance in queryset:
            definition = get_plugin_definition(instance.definition_key)
            if not definition:
                continue
            data.append(
                {
                    "id": str(instance.id),
                    "definition_key": instance.definition_key,
                    "name": instance.name,
                    "enabled": instance.enabled,
                    "config": instance.config or {},
                    "capabilities": definition.capabilities,
                    "definition_name": definition.name,
                    "definition_version": definition.version,
                    "config_schema": definition.config_schema,
                }
            )
        return Response(data)


class PluginExecuteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        instance = PluginInstance.objects.filter(pk=pk).first()
        if not instance:
            return Response({"error": "Plugin instance not found."}, status=status.HTTP_404_NOT_FOUND)

        if not user_can_access_instance(request.user, instance):
            return Response({"error": "Access denied for this plugin instance."}, status=status.HTTP_403_FORBIDDEN)

        definition = get_plugin_definition(instance.definition_key)
        if not definition or not definition.execute:
            return Response({"error": "Plugin instance is not executable."}, status=status.HTTP_400_BAD_REQUEST)

        payload = request.data or {}
        result = definition.execute(instance, payload, request.user)
        return Response(result, status=status.HTTP_200_OK)


PluginInstanceRouter = DefaultRouter()
PluginInstanceRouter.register(r"instances", PluginInstanceViewSet, basename="plugin-instance")
