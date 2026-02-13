import hashlib
import secrets
from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from nextintranet_backend.models.serviceToken import ServiceToken


SERVICE_TOKEN_HEADER = "X-Service-Token"


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

        token.last_used_at = timezone.now()
        token.save(update_fields=["last_used_at"])
        return ServiceTokenPrincipal(token), token

    def _get_raw_token(self, request):
        header_token = request.headers.get(SERVICE_TOKEN_HEADER)
        if header_token:
            return header_token.strip()

        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) == 2 and parts[0].lower() == "service":
            return parts[1].strip()
        return None
