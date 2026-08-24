from datetime import timedelta

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Q, Count, F, FloatField
from django.db.models.functions import TruncDate
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
    StockOperation,
)

User = get_user_model()

# Operation flow classification, mirrors packages/app/src/lib/stockOperations.ts
IN_TYPES = ('add', 'buy', 'trans_in')
OUT_TYPES = ('remove', 'sell', 'service', 'trans_out')

TREND_DAYS = 180


def _start_of_month(now):
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _start_of_day(now):
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _operations_trend(trend_start, days):
    """Daily inbound/outbound operation counts, zero-filled so the chart always
    receives exactly `days` points."""
    rows = (
        StockOperation.objects.filter(timestamp__gte=trend_start)
        .annotate(day=TruncDate('timestamp'))
        .values('day')
        .annotate(
            inbound=Count('id', filter=Q(operation_type__in=IN_TYPES)),
            outbound=Count('id', filter=Q(operation_type__in=OUT_TYPES)),
        )
        .order_by('day')
    )
    by_day = {row['day']: row for row in rows}

    first_day = trend_start.date()
    trend = []
    for offset in range(days):
        day = first_day + timedelta(days=offset)
        row = by_day.get(day)
        trend.append({
            'date': day.isoformat(),
            'inbound': row['inbound'] if row else 0,
            'outbound': row['outbound'] if row else 0,
        })
    return trend


class DashboardMetricsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        start_of_month = _start_of_month(now)
        start_of_day = _start_of_day(now)
        week_ago = now - timedelta(days=7)
        trend_start = _start_of_day(now) - timedelta(days=TREND_DAYS - 1)

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

        # Stock operation throughput
        operations_today = StockOperation.objects.filter(timestamp__gte=start_of_day).count()
        operations_7d = StockOperation.objects.filter(timestamp__gte=week_ago).count()
        active_operators_7d = StockOperation.objects.filter(
            timestamp__gte=week_ago,
            author__isnull=False,
        ).values('author').distinct().count()

        # Value bought in this month (FIFO-priced 'buy' operations)
        purchased_value_this_month = StockOperation.objects.filter(
            operation_type='buy',
            timestamp__gte=start_of_month,
            unit_price__isnull=False,
        ).aggregate(
            total=Sum(F('quantity') * F('unit_price'), output_field=FloatField())
        )['total'] or 0

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
            'operations_today': operations_today,
            'operations_7d': operations_7d,
            'active_operators_7d': active_operators_7d,
            'purchased_value_this_month': float(purchased_value_this_month),
            'operations_trend': _operations_trend(trend_start, TREND_DAYS),
            'recent_purchases': recent_purchases,
        })
