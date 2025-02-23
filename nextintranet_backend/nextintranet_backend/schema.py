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
from nextintranet_warehouse.models.component import ComponentParameter, Document
from nextintranet_warehouse.models.category import Category

import django_filters
from graphene import relay
from graphene_django.filter import DjangoFilterConnectionField
from graphql_relay.connection.arrayconnection import offset_to_cursor, cursor_to_offset
from graphql_relay.node.node import from_global_id, to_global_id


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

class DocumentType(DjangoObjectType):
    """GraphQL type for the Document model."""
    documentId = graphene.ID(source="id", required=True)
    componentId = graphene.UUID(source="component.id", required=True)
    url = graphene.String()
    docTypeChoices = graphene.List(graphene.String)

    class Meta:
        model = Document
        fields = "__all__"

    def resolve_url(self, info):
        # If an external URL is provided, use it; otherwise try to use the file URL.
        if self.url:
            return self.url
        return self.file.url if self.file else None

    def resolve_docTypeChoices(self, info):
        # Returns the list of available document types from the model choices.
        return [choice[0] for choice in Document.DOCUMENT_TYPE_CHOICES]

class ComponentParameterType(DjangoObjectType):
    class Meta:
        model = ComponentParameter
        fields = "__all__"


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
        ).distinct().order_by("name")
    
    @property
    def count(self):
        return self.qs.count()

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
                print("Selected category: ", category)
                component.category = category
            component.save()
            return UpdateComponent(component=component)
        except Component.DoesNotExist:
            raise Exception("Component not found!")

class UpdateDocument(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)
        name = graphene.String()
        doc_type = graphene.String()
        url = graphene.String()

    document = graphene.Field(DocumentType)

    def mutate(self, info, id, name=None, doc_type=None, url=None):
        try:
            document = Document.objects.get(id=id)
        except Document.DoesNotExist:
            raise Exception("Document not found!")
        
        if name is not None:
            document.name = name
        if doc_type is not None:
            document.doc_type = doc_type
        if url is not None:
            document.url = url
        
        document.save()
        return UpdateDocument(document=document)
    
class CreateDocument(graphene.Mutation):
    class Arguments:
        component_id = graphene.UUID(required=True)
        name = graphene.String(required=True)
        doc_type = graphene.String(required=True)
        url = graphene.String(required=True)

    document = graphene.Field(DocumentType)

    def mutate(self, info, component_id, name, doc_type, url):
        try:
            component = Component.objects.get(id=component_id)
        except Component.DoesNotExist:
            raise Exception("Component not found!")
        document = Document(component=component, name=name, doc_type=doc_type, url=url)
        document.save()
        return CreateDocument(document=document)

class DeleteDocument(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)

    document = graphene.Field(DocumentType)

    def mutate(self, info, id):
        try:
            document = Document.objects.get(id=id)
            document.delete()
            return DeleteDocument(document=document)
        except Document.DoesNotExist:
            raise Exception("Document not found!")

class CreateComponentParameter(graphene.Mutation):
    class Arguments:
        component_id = graphene.UUID(required=True)
        ParameterType_id = graphene.UUID(required=True)
        value = graphene.String(required=True)

    componentParameter = graphene.Field(ComponentParameterType)

    def mutate(self, info, component_id, ParameterType_id, value):
        try:
            component = Component.objects.get(id=component_id)
        except Component.DoesNotExist:
            raise Exception("Component not found!")
        try:
            ParameterType = ParameterType_model.objects.get(id=ParameterType_id)
        except ParameterType_model.DoesNotExist:
            raise Exception("ParameterType not found!")
        
        componentParameter = ComponentParameter(component=component, parameter_type=ParameterType, value=value)
        componentParameter.save()
        return CreateComponentParameter(componentParameter=componentParameter)

class UpdateComponentParameter(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)
        value = graphene.String()

    componentParameter = graphene.Field(ComponentParameterType)

    def mutate(self, info, id, value=None):
        try:
            componentParameter = ComponentParameter.objects.get(id=id)
        except ComponentParameter.DoesNotExist:
            raise Exception("ComponentParameter not found!")
        
        if value is not None:
            componentParameter.value = value
        
        componentParameter.save()
        return UpdateComponentParameter(componentParameter=componentParameter)

class DeleteComponentParameter(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)

    componentParameter = graphene.Field(ComponentParameterType)

    def mutate(self, info, id):
        try:
            componentParameter = ComponentParameter.objects.get(id=id)
            componentParameter.delete()
            return DeleteComponentParameter(componentParameter=componentParameter)
        except ComponentParameter.DoesNotExist:
            raise Exception("ComponentParameter not found!")


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
    """GraphQL type for the SupplierRelation model."""
    url = graphene.String()

    class Meta:
        """Meta information for the SupplierRelationType."""
        model = SupplierRelation
        fields = "__all__"

    def resolve_url(self, info):
        return self.url
    

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
    
class UpdatePurchase(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)
        delivery_date = graphene.Date()
        stocked_date = graphene.Date()
        supplier_id = graphene.UUID()
        status = graphene.String()
        currency = graphene.String()
        total_price_original = graphene.Decimal()
        total_price_original_vat = graphene.Decimal()
        total_price_converted = graphene.Decimal()
        note = graphene.String()

    purchase = graphene.Field(PurchaseType)

    def mutate(self, info, id, delivery_date=None, stocked_date=None, supplier_id=None, 
                status=None, currency=None, total_price_original=None, 
                total_price_original_vat=None, total_price_converted=None, note=None):
        try:
            purchase = Purchase.objects.get(id=id)
            if delivery_date is not None:
                purchase.delivery_date = delivery_date
            if stocked_date is not None:
                purchase.stocked_date = stocked_date
            if supplier_id is not None:
                supplier = Supplier.objects.get(id=supplier_id)
                purchase.supplier = supplier
            if status is not None:
                purchase.status = status
            if currency is not None:
                purchase.currency = currency
            if total_price_original is not None:
                purchase.total_price_original = total_price_original
            if total_price_original_vat is not None:
                purchase.total_price_original_vat = total_price_original_vat
            if total_price_converted is not None:
                purchase.total_price_converted = total_price_converted
            if note is not None:
                purchase.note = note
            
            purchase.save()
            return UpdatePurchase(purchase=purchase)
        except Purchase.DoesNotExist:
            raise Exception("Purchase not found!")


class Query(graphene.ObjectType):
    me = graphene.Field(UserType)
    all_users = graphene.List(UserType)
    component = graphene.Field(ComponentType, id=graphene.UUID( required=True))
    componentParameters = graphene.List(ComponentParameterType)
    componentDocuments = graphene.List(DocumentType)
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
    

    def resolve_components(self, info, search=None, first=None, after=None, last=None, before=None):
        queryset = Component.objects.all()
        queryset = queryset.order_by("name")



        return queryset
  
    
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

    def resolve_componentDocuments(self, info):
        """Resolve all component documents."""
        return Document.objects.all()

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

    create_document = CreateDocument.Field()
    update_Document = UpdateDocument.Field()
    delete_document = DeleteDocument.Field()


    create_component_parameter = CreateComponentParameter.Field()
    update_component_parameter = UpdateComponentParameter.Field()
    delete_component_parameter = DeleteComponentParameter.Field()

    update_purchase = UpdatePurchase.Field()



schema = graphene.Schema(query=Query, mutation=Mutation)
