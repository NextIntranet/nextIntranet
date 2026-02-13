from nextintranet_backend.labels.base import LabelContentGenerator, DEFAULT_FONT_FAMILY


class LocationLabelGenerator(LabelContentGenerator):
    """Generator for location labels."""
    
    def generate_label_content(self, pdf, data, label_width=None, label_height=None, x_position=None, y_position=None):
        """Generate content for a location label."""
        print(f"LocationLabelGenerator: Generating content for data: {data}")
        
        # Use provided position or default to 0,0
        x0 = x_position if x_position is not None else 0
        y0 = y_position if y_position is not None else 0
        
        pdf.set_font(DEFAULT_FONT_FAMILY, 'B', 12)
        pdf.set_xy(x0 + 2, y0 + 2)
        pdf.cell((label_width - 4) if label_width else 0, 10, "LOCATION", 0, 1, 'C')
        
        # Draw horizontal line under title
        pdf.set_draw_color(100, 100, 100)
        pdf.set_line_width(0.3)
        pdf.line(x0+1, y0+12, x0+label_width-1, y0+12)
        
        # Location details
        pdf.set_font(DEFAULT_FONT_FAMILY, '', 10)
        pdf.set_xy(x0 + 2, y0 + 15)
        pdf.cell((label_width - 4) if label_width else 0, 10, f"Building: {data.get('building', 'N/A')}", 0, 1, 'L')
        
        pdf.set_xy(x0 + 2, y0 + 25)
        pdf.cell((label_width - 4) if label_width else 0, 10, f"Room: {data.get('room', 'N/A')}", 0, 1, 'L')
