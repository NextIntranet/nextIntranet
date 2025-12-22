from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response

from rest_framework.permissions import IsAuthenticated
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination
from rest_framework.routers import DefaultRouter

from nextintranet_warehouse.models import Warehouse
from nextintranet_warehouse.models import Warehouse

from django.views.generic import DetailView, ListView
from rest_framework import viewsets


from ..models.category import Category


import django_tables2 as tables

from nextintranet_backend.views.crud import create_crud_urls
from nextintranet_backend.help.crud import NIT_Table


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'



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

    @action(detail=True, methods=['get'], url_path='tree')
    def tree(self, request, pk=None):
        print("get_descendant_tree", pk)
        category = Category.objects.get(id=pk)
        print(category) 
        objects = category.get_descendants(include_self=True)
        print(objects)

        tree = self.build_tree(objects)
        return Response(tree)

CategoryRouter = DefaultRouter()
CategoryRouter.register(r'', CategoryAPIView)










urlpatterns = create_crud_urls(Category, table_class_object=CategoryModelTable)
print(urlpatterns)