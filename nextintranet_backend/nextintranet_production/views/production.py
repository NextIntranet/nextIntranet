from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser, FormParser
from django.db import transaction
import xml.etree.ElementTree as ET

from nextintranet_production.models import (
    ProductionFolder,
    Production,
    Template,
    TemplateComponent,
    Realization,
    RealizationComponent
)
from nextintranet_production.serializers import (
    ProductionFolderSerializer,
    ProductionFolderListSerializer,
    ProductionSerializer,
    ProductionListSerializer,
    TemplateSerializer,
    TemplateListSerializer,
    TemplateComponentSerializer,
    RealizationSerializer,
    RealizationListSerializer,
    RealizationComponentSerializer,
)


class CustomPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 1000


class ProductionFolderViewSet(viewsets.ModelViewSet):
    """ViewSet pro ProductionFolder s hierarchickou strukturou"""
    permission_classes = [IsAuthenticated]
    queryset = ProductionFolder.objects.all()
    serializer_class = ProductionFolderSerializer
    pagination_class = CustomPagination
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ProductionFolderListSerializer
        return ProductionFolderSerializer
    
    def build_tree(self, folders, parent=None):
        """Rekurzivní stavba stromu složek"""
        tree = []
        for folder in folders:
            if folder.parent == parent:
                children = self.build_tree(folders, folder)
                tree.append({
                    'id': folder.id,
                    'name': folder.name,
                    'description': folder.description,
                    'full_path': folder.full_path,
                    'children': children,
                    'created_at': folder.created_at,
                })
        return tree
    
    @action(detail=False, methods=['get'], url_path='tree')
    def tree(self, request):
        """Vrátí celou hierarchii složek jako strom"""
        folders = ProductionFolder.objects.all()
        tree = self.build_tree(folders)
        return Response(tree)


class ProductionViewSet(viewsets.ModelViewSet):
    """ViewSet pro Production"""
    permission_classes = [IsAuthenticated]
    queryset = Production.objects.select_related('folder', 'component_reference').all()
    serializer_class = ProductionSerializer
    pagination_class = CustomPagination
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ProductionListSerializer
        return ProductionSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filtrování podle složky
        folder_id = self.request.query_params.get('folder', None)
        if folder_id:
            queryset = queryset.filter(folder_id=folder_id)
        
        # Vyhledávání
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(name__icontains=search)
        
        return queryset.order_by('-created_at')


