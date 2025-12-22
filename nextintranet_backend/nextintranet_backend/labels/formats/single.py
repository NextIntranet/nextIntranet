from fpdf import FPDF
from nextintranet_backend.labels.base import LabelFormatGenerator


class SingleLabelGenerator(LabelFormatGenerator):
    """Generator for single labels (one label per page)."""
    
    def __init__(self, width_mm=63.5, height_mm=38.1, color_mode='color'):
        super().__init__(width_mm, height_mm, color_mode)
        print(f"SingleLabelGenerator: Initialized with width={width_mm}mm, height={height_mm}mm, color_mode={color_mode}")
    
    def _create_pdf(self):
        """Create a PDF document for single labels."""
        print(f"SingleLabelGenerator: Creating PDF with format ({self.width_mm}mm x {self.height_mm}mm)")
        # Use landscape orientation for packet labels
        orientation = 'P' if self.height_mm > self.width_mm else 'L'
        self.pdf = FPDF(orientation=orientation, unit='mm', format=(self.height_mm, self.width_mm))
        self.pdf.set_auto_page_break(auto=False, margin=0)
        self.pdf.set_margins(0, 0, 0)
        
    def generate_pdf(self, data):
        """Generate a PDF with single labels."""
        print(f"SingleLabelGenerator: Generating PDF for {len(data)} items")
        self._create_pdf()
        
        for idx, record in enumerate(data):
            print(f"SingleLabelGenerator: Processing item {idx+1}/{len(data)}")
            type = record.get('type', None)

            print(f"SingleLabelGenerator: Processing item {idx+1}/{len(data)}: type={type}")
            self.pdf.add_page()
            
            # Generate content based on the label type
            if type in self.content_generators:
                print(f"SingleLabelGenerator: Using registered generator for '{type}'")
                # Pass label dimensions to the content generator
                self.content_generators[type].generate_label_content(
                    self.pdf, 
                    record, 
                    label_width=self.width_mm, 
                    label_height=self.height_mm
                )
            else:
                print(f"SingleLabelGenerator: No registered generator for '{type}', using default")
                # Default label handling
                self.pdf.set_font('Arial', 'B', 12)
                self.pdf.cell(0, 10, f"Label: {type}", 0, 1, 'C')
                self.pdf.set_font('Arial', '', 10)
                self.pdf.cell(0, 10, f"Data: {record}", 0, 1, 'L')
        
        print("SingleLabelGenerator: PDF generation complete")        
        return self.output()
