from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from nextintranet_backend.version import get_build_info


class VersionView(APIView):
    """Build/version info for the running intranet. Public so it can show on the
    login screen and About page without authentication."""

    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        return Response(get_build_info())
