from django.http import JsonResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from nextintranet_backend.models.branding import BrandingSettings


ALLOWED_LOGO_CONTENT_TYPES = {"image/png", "image/jpeg"}
BRANDING_TEXT_FIELDS = {
    "company_name",
    "company_short_name",
    "theme_color",
    "background_color",
}


def _build_icon(src, sizes, purpose="any"):
    icon = {"src": src, "sizes": sizes, "type": "image/png"}
    if purpose and purpose != "any":
        icon["purpose"] = purpose
    return icon


def pwa_manifest_view(request):
    """
    Public PWA manifest that reflects current branding settings.
    The browser fetches this without authentication when installing the app.
    """
    branding = BrandingSettings.objects.first()

    if branding:
        name = branding.company_name or "NextIntranet"
        short_name = branding.company_short_name or name
        theme_color = branding.theme_color or "#0f172a"
        background_color = branding.background_color or "#ffffff"
    else:
        name = "NextIntranet"
        short_name = "NextIntranet"
        theme_color = "#0f172a"
        background_color = "#ffffff"

    icon_192 = branding.pwa_icon_192.url if branding and branding.pwa_icon_192 else "/pwa-192x192.png"
    icon_512 = branding.pwa_icon_512.url if branding and branding.pwa_icon_512 else "/pwa-512x512.png"
    icon_maskable = (
        branding.pwa_icon_maskable.url
        if branding and branding.pwa_icon_maskable
        else "/maskable-icon-512x512.png"
    )

    manifest = {
        "name": name,
        "short_name": short_name,
        "start_url": "/",
        "display": "standalone",
        "background_color": background_color,
        "theme_color": theme_color,
        "icons": [
            _build_icon(icon_192, "192x192"),
            _build_icon(icon_512, "512x512"),
            _build_icon(icon_maskable, "512x512", "maskable"),
        ],
    }
    response = JsonResponse(manifest)
    response["Cache-Control"] = "public, max-age=60"
    return response


class BrandingSettingsView(APIView):
    """
    Organization branding (logo used on labels and PWA).
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

        branding = BrandingSettings.get_solo()
        updated_text = False
        for field in BRANDING_TEXT_FIELDS:
            if field in request.data:
                value = request.data[field]
                if value is not None:
                    setattr(branding, field, value)
                    updated_text = True

        file = request.FILES.get("logo")
        if file:
            if file.content_type not in ALLOWED_LOGO_CONTENT_TYPES:
                return Response(
                    {"error": "Unsupported logo format. Upload a PNG or JPEG image."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if branding.logo:
                branding.logo.delete(save=False)
            branding._clear_pwa_icons()
            branding.logo = file
            branding.generate_pwa_icons()
            updated_text = True
        elif updated_text and branding.logo:
            # Colors or names changed but logo stayed the same; keep icons current.
            pass

        if updated_text or request.FILES:
            branding.save()

        return Response(self._serialize(branding))

    def delete(self, request, *args, **kwargs):
        if not self._can_manage(request.user):
            return Response(
                {"error": "Only administrators can change branding."},
                status=status.HTTP_403_FORBIDDEN,
            )
        branding = BrandingSettings.objects.first()
        if branding:
            branding._clear_pwa_icons()
            if branding.logo:
                branding.logo.delete(save=False)
                branding.logo = None
            branding.save()
        return Response(self._serialize(branding))

    def _can_manage(self, user):
        return bool(user.is_staff or user.is_superuser)

    def _serialize(self, branding):
        if not branding:
            return {
                "company_name": "NextIntranet",
                "company_short_name": "NextIntranet",
                "theme_color": "#0f172a",
                "background_color": "#ffffff",
                "logo_url": None,
                "pwa_icon_192_url": None,
                "pwa_icon_512_url": None,
                "pwa_icon_maskable_url": None,
                "updated_at": None,
            }
        return {
            "company_name": branding.company_name or "NextIntranet",
            "company_short_name": branding.company_short_name or branding.company_name or "NextIntranet",
            "theme_color": branding.theme_color or "#0f172a",
            "background_color": branding.background_color or "#ffffff",
            "logo_url": branding.logo_url,
            "pwa_icon_192_url": branding.pwa_icon_192.url if branding.pwa_icon_192 else None,
            "pwa_icon_512_url": branding.pwa_icon_512.url if branding.pwa_icon_512 else None,
            "pwa_icon_maskable_url": branding.pwa_icon_maskable.url if branding.pwa_icon_maskable else None,
            "updated_at": branding.updated_at,
        }
