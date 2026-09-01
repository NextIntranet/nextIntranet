import hashlib
import secrets
from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from nextintranet_backend.models.serviceToken import ServiceToken


SERVICE_TOKEN_HEADER = "X-Service-Token"
# Alias header for clients that cannot send X-Service-Token (same "<prefix>.<secret>" value).
APPLICATION_KEY_HEADER = "X-Application-Key"


def hash_service_token(raw_token):
    digest = hashlib.sha256()
    digest.update(settings.SECRET_KEY.encode("utf-8"))
    digest.update(raw_token.encode("utf-8"))
    return digest.hexdigest()


def generate_service_token():
    secret = secrets.token_urlsafe(32)
    prefix = secret[:8]
    raw_token = f"{prefix}.{secret}"
    return raw_token, prefix, hash_service_token(raw_token)


def create_unique_service_token(*, name, scopes, created_by=None, expires_at=None):
    normalized_scopes = list(dict.fromkeys(scopes or []))
    raw_token, prefix, token_hash = generate_service_token()
    while ServiceToken.objects.filter(token_prefix=prefix).exists():
        raw_token, prefix, token_hash = generate_service_token()

    token = ServiceToken.objects.create(
        name=name,
        token_prefix=prefix,
        token_hash=token_hash,
        scopes=normalized_scopes,
        created_by=created_by,
        expires_at=expires_at,
    )
    return token, raw_token


class ServiceTokenPrincipal:
    def __init__(self, token):
        self.token = token
        self.is_authenticated = True
        self.is_service = True
        self.is_staff = False
        self.is_superuser = False

    def __str__(self):
        return f"ServiceToken({self.token.token_prefix})"


class ServiceTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        raw_token = self._get_raw_token(request)
        if not raw_token:
            return None

        prefix = raw_token.split(".", 1)[0]
        token = ServiceToken.objects.filter(token_prefix=prefix, is_active=True).first()
        if not token:
            raise AuthenticationFailed("Invalid service token.")

        if token.is_expired:
            raise AuthenticationFailed("Service token expired.")

        expected_hash = hash_service_token(raw_token)
        if not secrets.compare_digest(token.token_hash, expected_hash):
            raise AuthenticationFailed("Invalid service token.")

        self._enforce_scope_policy(request, token)

        token.last_used_at = timezone.now()
        token.save(update_fields=["last_used_at"])
        if token.created_by and token.created_by.is_active:
            return token.created_by, token
        return ServiceTokenPrincipal(token), token

    def _get_raw_token(self, request):
        for header in (SERVICE_TOKEN_HEADER, APPLICATION_KEY_HEADER):
            header_token = request.headers.get(header)
            if header_token:
                return header_token.strip()

        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) == 2 and parts[0].lower() in {"service", "token"}:
            return parts[1].strip()
        return None

    def _enforce_scope_policy(self, request, token):
        path = request.path or ""
        method = (request.method or "GET").upper()
        is_safe_method = method in {"GET", "HEAD", "OPTIONS"}
        scopes = set(token.scopes or [])

        if path.startswith("/mcp"):
            if ServiceToken.SCOPE_API_ALL in scopes:
                return
            if ServiceToken.SCOPE_MCP_READ in scopes or ServiceToken.SCOPE_MCP_WRITE in scopes:
                return
            raise PermissionDenied("Service token scope denied.")

        if path.startswith("/api/kicad/"):
            if not is_safe_method:
                raise PermissionDenied("Service token scope denied.")
            if ServiceToken.SCOPE_KICAD_READ not in scopes and ServiceToken.SCOPE_API_ALL not in scopes:
                raise PermissionDenied("Service token scope denied.")
            return

        if not path.startswith("/api/v1/"):
            return

        # Backward compatibility for legacy print tokens without API scopes.
        is_print_render = path.startswith("/api/v1/print/render/")
        if not scopes:
            if is_print_render:
                return
            raise PermissionDenied("Service token scope denied.")

        if ServiceToken.SCOPE_API_ALL in scopes:
            return

        if is_print_render and ServiceToken.SCOPE_PRINT_RENDER in scopes:
            return

        if is_safe_method and ServiceToken.SCOPE_API_READ in scopes:
            return

        raise PermissionDenied("Service token scope denied.")
