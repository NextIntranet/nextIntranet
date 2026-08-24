from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from nextintranet_warehouse.models.component import WarehouseActivity
from nextintranet_warehouse.serializers.activity import (
    ActivityPagination,
    WarehouseActivitySerializer,
)


class WarehouseActivityListAPIView(APIView):
    """Global, unscoped warehouse activity feed (newest first).

    Same payload as the per-packet / per-component activity views, without the
    object scoping — used by the dashboard "Recent Operations" card.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = ActivityPagination

    def get(self, request):
        qs = (
            WarehouseActivity.objects
            .select_related("user", "component", "packet__location", "stock_operation")
            .order_by("-occurred_at", "-created_at")
        )

        if request.query_params.get("mode") == "count":
            qs = qs.filter(activity_type="stock_operation", stock_operation__isnull=False)

        activity_type = request.query_params.get("activity_type")
        if activity_type:
            qs = qs.filter(activity_type=activity_type)

        source = request.query_params.get("source")
        if source:
            qs = qs.filter(source=source)

        user = request.query_params.get("user")
        if user:
            qs = qs.filter(user_id=user)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = WarehouseActivitySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