class TemplateViewSet(viewsets.ModelViewSet):
    """ViewSet pro Template"""
    permission_classes = [IsAuthenticated]
    queryset = Template.objects.select_related('production').prefetch_related('components').all()
    serializer_class = TemplateSerializer
    pagination_class = CustomPagination
    
    def get_serializer_class(self):
        if self.action == 'list':
            return TemplateListSerializer
        return TemplateSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filtrování podle production
        production_id = self.request.query_params.get('production', None)
        if production_id:
            queryset = queryset.filter(production_id=production_id)
        
        return queryset.order_by('-created_at')
    
    @action(detail=True, methods=['post'], url_path='start-production')
    @transaction.atomic
    def start_production(self, request, pk=None):
        """Vytvoří realizaci z šablony"""
        template = self.get_object()
        
        # Get optional name from request, otherwise generate default
        realization_name = request.data.get('name', f'{template.name} - Realizace')
        
        # Create realization
        from nextintranet_production.models.production import Realization, RealizationComponent
        realization = Realization.objects.create(
            production=template.production,
            template=template,
            name=realization_name,
            status='in_progress'
        )
        
        # Copy all components from template to realization
        template_components = template.components.all()
        for tc in template_components:
            RealizationComponent.objects.create(
                realization=realization,
                template_component=tc,
                component=tc.component,
                position=tc.position,
                notes=tc.notes,
                attributes=tc.attributes,
                is_modified=False
            )
        
        from nextintranet_production.serializers.production import RealizationSerializer
        serializer = RealizationSerializer(realization)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'], url_path='add-component')
    def add_component(self, request, pk=None):
        """Přidá komponentu do šablony"""
        template = self.get_object()
        serializer = TemplateComponentSerializer(data=request.data)
        
        if serializer.is_valid():
            serializer.save(template=template)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'], url_path='import-bom', parser_classes=[MultiPartParser, FormParser])
    @transaction.atomic
    def import_bom(self, request, pk=None):
        """Importuje BOM z XML souboru"""
        template = self.get_object()
        
        if 'file' not in request.FILES:
            return Response(
                {'error': 'No file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        xml_file = request.FILES['file']
        clear_existing = request.data.get('clear_existing', 'false').lower() == 'true'
        
        try:
            # Parse XML
            tree = ET.parse(xml_file)
            root = tree.getroot()
            
            # Clear existing components if requested
            if clear_existing:
                template.components.all().delete()
            
            components_added = 0
            components_failed = 0
            errors = []
            
            # Process components from KiCad BOM XML
            # Each component is in <comp ref="...">
            for idx, comp in enumerate(root.findall('.//comp')):
                try:
                    comp_ref = comp.get('ref')
                    
                    # Convert entire comp element to dict for JSON storage
                    def element_to_dict(elem):
                        # Check if element is simple (only text, no children or attributes)
                        has_children = len(elem) > 0
                        has_attribs = len(elem.attrib) > 0
                        has_text = elem.text and elem.text.strip()
                        
                        # Simple element with only text -> return string directly
                        if not has_children and not has_attribs and has_text:
                            return elem.text.strip()
                        
                        # Complex element -> return dict
                        result = {}
                        
                        # Add attributes
                        if has_attribs:
                            result.update(elem.attrib)
                        
                        # Add text content if no children
                        if has_text and not has_children:
                            result['_text'] = elem.text.strip()
                        
                        # Process child elements
                        for child in elem:
                            child_dict = element_to_dict(child)
                            if child.tag in result:
                                # If tag already exists, convert to list
                                if not isinstance(result[child.tag], list):
                                    result[child.tag] = [result[child.tag]]
                                result[child.tag].append(child_dict)
                            else:
                                result[child.tag] = child_dict
                        
                        return result
                    
                    raw_comp_data = element_to_dict(comp)
                    
                    # Extract key fields to top level
                    comp_data = {
                        'ref': raw_comp_data.get('ref', comp_ref),
                        'value': raw_comp_data.get('value', ''),
                        'footprint': raw_comp_data.get('footprint', ''),
                        'tstamp': raw_comp_data.get('tstamp') or raw_comp_data.get('tstamps', ''),
                        'dnp': raw_comp_data.get('dnp', False),
                        'attributes': raw_comp_data  # Keep everything in attributes
                    }
                    
                    # Try to find component ID: UST_ID, UST_id, or NIID
                    component_id = None
                    
                    # Helper function to search for field/property
                    def find_field_value(data, field_names):
                        for field_name in field_names:
                            # Search in fields
                            if 'field' in data:
                                fields = data['field'] if isinstance(data['field'], list) else [data['field']]
                                for field in fields:
                                    if isinstance(field, dict) and field.get('name') == field_name:
                                        return field.get('_text', '')
                            
                            # Search in properties
                            if 'property' in data:
                                properties = data['property'] if isinstance(data['property'], list) else [data['property']]
                                for prop in properties:
                                    if isinstance(prop, dict) and prop.get('name') == field_name:
                                        return prop.get('value', '')
                            
                            # Search in datasheet (special case)
                            if field_name == 'datasheet' and 'datasheet' in data:
                                ds = data['datasheet']
                                if isinstance(ds, dict):
                                    return ds.get('_text', '')
                        return None
                    
                    component_id = find_field_value(comp_data, ['UST_ID', 'UST_id', 'NIID', 'datasheet'])
                    
                    # Check if component should be excluded from BOM
                    exclude_from_bom = False
                    if 'property' in comp_data:
                        properties = comp_data['property'] if isinstance(comp_data['property'], list) else [comp_data['property']]
                        for prop in properties:
                            if isinstance(prop, dict) and prop.get('name') == 'exclude_from_bom':
                                exclude_from_bom = True
                                break
                    
                    # Skip only if explicitly excluded from BOM
                    if exclude_from_bom:
                        continue  # Skip without error
                    
                    # Create simple notes from ref and value
                    notes_parts = []
                    if comp_ref:
                        notes_parts.append(f'Ref: {comp_ref}')
                    if 'value' in comp_data and isinstance(comp_data['value'], dict):
                        value_text = comp_data['value'].get('_text', '')
                        if value_text:
                            notes_parts.append(f'Value: {value_text}')
                    
                    notes = ', '.join(notes_parts) if notes_parts else ''
                    
                    # Try to find component in warehouse (only if component_id exists)
                    component = None
                    if component_id and component_id != '':
                        try:
                            from nextintranet_warehouse.models.component import Component
                            component = Component.objects.get(id=component_id)
                        except Component.DoesNotExist:
                            # Component not found in warehouse - will create with NULL component
                            pass
                        except Exception:
                            # Any other error - still continue
                            pass
                    
                    # Create template component with full comp data in attributes
                    # component can be None if not found in warehouse
                    TemplateComponent.objects.create(
                        template=template,
                        component=component,
                        position=idx,
                        notes=notes,
                        attributes=comp_data
                    )
                    components_added += 1
                    
                except Exception as e:
                    comp_ref = comp.get('ref', idx) if comp is not None else idx
                    errors.append(f'Component {comp_ref}: {str(e)}')
                    components_failed += 1
            
            return Response({
                'success': True,
                'components_added': components_added,
                'components_failed': components_failed,
                'errors': errors if errors else None
            }, status=status.HTTP_200_OK)
            
        except ET.ParseError as e:
            return Response(
                {'error': f'Invalid XML file: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': f'Error processing BOM: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class TemplateComponentViewSet(viewsets.ModelViewSet):
    """ViewSet pro TemplateComponent"""
    permission_classes = [IsAuthenticated]
    queryset = TemplateComponent.objects.select_related('template', 'component').all()
    serializer_class = TemplateComponentSerializer
    pagination_class = CustomPagination
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filtrování podle šablony
        template_id = self.request.query_params.get('template', None)
        if template_id:
            queryset = queryset.filter(template_id=template_id)
        
        return queryset.order_by('position')


class RealizationViewSet(viewsets.ModelViewSet):
    """ViewSet pro Realization"""
    permission_classes = [IsAuthenticated]
    queryset = Realization.objects.select_related('production', 'template').prefetch_related('components').all()
    serializer_class = RealizationSerializer
    pagination_class = CustomPagination
    
    def get_serializer_class(self):
        if self.action == 'list':
            return RealizationListSerializer
        return RealizationSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filtrování podle production
        production_id = self.request.query_params.get('production', None)
        if production_id:
            queryset = queryset.filter(production_id=production_id)
        
        # Filtrování podle statusu
        status_filter = self.request.query_params.get('status', None)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        return queryset.order_by('-created_at')
    
    @action(detail=False, methods=['post'], url_path='create-from-template')
    @transaction.atomic
    def create_from_template(self, request):
        """Vytvoří realizaci ze šablony včetně zkopírování všech komponent"""
        template_id = request.data.get('template_id')
        name = request.data.get('name')
        description = request.data.get('description', '')
        
        if not template_id or not name:
            return Response(
                {'error': 'template_id and name are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            template = Template.objects.get(id=template_id)
        except Template.DoesNotExist:
            return Response(
                {'error': 'Template not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Vytvoření realizace
        realization = Realization.objects.create(
            production=template.production,
            template=template,
            name=name,
            description=description,
            status='draft'
        )
        
        # Zkopírování komponent ze šablony
        template_components = template.components.all()
        for tc in template_components:
            RealizationComponent.objects.create(
                realization=realization,
                template_component=tc,
                component=tc.component,
                position=tc.position,
                notes=tc.notes,
                attributes=tc.attributes.copy() if tc.attributes else {},
                is_modified=False
            )
        
        serializer = self.get_serializer(realization)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'], url_path='add-component')
    def add_component(self, request, pk=None):
        """Přidá komponentu do realizace"""
        realization = self.get_object()
        serializer = RealizationComponentSerializer(data=request.data)
        
        if serializer.is_valid():
            serializer.save(realization=realization, is_modified=True)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RealizationComponentViewSet(viewsets.ModelViewSet):
    """ViewSet pro RealizationComponent"""
    permission_classes = [IsAuthenticated]
    queryset = RealizationComponent.objects.select_related('realization', 'component', 'template_component').all()
    serializer_class = RealizationComponentSerializer
    pagination_class = CustomPagination
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filtrování podle realizace
        realization_id = self.request.query_params.get('realization', None)
        if realization_id:
            queryset = queryset.filter(realization_id=realization_id)
        
        return queryset.order_by('position')
