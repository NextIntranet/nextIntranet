from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Sum, Q
from django.contrib.auth import get_user_model
from django.utils import timezone

from nextintranet_warehouse.models import Component, Packet, Reservation, PurchaseRequest

User = get_user_model()


class DashboardMetricsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
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
        now = timezone.now()
        active_reservations = Reservation.objects.filter(
            Q(expiration_date__isnull=True) | Q(expiration_date__gte=now)
        ).count()
        
        # Pending purchase requests
        pending_purchase_requests = PurchaseRequest.objects.filter(
            purchase__isnull=True
        ).count()
        
        # Total users count
        total_users = User.objects.filter(is_active=True).count()
        
        # Components with low or zero stock
        low_stock_components = Component.objects.annotate(
            total_stock=Sum('packets__count')
        ).filter(
            Q(total_stock__lte=10) | Q(total_stock__isnull=True)
        ).count()
        
        return Response({
            'total_components': total_components,
            'components_with_stock': components_with_stock,
            'total_quantity': float(total_quantity),
            'active_reservations': active_reservations,
            'pending_purchase_requests': pending_purchase_requests,
            'total_users': total_users,
            'low_stock_components': low_stock_components,
        })
