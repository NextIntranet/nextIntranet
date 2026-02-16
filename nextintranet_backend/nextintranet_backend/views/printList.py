from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from nextintranet_backend.models.printList import PrintList, PrintItem, PrintFile, PrintRenderJob
from nextintranet_backend.serializers.printList import (
    PrintListSerializer,
    PrintQueueSerializer,
    PrintItemSerializer,
    PrintRenderJobSerializer,
)
from rest_framework_simplejwt.authentication import JWTAuthentication
from nextintranet_backend.authentication import ServiceTokenAuthentication
from nextintranet_backend.permissions import IsAuthenticatedOrServiceToken

from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter
from rest_framework.views import APIView
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from django.http import HttpResponse
from io import BytesIO

from nextintranet_backend.labels.factory import LabelGeneratorFactory
from django_q.tasks import async_task


class PrintApi(APIView):
    """
    An API endpoint for generating and returning files based on request body.
    """
    # permission_classes = [None] # Allow any permission for this endpoint

    def post(self, request, *args, **kwargs):
        print("=== PrintApi.post called ===")
        data = request.data
        print(f"Received data: {data}")
        items = data.get('items', [])
        
        # Get format parameters - default show_borders to True
        format_type = data.get('format', 'single')
        skip_labels = data.get('skip_labels', 0)
        show_borders = data.get('show_borders', True)  # Default to showing borders
        color_mode = data.get('color_mode', 'color')

        print(f"Format type: {format_type}")
        print(f"Skip labels: {skip_labels}")
        print(f"Show borders: {show_borders}")
        print(f"Color mode: {color_mode}")
        
        try:
            # Get additional parameters
            params = {
                'width_mm': float(request.query_params.get('width_mm', 63.5)),
                'height_mm': float(request.query_params.get('height_mm', 38.1)),
                'margin_left_mm': float(request.query_params.get('margin_left_mm', 10)),
                'margin_top_mm': float(request.query_params.get('margin_top_mm', 10)),
                'spacing_h_mm': float(request.query_params.get('spacing_h_mm', 5)),
                'spacing_v_mm': float(request.query_params.get('spacing_v_mm', 0)),
                'skip_labels': skip_labels,
                'show_borders': show_borders,
                'color_mode': color_mode,
                'page_margin_left': float(request.query_params.get('page_margin_left', 0)),
                'page_margin_top': float(request.query_params.get('page_margin_top', 0)),
                'page_margin_right': float(request.query_params.get('page_margin_right', 0)),
                'page_margin_bottom': float(request.query_params.get('page_margin_bottom', 0)),
            }
            print(f"Label parameters: {params}")
            
            # Check if any parameter is in data and override query params if present
            for key in ['margin_left_mm', 'margin_top_mm', 'spacing_h_mm', 'spacing_v_mm', 
                        'page_margin_left', 'page_margin_top', 'page_margin_right', 'page_margin_bottom']:
                if key in data:
                    print(f"Overriding {key} from data: {data[key]}")
                    params[key] = float(data[key])
            
            # Create label generator using factory
            print(f"Creating label generator with format: {format_type}")
            generator = LabelGeneratorFactory.create_label_generator(format_type, **params)
            print(f"Generator created: {type(generator).__name__}")
            
            # Generate PDF
            print("Generating PDF...")
            pdf_content = generator.generate_pdf(items)
            print(f"PDF generated, size: {len(pdf_content)} bytes")
            
            # Create response
            print("Creating response...")
            response = HttpResponse(pdf_content, content_type='application/pdf')
            response['Content-Disposition'] = 'attachment; filename="generated_labels.pdf"'
            response['Content-Length'] = len(pdf_content)
            print("Returning response")
            return response
            
        except ValueError as e:
            print(f"ValueError: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            print(f"Exception: {str(e)}")
            print(traceback.format_exc())
            return Response({"error": f"An error occurred: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PrintListViewSet(ModelViewSet):
    """
    A viewset for managing PrintLists.
    """
    queryset = PrintList.objects.all()
    serializer_class = PrintListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Restrict the queryset to only the PrintLists owned by the authenticated user
        or public PrintLists.
        """
        user = self.request.user
        return PrintList.objects.filter(owner=user) | PrintList.objects.filter(is_public=True)

    def get_serializer_class(self):
        if self.action == "list":
            return PrintQueueSerializer
        return PrintListSerializer

    def perform_create(self, serializer):
        instance = serializer.save(owner=self.request.user)
        requested_default = serializer.validated_data.get("is_default")
        self._sync_default(instance, requested_default)

    def perform_update(self, serializer):
        instance = serializer.instance
        if not self.request.user.is_superuser and instance.owner != self.request.user:
            raise PermissionDenied("You can only update your own print queues.")
        instance = serializer.save()
        requested_default = serializer.validated_data.get("is_default")
        self._sync_default(instance, requested_default)

    def _sync_default(self, instance, requested_default):
        if requested_default is True:
            PrintList.objects.filter(owner=instance.owner).exclude(id=instance.id).update(is_default=False)
            if not instance.is_default:
                instance.is_default = True
                instance.save(update_fields=["is_default"])
            return

        if not PrintList.objects.filter(owner=instance.owner, is_default=True).exists():
            instance.is_default = True
            instance.save(update_fields=["is_default"])

    def create(self, request, *args, **kwargs):
        """
        Override create to set the owner of the PrintList to the authenticated user.
        """
        data = request.data.copy()
        data["owner"] = request.user.id
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PrintItemViewSet(ModelViewSet):
    """
    A viewset for managing PrintItems.
    """
    queryset = PrintItem.objects.all()
    serializer_class = PrintItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Restrict the queryset to only the PrintItems belonging to PrintLists
        owned by the authenticated user or public PrintLists.
        """
        user = self.request.user
        queryset = PrintItem.objects.filter(print_list__owner=user) | PrintItem.objects.filter(
            print_list__is_public=True
        )
        print_list_id = self.request.query_params.get("print_list")
        if print_list_id:
            queryset = queryset.filter(print_list_id=print_list_id)
        return queryset.order_by("-created_at")


class PrintRenderJobViewSet(ModelViewSet):
    queryset = PrintRenderJob.objects.all()
    serializer_class = PrintRenderJobSerializer
    permission_classes = [IsAuthenticatedOrServiceToken]
    authentication_classes = [JWTAuthentication, ServiceTokenAuthentication]
    http_method_names = ["get", "post"]

    def get_queryset(self):
        service_token = self._get_service_token()
        if service_token:
            allowed_lists = service_token.allowed_print_lists.values_list("id", flat=True)
            return PrintRenderJob.objects.filter(print_list_id__in=allowed_lists).order_by("-created_at")
        user = self.request.user
        return PrintRenderJob.objects.filter(owner=user).order_by("-created_at")

    def create(self, request, *args, **kwargs):
        service_token = self._get_service_token()
        user = request.user
        data = request.data or {}
        print_list_id = data.get("print_list")
        item_ids = data.get("print_item_ids") or data.get("items") or []
        if isinstance(item_ids, str):
            item_ids = [item_ids]
        payload = data.get("payload") or {}

        if not print_list_id and not item_ids:
            return Response(
                {"error": "Provide print_list or print_item_ids."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for key in [
            "format",
            "skip_labels",
            "show_borders",
            "color_mode",
            "width_mm",
            "height_mm",
            "margin_left_mm",
            "margin_top_mm",
            "spacing_h_mm",
            "spacing_v_mm",
            "page_margin_left",
            "page_margin_top",
            "page_margin_right",
            "page_margin_bottom",
        ]:
            if key in data and key not in payload:
                payload[key] = data[key]

        if service_token and service_token.scopes:
            scopes = set(service_token.scopes)
            if "print:render" not in scopes and "api:all" not in scopes:
                return Response({"error": "Service token scope denied."}, status=status.HTTP_403_FORBIDDEN)

        print_list = self._resolve_print_list(user, print_list_id, service_token)
        if print_list_id and not print_list:
            return Response({"error": "Print queue not found."}, status=status.HTTP_404_NOT_FOUND)
        if service_token and not print_list:
            return Response({"error": "Service token requires print_list."}, status=status.HTTP_400_BAD_REQUEST)

        items = self._resolve_items(user, print_list_id, item_ids, service_token)
        if not items:
            return Response({"error": "No label items found for rendering."}, status=status.HTTP_400_BAD_REQUEST)

        owner = user
        if service_token:
            owner = print_list.owner
        job = PrintRenderJob.objects.create(owner=owner, print_list=print_list, payload=payload)
        job.items.set(items)

        async_task("nextintranet_backend.tasks.print_render.render_print_job", str(job.id))

        serializer = self.get_serializer(job)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _resolve_items(self, user, print_list_id, item_ids, service_token):
        if service_token:
            allowed_lists = service_token.allowed_print_lists.values_list("id", flat=True)
            queryset = PrintItem.objects.filter(print_list_id__in=allowed_lists)
        else:
            queryset = PrintItem.objects.filter(print_list__owner=user) | PrintItem.objects.filter(
                print_list__is_public=True
            )

        if print_list_id:
            queryset = queryset.filter(print_list_id=print_list_id)
        if item_ids:
            queryset = queryset.filter(id__in=item_ids)
        return list(queryset.filter(kind=PrintItem.KIND_LABEL))

    def _resolve_print_list(self, user, print_list_id, service_token):
        if not print_list_id:
            return None
        if service_token:
            return service_token.allowed_print_lists.filter(id=print_list_id).first()
        queue = PrintList.objects.filter(owner=user, id=print_list_id).first()
        if queue:
            return queue
        return PrintList.objects.filter(is_public=True, id=print_list_id).first()

    def _get_service_token(self):
        auth = getattr(self.request, "auth", None)
        if auth and hasattr(auth, "token_prefix"):
            return auth
        return None


class PrintItemUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        print_list_id = request.data.get("print_list")
        file = request.FILES.get("file")
        name = request.data.get("name") or (file.name if file else None)
        document_format = request.data.get("document_format") or "a4"

        if not print_list_id:
            return Response({"error": "Missing print_list."}, status=status.HTTP_400_BAD_REQUEST)
        if not file:
            return Response({"error": "Missing file."}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        queue = PrintList.objects.filter(owner=user).filter(id=print_list_id).first()
        if not queue:
            queue = PrintList.objects.filter(is_public=True).filter(id=print_list_id).first()
        if not queue:
            return Response({"error": "Print queue not found."}, status=status.HTTP_404_NOT_FOUND)

        print_file = PrintFile.objects.create(
            owner=user,
            name=name or "Untitled document",
            file=file,
            kind=PrintFile.KIND_UPLOADED,
        )

        payload = {"document_format": document_format}

        item = PrintItem.objects.create(
            print_list=queue,
            kind=PrintItem.KIND_DOCUMENT,
            status=PrintItem.STATUS_QUEUED,
            content_object=print_file,
            payload=payload,
        )
        return Response(PrintItemSerializer(item).data, status=status.HTTP_201_CREATED)


class PrintItemAddView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        target_type = request.data.get("target_type")
        target_id = request.data.get("target_id")
        kind = request.data.get("kind") or PrintItem.KIND_LABEL
        queue_id = request.data.get("print_list")
        payload = request.data.get("payload") or {}

        if not target_type or not target_id:
            return Response({"error": "Missing target type or ID."}, status=status.HTTP_400_BAD_REQUEST)

        target_map = self._target_map()
        model = target_map.get(target_type)
        if not model:
            return Response({"error": "Unsupported target type."}, status=status.HTTP_400_BAD_REQUEST)

        target = model.objects.filter(id=target_id).first()
        if not target:
            return Response({"error": "Target not found."}, status=status.HTTP_404_NOT_FOUND)

        queue = self._get_queue(request.user, queue_id)
        if not queue:
            return Response({"error": "Print queue not found."}, status=status.HTTP_404_NOT_FOUND)

        if kind not in dict(PrintItem.KIND_CHOICES):
            return Response({"error": "Unsupported print item type."}, status=status.HTTP_400_BAD_REQUEST)

        item = PrintItem.objects.create(
            print_list=queue,
            kind=kind,
            status=PrintItem.STATUS_QUEUED,
            content_object=target,
            payload=payload,
        )
        return Response(PrintItemSerializer(item).data, status=status.HTTP_201_CREATED)

    def _target_map(self):
        from nextintranet_warehouse.models.component import Packet, Component
        from nextintranet_warehouse.models.warehouse import Warehouse

        return {
            "packet": Packet,
            "location": Warehouse,
            "component": Component,
        }

    def _get_queue(self, user, queue_id):
        if queue_id:
            queue = PrintList.objects.filter(id=queue_id).filter(owner=user).first()
            if queue:
                return queue
            return PrintList.objects.filter(id=queue_id, is_public=True).first()

        return PrintList.objects.filter(owner=user, is_default=True).first()
    


PrintListRouter = DefaultRouter()
PrintListRouter.register(r'', PrintListViewSet, basename='printlist')

PrintItemRouter = DefaultRouter()
PrintItemRouter.register(r'', PrintItemViewSet, basename='printitem')

PrintRenderJobRouter = DefaultRouter()
PrintRenderJobRouter.register(r'', PrintRenderJobViewSet, basename='printrenderjob')
