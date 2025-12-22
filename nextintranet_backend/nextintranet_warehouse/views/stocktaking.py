from django.views.generic import ListView, CreateView, UpdateView, DeleteView, DetailView, View
from django.urls import reverse_lazy
from django.contrib.auth.mixins import LoginRequiredMixin

from ..models.stocktaking import Stocktaking
from ..models.component import Component
from ..models.component import Packet
from ..models.component import StockOperation
from ..models.warehouse import Warehouse

from django.shortcuts import render
from django.urls import path


class StocktakingProcess(LoginRequiredMixin, View):
    template_name = 'warehouse/stocktaking/stocktaking_process.html'
    model = Packet

    def get(self, request, *args, **kwargs):
        stocktaking = Stocktaking.objects.get()
        location = request.GET.get('location', None)

        if location:
            loc = Warehouse.objects.get(uuid=location).get_descendants(include_self=True).distinct()

        packets = Packet.objects.filter(location__in=loc) if location else Packet.objects.all().order_by('component__name')

        
        return render(request, self.template_name, {'stocktaking': stocktaking, 'packets': packets, 'locations': loc if location else []})






















urlpatterns = [
    path('', StocktakingProcess.as_view(), name='stocktaking-process'),
    path('<uuid:uuid>/process', StocktakingProcess.as_view(), name='stocktaking-process'),
]