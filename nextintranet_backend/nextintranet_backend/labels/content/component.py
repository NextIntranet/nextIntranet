from nextintranet_backend.labels.base import LabelContentGenerator


class ComponentLabelGenerator(LabelContentGenerator):
    """Generator for component labels."""
    
    def generate_label_content(self, pdf, data, label_width=None, label_height=None, x_position=None, y_position=None):
        """Generate content for a component label."""
        print(f"ComponentLabelGenerator: Generating content for data: {data}")
        
        # Use provided position or default to 0,0
        x0 = x_position if x_position is not None else 0
        y0 = y_position if y_position is not None else 0
        
        # Using built-in Courier font
        pdf.set_font('Courier', 'B', 12)
        pdf.set_xy(x0 + 2, y0 + 2)
        pdf.cell((label_width - 4) if label_width else 0, 10, "COMPONENT", 0, 1, 'C')
        
        # Draw horizontal line under title
        pdf.set_draw_color(100, 100, 100)
        pdf.set_line_width(0.3)
        pdf.line(x0+1, y0+12, x0+label_width-1, y0+12)
        
        # Component details
        pdf.set_font('Courier', '', 10)
        pdf.set_xy(x0 + 2, y0 + 15)
        pdf.cell((label_width - 4) if label_width else 0, 10, f"Type: {data.get('type', 'N/A')}", 0, 1, 'L')
        
        pdf.set_xy(x0 + 2, y0 + 25)
        pdf.cell((label_width - 4) if label_width else 0, 10, f"Serial: {data.get('serial', 'N/A')}", 0, 1, 'L')
