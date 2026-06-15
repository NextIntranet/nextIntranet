import io
import os
import datetime
from collections import defaultdict

from django.http import FileResponse
from django.shortcuts import get_object_or_404
from fpdf import FPDF
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from ..models.component import Packet, StockOperation
from ..models.stocktaking import Stocktaking

_FONTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'nextintranet_backend', 'labels', 'fonts',
)

MARGIN = 15
ROW_H = 7
HEADER_H = 7
SUB_ROW_H = 6
FONT_NORMAL = 9
FONT_SMALL = 8
FONT_HEADER = 8
PAGE_BOTTOM = 277


def _fmt_value(v: float) -> str:
    s = f"{v:,.2f}"
    integer_part, decimal_part = s.split('.')
    integer_part = integer_part.replace(',', ' ')
    return f"{integer_part},{decimal_part} Kč"


def _fmt_count(v: float) -> str:
    if v == int(v):
        return str(int(v))
    return f"{v:.2f}".replace('.', ',')


def _truncate(pdf: FPDF, text: str, max_w: float) -> str:
    if pdf.get_string_width(text) <= max_w:
        return text
    while len(text) > 1 and pdf.get_string_width(text + '…') > max_w:
        text = text[:-1]
    return text + '…'


class _ReportPDF(FPDF):
    def __init__(self, show_status: bool):
        super().__init__(orientation='P', unit='mm', format='A4')
        self.show_status = show_status
        self.in_table = False

        if show_status:
            self.col_name = 93
            self.col_count = 25
            self.col_value = 38
            self.col_status = 24
        else:
            self.col_name = 117
            self.col_count = 25
            self.col_value = 38
            self.col_status = 0

    def add_fonts(self):
        self.add_font('DejaVu', style='', fname=os.path.join(_FONTS_DIR, 'DejaVuSans.ttf'))
        self.add_font('DejaVu', style='B', fname=os.path.join(_FONTS_DIR, 'DejaVuSans-Bold.ttf'))

    def draw_col_headers(self):
        self.set_fill_color(235, 235, 235)
        self.set_text_color(60, 60, 60)
        self.set_font('DejaVu', style='B', size=FONT_HEADER)
        y = self.get_y()
        x = MARGIN
        self.set_xy(x, y)
        self.cell(self.col_name, HEADER_H, 'Součástka', border='B', fill=True)
        x += self.col_name
        self.set_xy(x, y)
        self.cell(self.col_count, HEADER_H, 'Počet', border='B', align='R', fill=True)
        x += self.col_count
        self.set_xy(x, y)
        self.cell(self.col_value, HEADER_H, 'Hodnota', border='B', align='R', fill=True)
        x += self.col_value
        if self.show_status:
            self.set_xy(x, y)
            self.cell(self.col_status, HEADER_H, 'Stav', border='B', fill=True)
        self.set_text_color(0)
        self.set_fill_color(255, 255, 255)
        self.ln(HEADER_H)

    def check_page_break(self, needed: float = ROW_H):
        if self.get_y() + needed > PAGE_BOTTOM:
            self.add_page()
            if self.in_table:
                self.draw_col_headers()


def _count_from_ops(ops_for_packet: list, cutoff_id=None) -> float:
    """
    Replay operations in chronological order (same logic as Packet.calculate()),
    stopping after cutoff_id if provided. Returns the running count.
    """
    count = 0.0
    for op in ops_for_packet:
        if op['relative_quantity']:
            count += op['quantity'] or 0
        else:
            count = op['quantity'] or 0
        if cutoff_id is not None and op['id'] == cutoff_id:
            break
    return count


def _build_inventory_counts(campaign_id) -> dict[str, float]:
    """
    For each active packet inventoried in this campaign, compute the stock count
    at the moment of the last inventory operation — using the same running-sum
    logic as Packet.calculate() but cut off at the last inventory op timestamp.

    Returns: {str(packet_id): count_at_inventory}
    """
    # 1. Find the last inventory op per packet for this campaign (ordered by
    #    timestamp then id, matching Packet.calculate() ordering).
    inv_ops = (
        StockOperation.objects.filter(
            operation_type='inventory',
            reference=campaign_id,
            packet__is_active=True,
        )
        .order_by('packet_id', 'timestamp', 'id')
        .values('id', 'packet_id', 'timestamp')
    )

    # last inv op per packet (later rows overwrite earlier ones for same packet)
    cutoffs: dict[str, dict] = {}
    for op in inv_ops:
        cutoffs[str(op['packet_id'])] = {'id': op['id'], 'timestamp': op['timestamp']}

    if not cutoffs:
        return {}

    # 2. For each inventoried packet, load ALL its operations up to (and including)
    #    the cutoff timestamp, ordered to match Packet.calculate().
    #    We fetch in bulk (one query) and group in Python.
    inventoried_packet_ids = list(cutoffs.keys())

    # Build per-packet cutoff timestamp filter using OR over all packets.
    # Simpler: load all ops for these packets up to max(cutoff timestamps)
    # then filter per-packet in Python — avoids a huge OR clause.
    max_cutoff_ts = max(v['timestamp'] for v in cutoffs.values())

    all_ops = list(
        StockOperation.objects.filter(
            packet_id__in=inventoried_packet_ids,
            timestamp__lte=max_cutoff_ts,
        )
        .order_by('packet_id', 'timestamp', 'id')
        .values('id', 'packet_id', 'quantity', 'relative_quantity', 'timestamp')
    )

    # Group by packet_id (order is already correct from queryset)
    ops_by_packet: dict[str, list] = defaultdict(list)
    for op in all_ops:
        ops_by_packet[str(op['packet_id'])].append(op)

    # 3. Replay ops up to each packet's cutoff and record the count.
    inventory_counts: dict[str, float] = {}
    for pid, cutoff in cutoffs.items():
        inventory_counts[pid] = _count_from_ops(ops_by_packet.get(pid, []), cutoff_id=cutoff['id'])

    return inventory_counts


