from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response

from rest_framework.permissions import IsAuthenticated
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination
from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter

from nextintranet_warehouse.models import Warehouse
from nextintranet_warehouse.models import Warehouse

from django.views.generic import DetailView, ListView
from rest_framework import viewsets


from ..models.category import Category, CategoryParameterRule
from ..services.parameter_inheritance import get_effective_rules


import django_tables2 as tables

from nextintranet_backend.views.crud import create_crud_urls
from nextintranet_backend.help.crud import NIT_Table


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'


class CategoryParameterRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoryParameterRule
        fields = '__all__'
        read_only_fields = ('category',)


class EffectiveRuleSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    parameter_type = serializers.SerializerMethodField()
    value_template = serializers.CharField()
    is_own = serializers.BooleanField()
    source_category_name = serializers.CharField()

    def get_parameter_type(self, obj):
        pt = obj.get('_parameter_type') or obj.get('parameter_type')
        if hasattr(pt, 'id'):
            return {'id': str(pt.id), 'name': pt.name}
        return pt



class CategoryModelTable(NIT_Table):
    class Meta(NIT_Table.Meta):
        model = Category
        fields = ('id', 'name', 'abbreviation', 'description', 'parent', 'color', 'icon')
    id = tables.LinkColumn('category-detail', args=[tables.A('pk')], verbose_name='ID')



class CustomPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 1000


class CategoryAPIView(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = CustomPagination

    def build_tree(self, categories, parent=None):
            tree = []
            for category in categories:
                if category.parent == parent:
                    children = self.build_tree(categories, category)
                    tree.append({
                        'id': category.id,
                        'name': category.name,
                        'abbreviation': category.abbreviation,
                        'description': category.description,
                        # 'parent': category.parent_id,
                        'color': category.color,
                        'icon': category.icon,
                        'children': children
                    })
            return tree


    @action(detail=False, methods=['get'], url_path='tree')
    def tree_all(self, request):
        categories = Category.objects.all()
        tree = self.build_tree(categories)
        return Response(tree)

    @action(detail=False, methods=['get'], url_path='rules-summary')
    def rules_summary(self, request):
        """Return {category_id: [{name, template}, ...]} for all categories with rules."""
        from collections import defaultdict
        rules = CategoryParameterRule.objects.select_related('parameter_type', 'category').all()
        result = defaultdict(list)
        for rule in rules:
            result[str(rule.category_id)].append({
                'name': rule.parameter_type.name,
                'template': rule.value_template,
            })
        return Response(result)

    @action(detail=True, methods=['get'], url_path='tree')
    def tree(self, request, pk=None):
        print("get_descendant_tree", pk)
        category = Category.objects.get(id=pk)
        print(category) 
        objects = category.get_descendants(include_self=True)
        print(objects)

        tree = self.build_tree(objects)
        return Response(tree)

class CategoryParameterRuleViewSet(viewsets.ModelViewSet):
    serializer_class = CategoryParameterRuleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CategoryParameterRule.objects.filter(
            category_id=self.kwargs['category_pk'],
        ).select_related('parameter_type')

    def perform_create(self, serializer):
        category = Category.objects.get(pk=self.kwargs['category_pk'])
        serializer.save(category=category)

    @action(detail=False, methods=['get'], url_path='effective')
    def effective(self, request, category_pk=None):
        category = Category.objects.get(pk=category_pk)
        effective_rules = get_effective_rules(category)

        own_rule_ids = set(
            CategoryParameterRule.objects.filter(category=category).values_list('id', flat=True)
        )

        result = []
        for pt_id, rule in effective_rules.items():
            result.append({
                'id': rule.id,
                '_parameter_type': rule.parameter_type,
                'parameter_type': None,
                'value_template': rule.value_template,
                'is_own': rule.id in own_rule_ids,
                'source_category_name': rule.category.name,
            })

        serializer = EffectiveRuleSerializer(result, many=True)
        return Response(serializer.data)


CategoryRuleRouter = DefaultRouter(trailing_slash=True)
CategoryRuleRouter.register(r'', CategoryParameterRuleViewSet, basename='category-rule')

CategoryRouter = DefaultRouter(trailing_slash=True)
CategoryRouter.register(r'', CategoryAPIView)










urlpatterns = create_crud_urls(Category, table_class_object=CategoryModelTable)
print(urlpatterns)