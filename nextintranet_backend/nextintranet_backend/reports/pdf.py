"""Small fpdf2 base for downloadable A4 reports (Unicode fonts, header/footer, tables).

Usage:
    pdf = ReportPDF("Sourcing list", "Board v2 / Series 3")
    pdf.section("Lines")
    pdf.table([Column("Ref", 30), Column("Qty", 15, "R")], [Row(["R1", "4"])])
    return pdf_response(pdf, "sourcing.pdf")
"""
import io
from dataclasses import dataclass, field

from django.http import FileResponse
from django.utils import timezone
from fpdf import FPDF

from nextintranet_backend.labels.base import DEFAULT_FONT_FAMILY, ensure_unicode_fonts

FONT = DEFAULT_FONT_FAMILY
MARGIN = 12
ROW_H = 6
SUB_ROW_H = 4.6


@dataclass
class Column:
    label: str
    width: float
    align: str = "L"


@dataclass
class Row:
    cells: list
    # Extra indented lines under the row (e.g. stock locations).
    sub: list = field(default_factory=list)
    bold: bool = False
    muted: bool = False
    checkbox: bool = False


def fmt_qty(value) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "-"
    if number == int(number):
        return str(int(number))
    return f"{number:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def fmt_money(value, currency: str = "Kč") -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "-"
    integer, decimal = f"{number:,.2f}".split(".")
    return f"{integer.replace(',', ' ')},{decimal} {currency}"


def fmt_datetime(value) -> str:
    if not value:
        return "-"
    if hasattr(value, "hour"):
        return timezone.localtime(value).strftime("%d.%m.%Y %H:%M")
    return value.strftime("%d.%m.%Y")


class ReportPDF(FPDF):
    def __init__(self, title: str, subtitle: str = "", orientation: str = "P"):
        super().__init__(orientation=orientation, unit="mm", format="A4")
        ensure_unicode_fonts(self)
        self.report_title = title
        self.report_subtitle = subtitle
        self.generated_at = timezone.localtime()
        self._table_columns: list[Column] | None = None
        self.set_margins(MARGIN, MARGIN, MARGIN)
        self.set_auto_page_break(auto=False)
        self.alias_nb_pages()
        self.add_page()
        self._title_block()

    # -- page furniture -------------------------------------------------
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font(FONT, "", 7)
        self.set_text_color(130)
        self.cell(0, 4, f"{self.report_title} — {self.report_subtitle}", new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0)
        self.ln(2)

    def footer(self):
        self.set_y(-10)
        self.set_font(FONT, "", 7)
        self.set_text_color(150)
        self.cell(0, 4, f"Generated {self.generated_at:%d.%m.%Y %H:%M}", align="L")
        self.set_x(self.l_margin)
        self.cell(0, 4, f"Page {self.page_no()} / {{nb}}", align="R")
        self.set_text_color(0)

    def _title_block(self):
        self.set_font(FONT, "B", 15)
        self.cell(0, 8, self.report_title, new_x="LMARGIN", new_y="NEXT")
        if self.report_subtitle:
            self.set_font(FONT, "", 10)
            self.set_text_color(90)
            self.cell(0, 5, self.report_subtitle, new_x="LMARGIN", new_y="NEXT")
            self.set_text_color(0)
        self.ln(3)

    @property
    def content_width(self) -> float:
        return self.w - self.l_margin - self.r_margin

    @property
    def page_bottom(self) -> float:
        return self.h - 14

    def ensure_space(self, height: float):
        if self.get_y() + height > self.page_bottom:
            self.add_page()
            if self._table_columns:
                self._table_header(self._table_columns)

    def truncate(self, text, width: float) -> str:
        text = "" if text is None else str(text).replace("\n", " ")
        if self.get_string_width(text) <= width - 1.5:
            return text
        while len(text) > 1 and self.get_string_width(text + "…") > width - 1.5:
            text = text[:-1]
        return text + "…"

    # -- building blocks ------------------------------------------------
    def section(self, title: str):
        self.ensure_space(14)
        self.ln(2)
        self.set_font(FONT, "B", 11)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(200)
        self.line(self.l_margin, self.get_y(), self.l_margin + self.content_width, self.get_y())
        self.set_draw_color(0)
        self.ln(1.5)

    def key_values(self, pairs: list[tuple[str, str]], columns: int = 2):
        col_w = self.content_width / columns
        label_w = min(38, col_w * 0.45)
        for index in range(0, len(pairs), columns):
            self.ensure_space(5.5)
            y = self.get_y()
            for offset, (label, value) in enumerate(pairs[index:index + columns]):
                x = self.l_margin + offset * col_w
                self.set_xy(x, y)
                self.set_font(FONT, "", 8)
                self.set_text_color(110)
                self.cell(label_w, 5.5, self.truncate(label, label_w))
                self.set_text_color(0)
                self.set_font(FONT, "B", 9)
                self.cell(col_w - label_w, 5.5, self.truncate(value, col_w - label_w))
            self.set_xy(self.l_margin, y + 5.5)

    def paragraph(self, text: str, size: float = 9):
        if not text:
            return
        self.set_font(FONT, "", size)
        for chunk in str(text).splitlines() or [""]:
            self.ensure_space(5)
            self.multi_cell(0, 4.6, chunk or " ", new_x="LMARGIN", new_y="NEXT")

    def muted(self, text: str):
        self.set_font(FONT, "", 8)
        self.set_text_color(120)
        self.multi_cell(0, 4.5, text, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0)

    def _table_header(self, columns: list[Column]):
        self.set_font(FONT, "B", 7.5)
        self.set_fill_color(235)
        self.set_text_color(60)
        for column in columns:
            self.cell(column.width, ROW_H, self.truncate(column.label, column.width), border="B", align=column.align, fill=True)
        self.ln(ROW_H)
        self.set_text_color(0)
        self.set_fill_color(255)

    def table(self, columns: list[Column], rows: list[Row], empty_text: str = "No rows."):
        self.ensure_space(ROW_H * 3)
        self._table_header(columns)
        self._table_columns = columns
        if not rows:
            self.muted(empty_text)
        for row in rows:
            self.ensure_space(ROW_H + SUB_ROW_H * min(len(row.sub), 3))
            self.set_font(FONT, "B" if row.bold else "", 8)
            if row.muted:
                self.set_text_color(140)
            for index, (column, value) in enumerate(zip(columns, row.cells)):
                if index == 0 and row.checkbox:
                    x, y = self.get_x(), self.get_y()
                    self.rect(x + 1, y + 1.4, 3.2, 3.2)
                    self.cell(column.width, ROW_H, "")
                    continue
                self.cell(column.width, ROW_H, self.truncate(value, column.width), align=column.align)
            self.ln(ROW_H)
            self.set_text_color(0)
            if row.sub:
                indent = columns[0].width if row.checkbox else 4
                self.set_font(FONT, "", 7)
                self.set_text_color(70)
                for line in row.sub:
                    self.ensure_space(SUB_ROW_H)
                    self.set_x(self.l_margin + indent)
                    self.cell(self.content_width - indent, SUB_ROW_H, self.truncate(line, self.content_width - indent))
                    self.ln(SUB_ROW_H)
                self.set_text_color(0)
            self.set_draw_color(225)
            self.line(self.l_margin, self.get_y(), self.l_margin + self.content_width, self.get_y())
            self.set_draw_color(0)
        self._table_columns = None
        self.ln(2)


def pdf_response(pdf: FPDF, filename: str) -> FileResponse:
    buffer = io.BytesIO(bytes(pdf.output()))
    return FileResponse(buffer, as_attachment=True, filename=filename, content_type="application/pdf")
