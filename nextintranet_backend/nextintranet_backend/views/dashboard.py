from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Q
from django.contrib.auth import get_user_model
from django.utils import timezone

from nextintranet_warehouse.models import (
    Component,
    Packet,
    Reservation,
    PurchaseRequest,
    Purchase,
    PurchaseStatus,
    Warehouse,
    Category,
)

User = get_user_model()


def _start_of_month(now):
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


class DashboardMetricsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        start_of_month = _start_of_month(now)

        # Total warehouse components count
        total_components = Component.objects.count()

        # Total unique items (components with stock)
        components_with_stock = Component.objects.filter(
            packets__count__gt=0
        ).distinct().count()

        # Total quantity of all items in warehouse
        total_quantity = Packet.objects.aggregate(
            total=Sum('count')
        )['total'] or 0

        # Active reservations count
        active_reservations = Reservation.objects.filter(
            Q(expiration_date__isnull=True) | Q(expiration_date__gte=now)
        ).count()

        # Pending purchase requests
        pending_purchase_requests = PurchaseRequest.objects.filter(
            purchase__isnull=True
        ).count()

        # Total users count
        total_users = User.objects.filter(is_active=True).count()

        # Components with low or zero stock (threshold 10)
        low_stock_components = Component.objects.annotate(
            total_stock=Sum('packets__count')
        ).filter(
            Q(total_stock__lte=10) | Q(total_stock__isnull=True)
        ).count()

        # Purchases in progress (receiving or stocking)
        purchases_in_progress = Purchase.objects.filter(
            status__in=(PurchaseStatus.RECEIVING, PurchaseStatus.STOCKING)
        ).count()

        # Purchases completed this month
        purchases_completed_this_month = Purchase.objects.filter(
            status=PurchaseStatus.COMPLETED,
            completed_at__gte=start_of_month,
        ).count()

        # Structure: locations and categories
        locations_count = Warehouse.objects.count()
        categories_count = Category.objects.count()

        # Components with zero stock
        zero_stock_components = Component.objects.annotate(
            total_stock=Sum('packets__count')
        ).filter(
            Q(total_stock=0) | Q(total_stock__isnull=True)
        ).count()

        # Recent purchases (last 10)
        recent_purchases_qs = (
            Purchase.objects.select_related('supplier')
            .order_by('-created_at')[:10]
        )
        recent_purchases = [
            {
                'id': str(p.id),
                'supplier_name': p.supplier.name if p.supplier_id else None,
                'status': p.status,
                'created_at': p.created_at.isoformat() if p.created_at else None,
            }
            for p in recent_purchases_qs
        ]

        return Response({
            'total_components': total_components,
            'components_with_stock': components_with_stock,
            'total_quantity': float(total_quantity),
            'active_reservations': active_reservations,
            'pending_purchase_requests': pending_purchase_requests,
            'total_users': total_users,
            'low_stock_components': low_stock_components,
            'purchases_in_progress': purchases_in_progress,
            'purchases_completed_this_month': purchases_completed_this_month,
            'locations_count': locations_count,
            'categories_count': categories_count,
            'zero_stock_components': zero_stock_components,
            'recent_purchases': recent_purchases,
        })
