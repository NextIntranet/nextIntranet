from django.shortcuts import redirect
from django.urls import reverse
from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.http import JsonResponse


def _mask_secret(value):
    if not value:
        return ""
    value = str(value)
    if len(value) <= 10:
        return f"{value[:2]}..."
    return f"{value[:4]}...{value[-4:]}"


def debug_middleware(get_response):
    def middleware(request):
        authorization = request.META.get("HTTP_AUTHORIZATION")
        service_token = request.META.get("HTTP_X_SERVICE_TOKEN")
        print(f"Authorization Header: {_mask_secret(authorization)}")
        print(f"Service Token Header: {_mask_secret(service_token)}")
        print(f"User: {request.user}")
        return get_response(request)
    return middleware


class LoginRequiredMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.jwt_auth = JWTAuthentication()

    def __call__(self, request):
        request.auth_method = None

        # Pokus o autentizaci pomocí JWT tokenu
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            print("JWT token found")
            try:
                user, _ = self.jwt_auth.authenticate(request)
                if user:
                    request.user = user
                    request.auth_method = 'jwt'
            except AuthenticationFailed:
                pass
        else:
            print("No JWT token found")


        # Service token authentication is handled by DRF authentication classes.
        # If token headers are present, don't block request in Django middleware.
        if self._has_service_token_header(request):
            request.auth_method = "service"
            return self.get_response(request)

        if not request.user.is_authenticated and not self._is_exempt_path(request):
            if request.path.startswith('/api/'):
                response_data = {
                    'detail': 'Not Authenticated'
                }
                return JsonResponse(response_data, status=401)
            return redirect(f"{settings.LOGIN_URL}?next={request.path}")

        return self.get_response(request)

    def _is_exempt_path(self, request):
        exempt_paths = [
            reverse('login'),
            reverse('token_obtain_pair'),
            reverse('token_refresh'),
        ]
        # Django admin has its own authentication
        if request.path.startswith('/admin/'):
            return True
        # KiCad HTTP library API
        if request.path.startswith('/api/kicad/'):
            return True
        # MCP server endpoint
        if request.path.startswith('/mcp'):
            return True
        # Public build/version info
        if request.path.startswith('/api/v1/version'):
            return True
        return any(request.path.startswith(path) for path in exempt_paths)

    def _has_service_token_header(self, request):
        if request.headers.get("X-Service-Token"):
            return True
        auth_header = request.headers.get("Authorization", "")
        auth_header_lower = auth_header.lower()
        return auth_header_lower.startswith("service ") or auth_header_lower.startswith("token ")


class InAppMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user_agent = request.headers.get('User-Agent', '')
        request.in_app = 'NextBrowser' in user_agent
        if request.headers.get("X-PWA", "false") == "true":
            request.in_pwa = True
        else:
            request.in_pwa = False

        print(f"User-Agent: {user_agent}")
        print(f"In App: {request.in_app}")
        print(f"In PWA: {request.in_pwa}")
        return self.get_response(request)
