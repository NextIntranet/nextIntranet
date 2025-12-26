from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from nextintranet_backend.models.printList import PrintList, PrintItem
from nextintranet_backend.serializers.printList import PrintListSerializer, PrintItemSerializer

from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter
from rest_framework.views import APIView
from rest_framework import permissions
from django.http import HttpResponse
from io import BytesIO

from nextintranet_backend.labels.factory import LabelGeneratorFactory


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

    def create(self, request, *args, **kwargs):
        """
        Override create to set the owner of the PrintList to the authenticated user.
        """
        data = request.data.copy()
        data['owner'] = request.user.id
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
        return PrintItem.objects.filter(print_list__owner=user) | PrintItem.objects.filter(print_list__is_public=True)
    


PrintListRouter = DefaultRouter()
PrintListRouter.register(r'', PrintListViewSet, basename='printlist')

PrintItemRouter = DefaultRouter()
PrintItemRouter.register(r'', PrintItemViewSet, basename='printitem')
