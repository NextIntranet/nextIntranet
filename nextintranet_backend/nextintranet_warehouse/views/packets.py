import io
import datetime
from django.http import FileResponse
from django.views import View, generic
from django.shortcuts import get_object_or_404
from django.http import JsonResponse
from django.http import HttpResponse



from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action


from fpdf import FPDF
#from pylibdmtx import pylibdmtx
#from pystrich.datamatrix import DataMatrixEncoder
from nextintranet_warehouse.models.component import Packet, StockOperation, Component

import treepoem

from rest_framework.views import APIView
from rest_framework import mixins
from rest_framework import generics
from rest_framework import viewsets
from rest_framework.routers import DefaultRouter
from rest_framework.pagination import PageNumberPagination
from rest_framework import status

from rest_framework.response import Response
from rest_framework import serializers

from nextintranet_warehouse.models.component import Packet, StockOperation, Component
from nextintranet_warehouse.models.warehouse import Warehouse

from .components import ComponentSerializer
from .locations import WarehouseSerializer


class PacketSerializer(serializers.ModelSerializer):

    component = serializers.PrimaryKeyRelatedField(queryset=Component.objects.all())
    # component = serializers.StringRelatedField(read_only=True)

    location = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all())
    # location = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Packet
        fields = '__all__'

    def to_representation(self, instance):
        if instance.count == 0 and instance.operations.exists():
            instance.calculate()
        response = super().to_representation(instance)
        response['component'] = ComponentSerializer(instance.component).data
        response['location'] = WarehouseSerializer(instance.location).data
        return response



class StockOperationSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockOperation
        fields = '__all__'

class PacketOperationsAPIView(mixins.RetrieveModelMixin, generics.GenericAPIView):
    queryset = StockOperation.objects.all()
    serializer_class = StockOperationSerializer

    def get(self, request, *args, **kwargs):
        pocket_id = kwargs.get('pk')
        packet = Packet.objects.get(pk=pocket_id)
        operations = StockOperation.objects.filter(packet=packet).order_by('-created_at')
        
        serializer = StockOperationSerializer(operations, many=True)
        return Response(serializer.data)







class CustomPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 1000

class PacketAPIView(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Packet.objects.all()
    serializer_class = PacketSerializer
    pagination_class = CustomPagination

    @action(detail=True, methods=['post'])
    def calculate(self, request, *args, **kwargs):
        print("CALCULATE PACKET")
        id = kwargs.get('pk')
        print("packet id for calculation:", id)
        Packet.objects.get(id=id).calculate()
        return Response({'status': 'ok'})

class PacketListCreateAPIView(generics.ListCreateAPIView):
    queryset = Packet.objects.all()
    serializer_class = PacketSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        component = get_object_or_404(Component, pk=self.kwargs.get('pk'))
        return Packet.objects.filter(component=component)
    
    def post(self, request, pk, *args, **kwargs):
        component = get_object_or_404(Component, pk=pk)

        serializer = PacketSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(component=component)

        return Response(serializer.data, status=status.HTTP_201_CREATED)


PacketRouter = DefaultRouter()
PacketRouter.register(r'', PacketAPIView)



class PDFGeneratorView(View):
    def get(self, request, *args, **kwargs):
        # Načtěte objekt z modelu
        packet = Packet.objects.get(pk=kwargs['uuid'])

        # Inicializace FPDF
        pdf = FPDF(orientation='L', unit='mm', format=(38.1, 66.04))
        pdf.set_auto_page_break(auto=False, margin=0)
        pdf.set_margins(0, 0, 0)
        pdf.add_page()


        x0, y0 = 0, 0
        label_width = 66.04

        # Text "Packet"
        pdf.set_text_color(150)
        pdf.set_font('Arial', '', 6)
        pdf.set_xy(x0+2, y0+1)
        pdf.cell(label_width-4, 4.5, "Packet", align='L')

        # Název součástky
        pdf.set_draw_color(10)
        pdf.set_fill_color(245)
        pdf.set_text_color(0)
        pdf.set_font('Arial', 'B', 12)
        pdf.set_xy(x0+3, y0+4.5)

        label_name = packet.component.name
        if len(label_name) > 40:
            label_name = label_name[:40] + "..."
        name_length = pdf.get_string_width(label_name)

        # Úprava velikosti písma, pokud je text příliš dlouhý
        if name_length > 58:
            for size in range(0, 70):
                pdf.set_font('Arial', 'B', 12 - size / 10)
                name_length = pdf.get_string_width(label_name)
                if name_length < 58:
                    break
        pdf.cell(label_width-10, 4.6, label_name, align='L', border=1)

        # Popis štítku
        pdf.set_font('Arial', '', 8)
        description = packet.component.description[:110].strip()
        pdf.set_xy(x0+4, y0+15)
        pdf.multi_cell(label_width-28, 2.8, description, align='L')

        # Čárový kód (DataMatrix)
        #barcode = f"[)>␞06␝S{packet.id}␝5D{datetime.datetime.now().strftime('%y%m%d')}␞␄"
        #barcode = f"[)>06S{packet.id}5D{datetime.datetime.now().strftime('%y%m%d')}"
        #barcode = f"{packet.id}"
        barcode = f"?packet={packet.id}&type=packet&date={datetime.datetime.now().strftime('%y%m%d')};"
        print("Barcode code:", barcode)
        barcode_image = treepoem.generate_barcode(
            barcode_type='datamatrix',
            data=barcode
        ).convert('1')
        barcode_image_path = '/tmp/barcode_image.png'
        barcode_image.save(barcode_image_path, format='PNG')
        pdf.set_xy(x0+label_width-20-4, y0+8+7)
        pdf.image(barcode_image_path, x=None, y=None, w=20, h=20, type='PNG', link='')

        # # Pozice ve skladu
        if packet.location:
            pos = packet.location.full_path
            pdf.set_text_color(80)
            pdf.set_xy(x0+2, y0+10)
            pdf.set_font('Arial', 'B', 9)
            pdf.multi_cell(label_width-10, 3, pos, align='L')

        # Kategorie
        # if hasattr(packet.component, 'category'):
        #     category_names = ", ".join([c.name for c in packet.component.category.all()])
        #     pdf.set_text_color(60)
        #     pdf.set_xy(x0+4, y0+34.5)
        #     pdf.cell(0, 0, f"{packet.packet_count} ks | cat: {category_names}", align='L')

        # # Dodavatel
        # try:
        #     supplier_info = packet.component.supplier[int(packet.supplier)]
        #     supplier_text = f"{supplier_info.get('supplier', 'NA')} | {supplier_info.get('symbol', 'NA')}"
        #     pdf.set_text_color(100)
        #     pdf.set_xy(x0+4, y0+29)
        #     pdf.cell(label_width-28, 4.5, supplier_text, align='L', border=0)
        # except:
        #     pass

        # Uložení PDF do bufferu
        buffer = io.BytesIO()
        pdf_content = pdf.output(dest='S').encode('latin1')
        buffer.write(pdf_content)
        buffer.seek(0)

        return FileResponse(buffer, as_attachment=True, filename='label.pdf')
