from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from nextintranet_warehouse.models.category import Category
from nextintranet_warehouse.models.component import Component, Supplier, SupplierRelation
from nextintranet_warehouse.services.supplier_api import (
    apply_supplier_mapping,
    fetch_supplier_relation_payload,
)


class ComponentCreateFromSupplierAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        supplier_id = request.data.get("supplier")
        symbol = request.data.get("symbol", "").strip()
        category_id = request.data.get("category")

        if not supplier_id:
            return Response({"supplier": "Required."}, status=status.HTTP_400_BAD_REQUEST)
        if not symbol:
            return Response({"symbol": "Required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            supplier = Supplier.objects.get(pk=supplier_id)
        except Supplier.DoesNotExist:
            return Response({"supplier": "Not found."}, status=status.HTTP_400_BAD_REQUEST)

        if not supplier.api_plugin_instance:
            return Response(
                {"supplier": "This supplier has no API plugin configured."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        category = None
        if category_id:
            try:
                category = Category.objects.get(pk=category_id)
            except Category.DoesNotExist:
                return Response({"category": "Not found."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            component = Component.objects.create(name=symbol, category=category)
            relation = SupplierRelation.objects.create(
                component=component,
                supplier=supplier,
                symbol=symbol,
            )
            fetch_supplier_relation_payload(relation, user=request.user)
            result = apply_supplier_mapping(relation)

        return Response(
            {
                "id": str(component.pk),
                "supplier_relation_id": str(relation.pk),
                "result": result,
            },
            status=status.HTTP_201_CREATED,
        )
