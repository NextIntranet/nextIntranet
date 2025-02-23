from django.shortcuts import redirect
from django.urls import reverse
from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed


def debug_middleware(get_response):
    def middleware(request):
        print(f"Authorization Header: {request.META.get('HTTP_AUTHORIZATION')}")
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

        # Pokud není uživatel autentizován, přesměrujte na login (pokud není výjimka)
        #if not request.user.is_authenticated and not self._is_exempt_path(request):
        #    return redirect(f"{settings.LOGIN_URL}?next={request.path}")

        return self.get_response(request)

    def _is_exempt_path(self, request):
        exempt_paths = [
            reverse('login'),
            reverse('token_obtain_pair'),
            reverse('token_refresh'),
            reverse('graphql'),
        ]
        return any(request.path.startswith(path) for path in exempt_paths)


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