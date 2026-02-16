import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class ServiceToken(models.Model):
    SCOPE_API_READ = "api:read"
    SCOPE_API_ALL = "api:all"
    SCOPE_KICAD_READ = "kicad:read"
    SCOPE_PRINT_RENDER = "print:render"
    SCOPE_MCP_READ = "mcp:read"
    SCOPE_MCP_WRITE = "mcp:write"

    SCOPE_CHOICES = [
        (SCOPE_API_READ, "API read-only"),
        (SCOPE_API_ALL, "API all"),
        (SCOPE_KICAD_READ, "KiCad read-only"),
        (SCOPE_PRINT_RENDER, "Print render"),
        (SCOPE_MCP_READ, "MCP read-only"),
        (SCOPE_MCP_WRITE, "MCP read-write"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    token_prefix = models.CharField(max_length=16, unique=True)
    token_hash = models.CharField(max_length=64, unique=True)
    scopes = models.JSONField(default=list, blank=True)
    allowed_print_lists = models.ManyToManyField(
        "nextintranet_backend.PrintList",
        blank=True,
        related_name="service_tokens",
    )
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_service_tokens",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.token_prefix})"

    @property
    def is_expired(self):
        if not self.expires_at:
            return False
        return self.expires_at <= timezone.now()

    def has_scope(self, scope):
        if not self.scopes:
            return False
        return scope in self.scopes

    @classmethod
    def allowed_scopes(cls):
        return {scope for scope, _label in cls.SCOPE_CHOICES}
