import json
from datetime import timedelta

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from nextintranet_backend.authentication import create_unique_service_token
from nextintranet_backend.models.serviceToken import ServiceToken
from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter
from nextintranet_backend.serializers.serviceToken import (
    ServiceTokenCreateSerializer,
    ServiceTokenListSerializer,
)


class ServiceTokenViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ServiceTokenListSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if isinstance(getattr(request, "auth", None), ServiceToken):
            raise PermissionDenied("Service tokens cannot manage service tokens.")

    def get_queryset(self):
        return ServiceToken.objects.filter(created_by=self.request.user).order_by("-created_at")

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = ServiceTokenCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        token = serializer.save()
        payload = ServiceTokenListSerializer(token).data
        payload["raw_token"] = getattr(token, "_raw_token", "")
        return Response(payload, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="scope-options")
    def scope_options(self, request):
        options = [{"value": scope, "label": label} for scope, label in ServiceToken.SCOPE_CHOICES]
        return Response(options)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        token = self.get_object()
        if not token.is_active:
            return Response(ServiceTokenListSerializer(token).data)
        token.is_active = False
        token.save(update_fields=["is_active"])
        return Response(ServiceTokenListSerializer(token).data)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        token = self.get_object()
        if token.is_active:
            return Response(ServiceTokenListSerializer(token).data)
        token.is_active = True
        token.save(update_fields=["is_active"])
        return Response(ServiceTokenListSerializer(token).data)

    @action(detail=False, methods=["post"], url_path="generate-kicad-config")
    def generate_kicad_config(self, request):
        if not self._user_has_area_access(request.user, "warehouse", {"read", "write", "admin"}):
            raise PermissionDenied("You need warehouse read access to create KiCad tokens.")

        name = (request.data.get("name") or "").strip()
        if not name:
            name = f"KiCad token {timezone.now().strftime('%Y-%m-%d %H:%M')}"

        expires_in = request.data.get("expires_in")
        expires_at = None
        if expires_in:
            try:
                expires_at = timezone.now() + timedelta(seconds=int(expires_in))
            except (TypeError, ValueError):
                return Response({"error": "expires_in must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        token, raw_token = create_unique_service_token(
            name=name,
            scopes=[ServiceToken.SCOPE_KICAD_READ],
            created_by=request.user,
            expires_at=expires_at,
        )

        site_url = getattr(settings, "SITE_URL", "http://localhost:8000")
        root_url = f"{site_url.rstrip('/')}/api/kicad/"

        payload = {
            "meta": {"version": 1.0},
            "name": "KiCad HTTP Library",
            "description": "A KiCad library sourced from a REST API",
            "source": {
                "type": "REST_API",
                "api_version": "v1",
                "root_url": root_url,
                "token": raw_token,
                "timeout_parts_seconds": 60,
                "timeout_categories_seconds": 600,
            },
        }

        response = HttpResponse(
            json.dumps(payload),
            content_type="application/json",
            status=status.HTTP_201_CREATED,
        )
        response["Content-Disposition"] = 'attachment; filename="nextIntranet.kicad_httplib"'
        response["X-Service-Token-Id"] = str(token.id)
        response["X-Service-Token-Prefix"] = token.token_prefix
        return response

    @action(detail=False, methods=["post"], url_path="generate-mcp-config")
    def generate_mcp_config(self, request):
        name = (request.data.get("name") or "").strip()
        if not name:
            name = f"MCP token {timezone.now().strftime('%Y-%m-%d %H:%M')}"

        scope = request.data.get("scope", "read")
        if scope == "write":
            scopes = [ServiceToken.SCOPE_MCP_READ, ServiceToken.SCOPE_MCP_WRITE]
        else:
            scopes = [ServiceToken.SCOPE_MCP_READ]

        expires_at = None
        expires_in = request.data.get("expires_in")
        if expires_in:
            try:
                expires_at = timezone.now() + timedelta(seconds=int(expires_in))
            except (TypeError, ValueError):
                return Response({"error": "expires_in must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        token, raw_token = create_unique_service_token(
            name=name,
            scopes=scopes,
            created_by=request.user,
            expires_at=expires_at,
        )

        site_url = getattr(settings, "SITE_URL", "http://localhost:8000")
        mcp_url = f"{site_url.rstrip('/')}/mcp"

        mcp_config = {
            "mcpServers": {
                "nextintranet-warehouse": {
                    "url": mcp_url,
                    "headers": {
                        "X-Service-Token": raw_token,
                    },
                },
            },
        }

        return Response({
            "config": mcp_config,
            "token_id": str(token.id),
            "token_prefix": token.token_prefix,
        }, status=status.HTTP_201_CREATED)

    def _user_has_area_access(self, user, area, accepted_levels):
        if getattr(user, "is_superuser", False):
            return True
        if not hasattr(user, "access_permissions"):
            return False
        return user.access_permissions.filter(area=area, level__in=accepted_levels).exists()


ServiceTokenRouter = DefaultRouter()
ServiceTokenRouter.register(r"", ServiceTokenViewSet, basename="service-token")
