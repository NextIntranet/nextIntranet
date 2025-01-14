import graphene
from graphene_django.types import DjangoObjectType
import graphql_jwt

from graphql_jwt.decorators import login_required

from graphene import relay

from graphene_django.filter import DjangoFilterConnectionField

from .models.user import User
from nextintranet_warehouse.models.warehouse import Warehouse
from nextintranet_warehouse.models.component import Component, PriceHistory, Identifier, Supplier, SupplierRelation, Tag, Packet
from nextintranet_warehouse.models.component import ParameterType as ParameterType_model
from nextintranet_warehouse.models.component import ComponentParameter
from nextintranet_warehouse.models.category import Category

import django_filters
from graphene import relay
from graphene_django.filter import DjangoFilterConnectionField

from django.db.models import Q


import graphene

from graphql_auth.schema import UserQuery, MeQuery

class Query(UserQuery, MeQuery, graphene.ObjectType):
    pass

schema = graphene.Schema(query=Query)


class UserType(DjangoObjectType):
    class Meta:
        model = User
        fields = "__all__"

class CategoryType(DjangoObjectType):
    id = graphene.ID(source='id', required=True)

    class Meta:
        model = Category
        fields = "__all__"
        interfaces = (relay.Node,)

class ComponentType(DjangoObjectType):
    id = graphene.ID(source='id', required=True)
    """GraphQL type for the Component model."""
    
    class Meta:
        """Meta information for the ComponentType."""
        model = Component
        fields = "__all__"
        #fields = ['id', 'name', 'description', 'category', 'suppliers', 'tags', 'packets', 'parameters', 'created_at', 'unitType', 'unitPrice', 'sellingPrice']
        interfaces = (relay.Node,)

class ComponentConnection(relay.Connection):
    """Custom connection for the Component model."""
    class Meta:
        node = ComponentType

class ComponentFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(method='filter_search', label="Search")
    class Meta:
        model = Component
        fields = ['id', 'name', 'description', 'category', 'suppliers', 'tags', 'packets', 'parameters', 'created_at']

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(name__icontains=value) | Q(description__icontains=value) 
        ).distinct().order_by("id")

class CategoryFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(method='filter_search', label="Search")
    class Meta:
        model = Category
        fields = ['id', 'name', 'description']

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(name__icontains=value) | Q(description__icontains=value) 
        ).distinct().order_by("id")

