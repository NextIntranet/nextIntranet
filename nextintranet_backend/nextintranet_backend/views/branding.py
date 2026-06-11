from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from nextintranet_backend.models.branding import BrandingSettings

ALLOWED_LOGO_CONTENT_TYPES = {"image/png", "image/jpeg"}


class BrandingSettingsView(APIView):
    """
    Organization branding (logo used on labels).
    GET is available to all authenticated users; modifications require staff.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        branding = BrandingSettings.objects.first()
        return Response(self._serialize(branding))

    def post(self, request, *args, **kwargs):
        if not self._can_manage(request.user):
            return Response(
                {"error": "Only administrators can change branding."},
                status=status.HTTP_403_FORBIDDEN,
            )
        file = request.FILES.get("logo")
        if not file:
            return Response({"error": "Missing logo file."}, status=status.HTTP_400_BAD_REQUEST)
        if file.content_type not in ALLOWED_LOGO_CONTENT_TYPES:
            return Response(
                {"error": "Unsupported logo format. Upload a PNG or JPEG image."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        branding = BrandingSettings.get_solo()
        if branding.logo:
            branding.logo.delete(save=False)
        branding.logo = file
        branding.save()
        return Response(self._serialize(branding))

    def delete(self, request, *args, **kwargs):
        if not self._can_manage(request.user):
            return Response(
                {"error": "Only administrators can change branding."},
                status=status.HTTP_403_FORBIDDEN,
            )
        branding = BrandingSettings.objects.first()
        if branding and branding.logo:
            branding.logo.delete(save=False)
            branding.logo = None
            branding.save()
        return Response(self._serialize(branding))

    def _can_manage(self, user):
        return bool(user.is_staff or user.is_superuser)

    def _serialize(self, branding):
        return {
            "logo_url": branding.logo_url if branding else None,
            "updated_at": branding.updated_at if branding else None,
        }
