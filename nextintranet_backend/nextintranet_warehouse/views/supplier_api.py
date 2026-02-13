from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.shortcuts import get_object_or_404

from nextintranet_warehouse.models.component import SupplierRelation
from nextintranet_warehouse.services.supplier_api import (
    apply_supplier_mapping,
    fetch_supplier_relation_payload,
)


class SupplierRelationSyncAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        supplier_relation = get_object_or_404(SupplierRelation, pk=pk)
        symbol_override = request.data.get("symbol")
        payload = fetch_supplier_relation_payload(
            supplier_relation,
            user=request.user,
            symbol_override=symbol_override,
        )
        return Response(payload, status=status.HTTP_200_OK)


class SupplierRelationApplyAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        supplier_relation = get_object_or_404(SupplierRelation, pk=pk)
        mapping_override = request.data.get("mapping")
        save_mapping = bool(request.data.get("save_mapping"))
        if mapping_override and save_mapping and supplier_relation.supplier:
            supplier_relation.supplier.api_mapping = mapping_override
            supplier_relation.supplier.save(update_fields=["api_mapping"])
        result = apply_supplier_mapping(supplier_relation, mapping_override=mapping_override)
        return Response(result, status=status.HTTP_200_OK)