def _collect_data(campaign, show_all: bool, uninventoried: str):
    # Counts computed by replaying operations up to the last inventory op
    inventory_counts = _build_inventory_counts(campaign.id)

    all_packets = list(
        Packet.objects.filter(is_active=True)
        .select_related('component', 'location')
        .order_by('component__name', 'id')
    )

    by_component: dict = defaultdict(list)
    for packet in all_packets:
        by_component[packet.component_id].append(packet)

    components = []
    for packets in by_component.values():
        component = packets[0].component
        packet_rows = []

        for packet in packets:
            pid = str(packet.id)
            is_inventoried = pid in inventory_counts

            if not is_inventoried and uninventoried == 'hide':
                continue

            count = inventory_counts[pid] if is_inventoried else float(packet.count)
            value = count * float(packet.itemValue)

            if not show_all and count == 0:
                continue

            packet_rows.append({
                'packet': packet,
                'is_inventoried': is_inventoried,
                'count': count,
                'value': value,
                'location': packet.location.full_path if packet.location else '—',
            })

        if not packet_rows:
            continue

        total_count = sum(r['count'] for r in packet_rows)
        total_value = sum(r['value'] for r in packet_rows)
        all_inventoried = all(r['is_inventoried'] for r in packet_rows)

        components.append({
            'component': component,
            'packet_rows': packet_rows,
            'total_count': total_count,
            'total_value': total_value,
            'all_inventoried': all_inventoried,
        })

    return components


