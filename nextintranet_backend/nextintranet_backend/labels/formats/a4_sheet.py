from fpdf import FPDF
from nextintranet_backend.labels.base import LabelFormatGenerator


class A4SheetLabelGenerator(LabelFormatGenerator):
    """Generator for multiple labels on an A4 sheet."""
    
    def __init__(self, label_width_mm=63.5, label_height_mm=38.1, columns=2, rows=7, 
                 margin_left_mm=3, margin_top_mm=3, spacing_h_mm=2, spacing_v_mm=2, 
                 color_mode='color', skip_labels=0, show_borders=False,
                 page_margin_left=0, page_margin_top=0, page_margin_right=0, page_margin_bottom=0):
        super().__init__(label_width_mm, label_height_mm, color_mode)
        self.columns = columns
        self.rows = rows
        self.margin_left = margin_left_mm
        self.margin_top = margin_top_mm
        self.spacing_h = spacing_h_mm
        self.spacing_v = spacing_v_mm
        self.skip_labels = int(skip_labels)
        self.show_borders = show_borders
        
        # Page margins (printable area)
        self.page_margin_left = page_margin_left
        self.page_margin_top = page_margin_top
        self.page_margin_right = page_margin_right
        self.page_margin_bottom = page_margin_bottom
        
        print(f"A4SheetLabelGenerator: Initialized with {columns}x{rows} grid, color_mode={color_mode}")
        print(f"  Label size: {label_width_mm}mm x {label_height_mm}mm")
        print(f"  Margins: left={margin_left_mm}mm, top={margin_top_mm}mm")
        print(f"  Spacing: horizontal={spacing_h_mm}mm, vertical={spacing_v_mm}mm")
        print(f"  Show borders: {show_borders}")
        print(f"  Page margins: left={page_margin_left}mm, top={page_margin_top}mm, right={page_margin_right}mm, bottom={page_margin_bottom}mm")
        print(f"  Skipping first {self.skip_labels} labels")
    
    def _create_pdf(self):
        """Create a PDF document for A4 sheet."""
        print("A4SheetLabelGenerator: Creating A4 PDF")
        self.pdf = FPDF(orientation='P', unit='mm', format='A4')
        self.pdf.set_auto_page_break(auto=False, margin=0)
        self.pdf.set_margins(0, 0, 0)
        
    def generate_pdf(self, data):
        """Generate a PDF with labels arranged on A4 sheets."""
        print(f"A4SheetLabelGenerator: Generating PDF for {len(data)} items")
        print(f"A4SheetLabelGenerator: Using {self.columns}x{self.rows} grid")
        print(f"A4SheetLabelGenerator: Label size: {self.width_mm}x{self.height_mm}mm")
        print(f"A4SheetLabelGenerator: Margins: left={self.margin_left}mm, top={self.margin_top}mm")
        print(f"A4SheetLabelGenerator: Spacing: h={self.spacing_h}mm, v={self.spacing_v}mm")
        print(f"A4SheetLabelGenerator: Page margins: left={self.page_margin_left}mm, top={self.page_margin_top}mm, right={self.page_margin_right}mm, bottom={self.page_margin_bottom}mm")
        
        self._create_pdf()
        self.pdf.add_page()
        
        # Calculate positions
        item_index = 0
        total_items = len(data)
        
        # Calculate total label positions per page and overall
        labels_per_page = self.rows * self.columns
        print(f"A4SheetLabelGenerator: Grid capacity per page: {labels_per_page} labels")
        
        # Calculate how many labels to skip
        skip_count = self.skip_labels
        print(f"A4SheetLabelGenerator: Skipping first {skip_count} label positions")
        
        # Calculate which page to start on and which position
        current_page = skip_count // labels_per_page
        remaining_skip = skip_count % labels_per_page
        
        page_number = current_page + 1
        
        # Add pages until we reach the starting page
        for _ in range(current_page):
            self.pdf.add_page()
            
        print(f"A4SheetLabelGenerator: Starting on page {page_number}, skipping first {remaining_skip} positions on this page")
        
        # Calculate starting row and column for remaining skips
        start_row = remaining_skip // self.columns
        start_col = remaining_skip % self.columns
        
        position_index = skip_count
        labels_on_page = 0
        
        while item_index < total_items:
            # Start from the row and column calculated from skipped labels
            for row in range(start_row, self.rows):
                start_col_for_row = start_col if row == start_row else 0
                
                for col in range(start_col_for_row, self.columns):
                    if item_index >= total_items:
                        break
                    
                    # Calculate position for this label with page margins
                    x = self.page_margin_left + self.margin_left + col * (self.width_mm + self.spacing_h)
                    y = self.page_margin_top + self.margin_top + row * (self.height_mm + self.spacing_v)
                    
                    print(f"Label position [{row+1},{col+1}]: ({x},{y}) mm")
                    
                    # Draw border if requested - Using calculated dimensions for each label
                    if self.show_borders:
                        # Calculate actual label dimensions
                        effective_width = self.width_mm
                        effective_height = self.height_mm
                        
                        # Draw a visible border around the label area
                        self.pdf.set_draw_color(100, 100, 100)
                        self.pdf.set_line_width(0.5)
                        self.pdf.rect(x, y, effective_width, effective_height, style='D')
                        print(f"A4SheetLabelGenerator: Drawing calculated border at ({x},{y}) with size {effective_width}x{effective_height}mm")
                    
                    # Set position for this label
                    self.pdf.set_xy(x, y)
                    
                    # Get the current item
                    record = data[item_index]
                    type = record.get('type', None)
                    print(f"A4SheetLabelGenerator: Processing item {item_index+1}/{total_items}: type={type}")
                    
                    # Generate content based on the label type
                    if type in self.content_generators:
                        print(f"A4SheetLabelGenerator: Using registered generator for '{type}'")
                        
                        # Call the content generator with current position - PASS THE COORDINATES
                        self.content_generators[type].generate_label_content(
                            self.pdf,
                            record,
                            label_width=self.width_mm,
                            label_height=self.height_mm,
                            x_position=x,  # Pass x position
                            y_position=y   # Pass y position
                        )
                    else:
                        print(f"A4SheetLabelGenerator: No registered generator for '{type}', using default")
                        # Default label handling
                        self.pdf.set_font('Arial', 'B', 12)
                        self.pdf.cell(self.width_mm, 10, f"Label: {type}", 0, 1, 'C')
                        self.pdf.set_font('Arial', '', 10)
                        self.pdf.cell(self.width_mm, 10, f"Data: {record}", 0, 1, 'L')
                    
                    item_index += 1
                    position_index += 1
                    labels_on_page += 1
                
                if item_index >= total_items:
                    break
            
            print(f"A4SheetLabelGenerator: Page {page_number} complete with {labels_on_page} labels")
            
            # Reset for next page
            if item_index < total_items:
                self.pdf.add_page()
                page_number += 1
                labels_on_page = 0
                start_row = 0
                start_col = 0
                print(f"A4SheetLabelGenerator: Starting page {page_number}")
                
        print(f"A4SheetLabelGenerator: PDF generation complete with {page_number} pages")
        return self.output()
