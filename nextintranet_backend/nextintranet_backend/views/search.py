import logging
import re
import time
import uuid
from urllib.parse import parse_qs, urlparse

from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from nextintranet_backend.permissions import LEVEL_ORDER
from nextintranet_production.models import Production
from nextintranet_warehouse.models.component import Component, Identifier, Packet
from nextintranet_warehouse.models.purchase import Purchase
from nextintranet_warehouse.models.warehouse import Warehouse

logger = logging.getLogger(__name__)


class SearchApiView(APIView):
    permission_classes = [IsAuthenticated]

    DEFAULT_LIMIT = 6
    DEFAULT_PAGE = 1
    DEFAULT_SOURCES = ['components', 'locations', 'packets', 'purchases', 'productions']
    CONTEXT_DEFAULTS = {
        'store': ['components'],
        'purchases': ['purchases'],
        'orders': ['purchases'],
        'production': ['productions'],
    }
    SOURCE_ALIASES = {
        'all': DEFAULT_SOURCES,
        'store': ['components'],
        'component': ['components'],
        'components': ['components'],
        'warehouse': ['components', 'locations', 'packets', 'purchases'],
        'location': ['locations'],
        'locations': ['locations'],
        'position': ['locations'],
        'positions': ['locations'],
        'packet': ['packets'],
        'packets': ['packets'],
        'purchase': ['purchases'],
        'purchases': ['purchases'],
        'order': ['purchases'],
        'orders': ['purchases'],
        'production': ['productions'],
        'productions': ['productions'],
    }

    def get(self, request, *args, **kwargs):
        return self.handle_request(request)

    def post(self, request, *args, **kwargs):
        return self.handle_request(request)

    def handle_request(self, request):
        start_time = time.perf_counter()
        raw_query = self.get_first_param(request, ['q', 'query', 'code', 'data'])
        if raw_query is None:
            logger.warning('search missing query user=%s', getattr(request.user, 'id', None))
            return Response({'detail': 'Missing query.'}, status=status.HTTP_400_BAD_REQUEST)

        query = self.normalize_query(raw_query)
        source_tokens, query = self.extract_source_tokens(query)
        if not query:
            logger.warning('search empty query user=%s', getattr(request.user, 'id', None))
            return Response({'detail': 'Missing query.'}, status=status.HTTP_400_BAD_REQUEST)

        context = self.get_first_param(request, ['context'])
        source_param = self.get_first_param(request, ['source', 'sources'])
        sources, ignored_sources = self.resolve_sources(source_tokens, source_param, context)
        limit = self.parse_limit(self.get_first_param(request, ['limit']))
        page = self.parse_page(self.get_first_param(request, ['page']))
        max_results = limit * page

        warehouse_access = self.has_area_access(request.user, 'warehouse', 'guest')

        results = []
        seen = set()

        identifier_payload = self.parse_identifier_payload(query)
        direct_results = self.resolve_identifier_payload(identifier_payload, sources, warehouse_access)
        self.add_results(results, direct_results, seen)

        identifier_match = self.resolve_identifier_match(query, sources, warehouse_access)
        self.add_results(results, identifier_match, seen)

        if 'components' in sources and warehouse_access:
            self.add_results(results, self.search_components(query, max_results), seen)

        if 'locations' in sources and warehouse_access:
            self.add_results(results, self.search_locations(query, max_results), seen)

        if 'packets' in sources and warehouse_access:
            self.add_results(results, self.search_packets(query, max_results), seen)

        if 'purchases' in sources and warehouse_access:
            self.add_results(results, self.search_purchases(query, max_results), seen)

        if 'productions' in sources:
            self.add_results(results, self.search_productions(query, max_results), seen)

        total_count = len(results)
        total_pages = max(1, (total_count + limit - 1) // limit)
        start = (page - 1) * limit
        end = start + limit
        response = {
            'query': query,
            'context': (context or '').lower() if context else None,
            'sources': sources,
            'ignored_sources': ignored_sources,
            'page': page,
            'page_size': limit,
            'total_count': total_count,
            'total_pages': total_pages,
            'results': results[start:end],
        }

        duration_ms = int((time.perf_counter() - start_time) * 1000)
        logger.info(
            'search query=%s context=%s sources=%s results=%s user=%s duration_ms=%s',
            query,
            response['context'],
            ','.join(sources),
            len(results),
            getattr(request.user, 'id', None),
            duration_ms,
        )

        return Response(response)

    def get_first_param(self, request, names):
        for name in names:
            value = request.query_params.get(name)
            if value is not None:
                return value
            data = getattr(request, 'data', None)
            if isinstance(data, dict):
                value = data.get(name)
                if value is not None:
                    return value
        return None

    def normalize_query(self, value):
        return str(value).replace('\r', '').replace('\n', '').strip()

    def extract_source_tokens(self, query):
        pattern = re.compile(r'(?<!\S)source:([^\s]+)', flags=re.IGNORECASE)
        tokens = []
        for raw in pattern.findall(query):
            tokens.extend([part.strip() for part in raw.split(',') if part.strip()])
        cleaned = pattern.sub('', query).strip()
        return tokens, cleaned

    def resolve_sources(self, token_sources, param_sources, context):
        explicit = []
        ignored = []
        raw_sources = list(token_sources)

        if param_sources:
            raw_sources.extend([part.strip() for part in str(param_sources).split(',') if part.strip()])

        for raw in raw_sources:
            key = raw.lower()
            mapped = self.SOURCE_ALIASES.get(key)
            if not mapped:
                ignored.append(key)
                continue
            explicit.extend(mapped)

        if explicit:
            return self.dedupe(explicit), ignored

        if context:
            context_key = str(context).lower()
            defaults = self.CONTEXT_DEFAULTS.get(context_key)
            if defaults:
                return list(defaults), ignored

        return list(self.DEFAULT_SOURCES), ignored

    def parse_limit(self, value):
        try:
            limit = int(value)
        except (TypeError, ValueError):
            return self.DEFAULT_LIMIT
        return max(1, min(limit, 25))

    def parse_page(self, value):
        try:
            page = int(value)
        except (TypeError, ValueError):
            return self.DEFAULT_PAGE
        return max(1, page)

    def parse_uuid(self, value):
        try:
            return uuid.UUID(str(value))
        except (TypeError, ValueError):
            return None

    def parse_identifier_payload(self, query):
        if '=' not in query:
            return {}

        raw = query.strip()
        if raw.startswith('http://') or raw.startswith('https://'):
            parsed = urlparse(raw)
            query_string = parsed.query
        else:
            query_string = raw
        query_string = query_string.lstrip('?')

        parsed = parse_qs(query_string, keep_blank_values=True)
        return {key: values[0] for key, values in parsed.items() if values}

    def resolve_identifier_payload(self, payload, sources, warehouse_access):
        if not payload:
            return []

        results = []
        handlers = {
            'component': ('components', Component, self.build_component_result, warehouse_access),
            'packet': ('packets', Packet, self.build_packet_result, warehouse_access),
            'location': ('locations', Warehouse, self.build_location_result, warehouse_access),
            'purchase': ('purchases', Purchase, self.build_purchase_result, warehouse_access),
            'order': ('purchases', Purchase, self.build_purchase_result, warehouse_access),
            'production': ('productions', Production, self.build_production_result, True),
        }

        for key, value in payload.items():
            handler = handlers.get(key)
            if not handler:
                continue
            source, model, builder, can_access = handler
            if source not in sources or not can_access:
                continue
            parsed_id = self.parse_uuid(value)
            if not parsed_id:
                continue
            obj = model.objects.filter(id=parsed_id).first()
            if obj:
                results.append(builder(obj))
        return results

    def resolve_identifier_match(self, query, sources, warehouse_access):
        identifier = Identifier.objects.filter(identifier__iexact=query).select_related('content_type').first()
        if not identifier:
            return []

        obj = identifier.content_object
        result = self.build_result_for_object(obj)
        if not result:
            return []
        if result['source'] in sources and (result['source'] not in ['components', 'locations', 'packets', 'purchases'] or warehouse_access):
            return [result]
        return []

    def build_result_for_object(self, obj):
        if isinstance(obj, Component):
            return self.build_component_result(obj)
        if isinstance(obj, Packet):
            return self.build_packet_result(obj)
        if isinstance(obj, Warehouse):
            return self.build_location_result(obj)
        if isinstance(obj, Purchase):
            return self.build_purchase_result(obj)
        if isinstance(obj, Production):
            return self.build_production_result(obj)
        return None

    def add_results(self, results, new_results, seen):
        for item in new_results:
            key = (item.get('source'), item.get('id'))
            if key in seen:
                continue
            results.append(item)
            seen.add(key)

    def search_components(self, query, limit):
        parsed_id = self.parse_uuid(query)
        queryset = Component.objects.select_related('category')

        if parsed_id:
            queryset = queryset.filter(id=parsed_id)
        else:
            queryset = queryset.filter(
                Q(name__icontains=query) |
                Q(description__icontains=query) |
                Q(id__icontains=query) |
                Q(suppliers__symbol__icontains=query) |
                Q(suppliers__supplier__name__icontains=query)
            ).distinct()

        return [self.build_component_result(item) for item in queryset.order_by('name')[:limit]]

    def search_locations(self, query, limit):
        parsed_id = self.parse_uuid(query)
        queryset = Warehouse.objects.all()

        if parsed_id:
            queryset = queryset.filter(id=parsed_id)
        else:
            queryset = queryset.filter(
                Q(name__icontains=query) |
                Q(location__icontains=query) |
                Q(description__icontains=query) |
                Q(id__icontains=query)
            )

        return [self.build_location_result(item) for item in queryset.order_by('name')[:limit]]

    def search_packets(self, query, limit):
        parsed_id = self.parse_uuid(query)
        queryset = Packet.objects.select_related('component', 'location')

        if parsed_id:
            queryset = queryset.filter(id=parsed_id)
        else:
            queryset = queryset.filter(
                Q(component__name__icontains=query) |
                Q(location__name__icontains=query) |
                Q(description__icontains=query) |
                Q(id__icontains=query)
            )

        return [self.build_packet_result(item) for item in queryset.order_by('date_added')[:limit]]

    def search_productions(self, query, limit):
        parsed_id = self.parse_uuid(query)
        queryset = Production.objects.select_related('folder')

        if parsed_id:
            queryset = queryset.filter(id=parsed_id)
        else:
            queryset = queryset.filter(
                Q(name__icontains=query) |
                Q(description__icontains=query) |
                Q(folder__name__icontains=query) |
                Q(id__icontains=query)
            )

        return [self.build_production_result(item) for item in queryset.order_by('name')[:limit]]

    def search_purchases(self, query, limit):
        parsed_id = self.parse_uuid(query)
        queryset = Purchase.objects.select_related('supplier')

        if parsed_id:
            queryset = queryset.filter(id=parsed_id)
        else:
            queryset = queryset.filter(
                Q(id__icontains=query) |
                Q(note__icontains=query) |
                Q(supplier__name__icontains=query)
            )

        return [self.build_purchase_result(item) for item in queryset.order_by('-created_at')[:limit]]

    def build_component_result(self, component):
        subtitle = component.category.name if component.category else str(component.id)
        return {
            'source': 'components',
            'type': 'component',
            'id': str(component.id),
            'label': component.name,
            'subtitle': subtitle,
            'route': f'/store/component/{component.id}',
        }

    def build_location_result(self, location):
        return {
            'source': 'locations',
            'type': 'location',
            'id': str(location.id),
            'label': location.name,
            'subtitle': location.full_path,
            'route': f'/store/location/{location.id}',
        }

    def build_packet_result(self, packet):
        location = packet.location.full_path if packet.location else 'Location not set'
        return {
            'source': 'packets',
            'type': 'packet',
            'id': str(packet.id),
            'label': packet.component.name,
            'subtitle': location,
            'route': f'/store/packet/{packet.id}',
        }

    def build_production_result(self, production):
        subtitle = production.folder.name if production.folder else str(production.id)
        return {
            'source': 'productions',
            'type': 'production',
            'id': str(production.id),
            'label': production.name,
            'subtitle': subtitle,
            'route': f'/production/{production.id}',
        }

    def build_purchase_result(self, purchase):
        supplier_name = purchase.supplier.name if purchase.supplier else str(purchase.id)
        return {
            'source': 'purchases',
            'type': 'purchase',
            'id': str(purchase.id),
            'label': f'Order {str(purchase.id)[:8]}',
            'subtitle': supplier_name,
            'route': f'/store/purchase/{purchase.id}',
        }

    def dedupe(self, items):
        seen = set()
        output = []
        for item in items:
            if item in seen:
                continue
            output.append(item)
            seen.add(item)
        return output

    def has_area_access(self, user, area, required_level):
        if not user or not user.is_authenticated:
            return False
        if getattr(user, 'is_superuser', False):
            return True
        permission = user.access_permissions.filter(area=area).first()
        if not permission:
            return False
        if permission.level == 'hidden':
            return False
        return LEVEL_ORDER.get(permission.level, 0) >= LEVEL_ORDER.get(required_level, 0)