def _generate_pdf(
    campaign: Stocktaking,
    components: list,
    total_active: int,
    total_inventoried: int,
    grand_total_value: float,
    show_packets: bool,
    uninventoried: str,
) -> bytes:
    show_status = uninventoried in ('show', 'alert')
    pdf = _ReportPDF(show_status=show_status)
    pdf.add_fonts()
    pdf.set_auto_page_break(auto=False)
    pdf.set_margins(MARGIN, MARGIN, MARGIN)

    # ── Cover page ──────────────────────────────────────────────────────────────
    pdf.add_page()
    pdf.set_font('DejaVu', style='B', size=22)
    pdf.set_xy(MARGIN, 60)
    pdf.cell(180, 12, 'INVENTURA SKLADU', align='C')

    pdf.set_font('DejaVu', style='', size=13)
    pdf.set_xy(MARGIN, 76)
    pdf.cell(180, 8, campaign.name, align='C')

    pdf.set_draw_color(180, 180, 180)
    pdf.line(MARGIN, 91, 210 - MARGIN, 91)

    end_date = campaign.open_until or campaign.target_date
    end_date_str = end_date.strftime('%-d. %-m. %Y') if end_date else '—'
    today_str = datetime.date.today().strftime('%-d. %-m. %Y')

    info_rows = [
        ('Datum vytvoření reportu:', today_str),
        ('Datum konce inventury:', end_date_str),
        ('Celková hodnota v reportu:', _fmt_value(grand_total_value)),
        ('Počet součástek v reportu:', str(len(components))),
        ('Inventarizováno sáčků:', f'{total_inventoried} / {total_active}'),
    ]

    label_x = MARGIN + 10
    value_x = MARGIN + 85
    y = 102
    for label, value in info_rows:
        pdf.set_font('DejaVu', style='', size=10)
        pdf.set_text_color(90, 90, 90)
        pdf.set_xy(label_x, y)
        pdf.cell(75, 8, label)
        pdf.set_font('DejaVu', style='B', size=10)
        pdf.set_text_color(0)
        pdf.set_xy(value_x, y)
        pdf.cell(90, 8, value)
        y += 9

    # ── Component table ──────────────────────────────────────────────────────────
    pdf.in_table = True
    pdf.add_page()
    pdf.draw_col_headers()

    for comp_data in components:
        component = comp_data['component']
        all_inventoried = comp_data['all_inventoried']
        is_alert = show_status and not all_inventoried and uninventoried == 'alert'

        needed = ROW_H + (SUB_ROW_H * len(comp_data['packet_rows']) if show_packets else 0)
        pdf.check_page_break(needed)

        # Component row
        y = pdf.get_y()
        x = MARGIN

        if is_alert:
            pdf.set_text_color(180, 30, 30)
            style = 'B'
        else:
            pdf.set_text_color(0)
            style = 'B'

        pdf.set_font('DejaVu', style=style, size=FONT_NORMAL)
        name_text = _truncate(pdf, component.name, pdf.col_name - 2)

        pdf.set_xy(x, y)
        pdf.cell(pdf.col_name, ROW_H, name_text)
        x += pdf.col_name

        pdf.set_font('DejaVu', style='', size=FONT_NORMAL)
        pdf.set_xy(x, y)
        pdf.cell(pdf.col_count, ROW_H, _fmt_count(comp_data['total_count']), align='R')
        x += pdf.col_count

        pdf.set_xy(x, y)
        pdf.cell(pdf.col_value, ROW_H, _fmt_value(comp_data['total_value']), align='R')
        x += pdf.col_value

        if show_status:
            pdf.set_xy(x, y)
            if is_alert:
                pdf.set_font('DejaVu', style='B', size=FONT_SMALL)
                pdf.cell(pdf.col_status, ROW_H, '! neinv.')
            else:
                pdf.set_font('DejaVu', style='', size=FONT_SMALL)
                pdf.cell(pdf.col_status, ROW_H, 'ok')

        pdf.set_text_color(0)
        pdf.ln(ROW_H)

        # Packet sub-rows
        if show_packets:
            pdf.set_font('DejaVu', style='', size=FONT_SMALL)
            for prow in comp_data['packet_rows']:
                pdf.check_page_break(SUB_ROW_H)
                y = pdf.get_y()
                x = MARGIN

                if not prow['is_inventoried'] and uninventoried == 'alert':
                    pdf.set_text_color(160, 50, 50)
                else:
                    pdf.set_text_color(70, 70, 70)

                loc_text = _truncate(pdf, f'  └ {prow["location"]}', pdf.col_name - 2)
                pdf.set_xy(x, y)
                pdf.cell(pdf.col_name, SUB_ROW_H, loc_text)
                x += pdf.col_name

                pdf.set_xy(x, y)
                pdf.cell(pdf.col_count, SUB_ROW_H, _fmt_count(prow['count']), align='R')
                x += pdf.col_count

                pdf.set_xy(x, y)
                pdf.cell(pdf.col_value, SUB_ROW_H, _fmt_value(prow['value']), align='R')
                x += pdf.col_value

                if show_status:
                    pdf.set_xy(x, y)
                    if not prow['is_inventoried'] and uninventoried == 'alert':
                        pdf.set_font('DejaVu', style='B', size=FONT_SMALL - 1)
                        pdf.cell(pdf.col_status, SUB_ROW_H, '!')
                        pdf.set_font('DejaVu', style='', size=FONT_SMALL)
                    else:
                        pdf.cell(pdf.col_status, SUB_ROW_H, '')

                pdf.set_text_color(0)
                pdf.ln(SUB_ROW_H)

        # Separator line between components
        pdf.set_draw_color(220, 220, 220)
        y = pdf.get_y()
        pdf.line(MARGIN, y, 210 - MARGIN, y)

    pdf.set_draw_color(0)

    return pdf.output()


class StocktakingReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        campaign = get_object_or_404(Stocktaking, pk=pk)

        show_all = request.query_params.get('show_all', 'false').lower() == 'true'
        show_packets = request.query_params.get('show_packets', 'false').lower() == 'true'
        uninventoried = request.query_params.get('uninventoried', 'alert')
        if uninventoried not in ('show', 'alert', 'hide'):
            uninventoried = 'alert'

        components = _collect_data(campaign, show_all, uninventoried)

        total_active = Packet.objects.filter(is_active=True).count()
        total_inventoried = StockOperation.objects.filter(
            operation_type='inventory',
            reference=campaign.id,
            packet__is_active=True,
        ).values('packet').distinct().count()
        grand_total_value = sum(c['total_value'] for c in components)

        pdf_bytes = _generate_pdf(
            campaign=campaign,
            components=components,
            total_active=total_active,
            total_inventoried=total_inventoried,
            grand_total_value=grand_total_value,
            show_packets=show_packets,
            uninventoried=uninventoried,
        )

        date_str = datetime.date.today().strftime('%Y-%m-%d')
        filename = f'inventura-{date_str}.pdf'

        buffer = io.BytesIO(pdf_bytes)
        return FileResponse(buffer, as_attachment=True, filename=filename, content_type='application/pdf')
