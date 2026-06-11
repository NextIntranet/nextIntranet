from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from nextintranet_backend.labels.factory import LabelGeneratorFactory
from nextintranet_backend.labels.resolver import cleanup_logo_file, prepare_logo_file
from nextintranet_backend.labels.template import (
    TemplateLabelGenerator,
    validate_template_definition,
)
from nextintranet_backend.models.labelTemplate import LabelTemplate
from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter
from nextintranet_backend.serializers.labelTemplate import LabelTemplateSerializer


class IsStaffOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user.is_staff or request.user.is_superuser)


class LabelTemplateViewSet(ModelViewSet):
    queryset = LabelTemplate.objects.all()
    serializer_class = LabelTemplateSerializer
    permission_classes = [IsStaffOrReadOnly]

    def get_queryset(self):
        queryset = LabelTemplate.objects.all()
        label_type = self.request.query_params.get("label_type")
        if label_type:
            queryset = queryset.filter(label_type=label_type)
        format_type = self.request.query_params.get("format")
        if format_type:
            matching_ids = [
                template.id for template in queryset if template.supports_format(format_type)
            ]
            queryset = queryset.filter(id__in=matching_ids)
        return queryset

    def perform_create(self, serializer):
        instance = serializer.save()
        self._sync_default(instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        self._sync_default(instance)

    def _sync_default(self, instance):
        if instance.is_default:
            LabelTemplate.objects.filter(label_type=instance.label_type, is_default=True).exclude(
                id=instance.id
            ).update(is_default=False)


class LabelTemplatePreviewView(APIView):
    """
    Render a template definition with sample data and return the PDF.
    Used by the template editor for live preview; nothing is persisted.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        data = request.data or {}
        definition = data.get("definition")
        label_type = data.get("label_type") or "packet"
        color_mode = data.get("color_mode", "color")
        show_logo = data.get("show_logo")
        show_logo = True if show_logo is None else bool(show_logo)

        errors = validate_template_definition(definition)
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        canvas = definition.get("canvas") or {}
        width_mm = float(canvas.get("width_mm") or 66.04)
        height_mm = float(canvas.get("height_mm") or 38.1)

        logo_path = prepare_logo_file(color_mode=color_mode)
        try:
            content_generator = TemplateLabelGenerator(
                label_type,
                definition,
                color_mode=color_mode,
                logo_path=logo_path,
                show_logo=show_logo,
            )
            generator = LabelGeneratorFactory.create_label_generator(
                "single",
                width_mm=width_mm,
                height_mm=height_mm,
                color_mode=color_mode,
                content_overrides={label_type: content_generator},
            )
            pdf_content = generator.generate_pdf(
                [{"type": label_type, "data": {"sample": True}}]
            )
        except Exception as exc:
            return Response(
                {"errors": [f"Preview rendering failed: {exc}"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        finally:
            cleanup_logo_file(logo_path)

        response = HttpResponse(pdf_content, content_type="application/pdf")
        response["Content-Disposition"] = 'inline; filename="template_preview.pdf"'
        return response


LabelTemplateRouter = DefaultRouter()
LabelTemplateRouter.register(r"", LabelTemplateViewSet, basename="labeltemplate")