class CreateComponent(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        description = graphene.String(required=True)
        category_id = graphene.UUID(required=True)

    component = graphene.Field(ComponentType)

    def mutate(self, info, name, description, category_id):
        category = Category.objects.get(id=category_id)
        component = Component(name=name, description=description, category=category)
        component.save()
        return CreateComponent(component=component)
    
class UpdateComponent(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)
        name = graphene.String()
        description = graphene.String()
        category_id = graphene.UUID()

    component = graphene.Field(ComponentType)

    def mutate(self, info, id, name=None, description=None, category_id=None):
        try:
            component = Component.objects.get(id=id)
            if name:
                component.name = name
            if description:
                component.description = description
            if category_id:
                category = Category.objects.get(id=category_id)
                component.category = category
            component.save()
            return UpdateComponent(component=component)
        except Component.DoesNotExist:
            raise Exception("Component not found!")


class PacketType(DjangoObjectType):
    """GraphQL type for the Packet model."""
    class Meta:
        """Meta information for the PacketType."""
        model = Packet
        fields = "__all__"

class WarehouseType(DjangoObjectType):
    """GraphQL type for the Warehouse model."""
    class Meta:
        """Meta information for the WarehouseType."""
        model = Warehouse
        fields = "__all__"

class SupplierType(DjangoObjectType):
    """GraphQL type for the Supplier model."""
    class Meta:
        """Meta information for the SupplierType."""
        model = Supplier
        fields = "__all__"

class SupplierRelationType(DjangoObjectType):
    """GraphQL type for the Supplier model."""
    class Meta:
        """Meta information for the SupplierType."""
        model = SupplierRelation
        fields = "__all__"

class ParameterType(DjangoObjectType):
    """GraphQL type for the Parameter model."""
    class Meta:
        """Meta information for the ParameterType."""
        model = ParameterType_model
        fields = "__all__"

class ComponentParameterType(DjangoObjectType):
    """GraphQL type for the ComponentParameter model."""
    class Meta:
        """Meta information for the ComponentParameterType."""
        model = ComponentParameter
        fields = "__all__"


from nextintranet_warehouse.models.purchase import Purchase, PurchaseItem
class PurchaseType(DjangoObjectType):
    """GraphQL type for the Purchase model."""
    class Meta:
        """Meta information for the PurchaseType."""
        model = Purchase
        fields = "__all__"

class PurchaseItemType(DjangoObjectType):
    """GraphQL type for the PurchaseItem model."""
    class Meta:
        """Meta information for the PurchaseItemType."""
        model = PurchaseItem
        fields = "__all__"



class Query(graphene.ObjectType):
    me = graphene.Field(UserType)
    all_users = graphene.List(UserType)
    component = graphene.Field(ComponentType, id=graphene.UUID( required=True))
    componentParameters = graphene.List(ComponentParameterType)
    all_parameters = graphene.List(ParameterType)
    all_packets = graphene.List(PacketType)
    warehouse = graphene.List(WarehouseType)
    all_warehouses = graphene.List(WarehouseType)
    all_components = graphene.List(ComponentType)
    #components = relay.ConnectionField(ComponentConnection)
    components = DjangoFilterConnectionField(ComponentType, filterset_class=ComponentFilter)
    all_categories = DjangoFilterConnectionField(CategoryType, filterset_class=CategoryFilter)

    all_purchase = graphene.List(PurchaseType)

    all_suppliers = graphene.List(SupplierType)
    SupplierRelation = graphene.List(SupplierRelationType)

    @login_required
    def resolve_me(self, info):
        print(f"User: {info.context.user}")
        print(f"Authorization: {info.context.headers.get('Authorization')}")
        user = info.context.user
        if user.is_anonymous:
            raise graphql.GraphQLError(f"Not logged in.. {info}")
        return user

    def resolve_all_users(self, info):
        """Resolve all users."""
        return User.objects.all()

    def resolve_me(self, info):
        """Resolve the current user."""
        user = info.context.user
        if user.is_anonymous:
            raise Exception("Not logged in!")
        return user
    
    def resolve_component(self, info, id):
        try:
            return Component.objects.get(id=id)
        except Component.DoesNotExist:
            raise Exception("Component not found!")
    

    # def resolve_components(self, info, **kwargs):
    #     return Component.objects.all().order_by('id')
    

    def resolve_components(self, info, **kwargs):
        return Component.objects.all().order_by('id')

    def resolve_all_warehouses(self, info):
        """Resolve all warehouses."""
        return Warehouse.objects.all()
    
    def resolve_all_packets(self, info):
        """Resolve all packets."""
        return Packet.objects.all()

    def resolve_all_components(self, info):
        """Resolve all components."""
        return Component.objects.all()
    
    # def resolve_components(self, info):
    #     return []
    

    def resolve_all_suppliers(self, info):
        """Resolve all suppliers."""
        return Supplier.objects.all()
    
    def resolve_all_parameters(self, info):
        """Resolve all parameters."""
        return ParameterType_model.objects.all()
    
    def resolve_all_categories(self, info):
        """Resolve all categories."""
        return Category.objects.all()
    
    def resolve_componentParameters(self, info):
        """Resolve all component parameters."""
        return ComponentParameter.objects.all()

    def resolve_all_purchase(self, info):
        """Resolve all purchases."""
        return Purchase.objects.all()

    
# Mutace
class Mutation(graphene.ObjectType):
    token_auth = graphql_jwt.ObtainJSONWebToken.Field()
    refresh_token = graphql_jwt.Refresh.Field()
    verify_token = graphql_jwt.Verify.Field()

    create_component = CreateComponent.Field()
    update_component = UpdateComponent.Field()



schema = graphene.Schema(query=Query, mutation=Mutation)
