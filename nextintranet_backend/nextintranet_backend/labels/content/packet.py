import io
import datetime
import treepoem
from nextintranet_backend.labels.base import LabelContentGenerator
from fpdf import FPDF
import os

from nextintranet_warehouse.models.component import Packet

class PacketLabelGenerator(LabelContentGenerator):
    """Generator for packet labels."""
    
    def __init__(self, color_mode='color'):
        super().__init__(color_mode)
    
    def generate_label_content(self, pdf, data, label_width=None, label_height=None, x_position=None, y_position=None):
        """
        Generate content for a packet label with responsive layout.
        
        Args:
            pdf: FPDF object
            data: Label data
            label_width: Width of the label in mm
            label_height: Height of the label in mm
            x_position: X position of the label on the page
            y_position: Y position of the label on the page
        """
        print(f"PacketLabelGenerator: Generating packet label for data: {data}")
        print(f"PacketLabelGenerator: Label dimensions: {label_width}mm x {label_height}mm")
        print(f"PacketLabelGenerator: Label position: {x_position}mm, {y_position}mm")

        uuid = data.get('uuid', None)
        packet = Packet.objects.filter(id=uuid).first()
        component = packet.component
        print(f"PacketLabelGenerator: Retrieved packet ORM object: {packet}")
        

        # Extract necessary data and sanitize for PDF encoding
        #component_name = self._sanitize_text(component.name)
        #component_description = self._sanitize_text(component.description)
        component_name = component.name
        component_description = component.description
        packet_id = uuid
        uuid_short = str(uuid)[:8] if uuid else "UNKNOWN"
        position = packet.location.full_path if packet.location else ''
        barcode = f"https://ni.ust.cz/?packet={uuid}&component={component.id}"


        print(os.getcwd())
        pdf.add_font('DejaVu', '', "./nextintranet_backend/labels/content/OpenSans.ttf", uni=True)
        pdf.add_font('DejaVu', 'B', "./nextintranet_backend/labels/content/OpenSans-Bold.ttf", uni=True)
        pdf.set_font('DejaVu', '', 12) 
        
        # If no dimensions provided, use PDF dimensions
        if label_width is None:
            label_width = pdf.w
        if label_height is None:
            label_height = pdf.h

        # Use provided base coordinates or default to 0,0
        x0 = x_position if x_position is not None else 0
        y0 = y_position if y_position is not None else 0

        # Calculate responsive metrics based on label size
        font_size_title = min(12, max(12, label_width / 8))
        font_size_normal = min(10, max(8, label_width / 9))
        font_size_small = min(8, max(5, label_width / 10))
        header_height = label_height * 0.12
        barcode_size = min(20, label_width * 0.3, label_height * 0.5)
        
        # Set colors based on color mode
        if self.color_mode == 'color':
            header_color = (245, 245, 245)  # Light grey
            line_color = (100, 100, 100)    # Grey for the line
            text_color_header = (100, 100, 100)  # Grey
            text_color_normal = (0, 0, 0)   # Black
            text_color_location = (80, 80, 80)  # Dark grey
        else:
            # Black and white mode
            header_color = (255, 255, 255)  # White
            line_color = (0, 0, 0)          # Black line
            text_color_header = (0, 0, 0)   # Black
            text_color_normal = (0, 0, 0)   # Black
            text_color_location = (0, 0, 0)  # Black
        
        # "Packet" text in the top left with UUID - using x0, y0 as base coordinates
        pdf.set_text_color(*text_color_header)
        # Use built-in monospaced font instead
        pdf.set_font('DejaVu', '', int(font_size_small))
        pdf.set_xy(x0+2, y0+1)
        pdf.cell(label_width/2, 4.5, "Packet", align='L')
        
        # Add UUID on the right side - using x0 as base
        pdf.set_xy(x0+label_width/2, y0+1)
        pdf.cell(label_width/2-2, 4.5, f"ID: {uuid_short}", align='R')
        print(f"PacketLabelGenerator: Added 'Packet' header and UUID: {uuid_short}")
        
        # Component name - full width - using x0, y0 as base
        pdf.set_fill_color(*header_color)
        pdf.set_text_color(*text_color_normal)
        # Use built-in monospaced font
        pdf.set_font('DejaVu', 'B', font_size_title)
        pdf.set_xy(x0+2, y0+4.5)
        
        # Truncate and resize name if too long
        label_name = component_name
        if len(label_name) > 40:
            label_name = label_name[:40] + "..."
        name_length = pdf.get_string_width(label_name)
        
        # Adjust font size if name is too long
        if name_length > label_width-6:
            print(f"PacketLabelGenerator: Adjusting font size for long name ({name_length}mm > {label_width-6}mm)")
            for size in range(0, int(font_size_title*10)):
                pdf.set_font('DejaVu', 'B', font_size_title - size / 10)
                name_length = pdf.get_string_width(label_name)
                if name_length < label_width-6:
                    break
        
        # Display component name without border
        pdf.cell(label_width-4, header_height, label_name, 0, 1, 'L')
        
        # Draw horizontal line under the component name
        line_y = y0 + 4.5 + header_height
        pdf.set_draw_color(*line_color)
        pdf.set_line_width(0.3)  # Slightly thicker line for visibility
        pdf.line(x0+1, line_y, x0+label_width-1, line_y)
        
        print(f"PacketLabelGenerator: Added component name with underline: {label_name}")
        
        # Location information with special formatting - using x0, y0 as base
        if position:
            # Split the position by the last slash
            parts = position.rsplit('/')
            
            pdf.set_text_color(*text_color_location)
            pdf.set_xy(x0+2, y0+10)
            
            if len(parts) > 1:
                # Path part (before last slash) - regular font
                path_part = '/'.join(parts[:-1]) + '/ '
                pdf.set_font('DejaVu', '', font_size_normal)  # Using built-in DejaVu font
                path_width = pdf.get_string_width(path_part)
                pdf.cell(path_width, 3, path_part, 0, 0, 'L')
                
                # Name part (after last slash) - bold font
                name_part = parts[-1]
                pdf.set_font('DejaVu', 'B', font_size_normal)  # Using built-in DejaVu font
                pdf.cell(label_width-10-path_width, 3, name_part, 0, 1, 'L')
            else:
                # Only one part (no slashes)
                pdf.set_font('DejaVu', 'B', font_size_normal)  # Using built-in DejaVu font
                pdf.cell(label_width-10, 3, position, 0, 1, 'L')
                
            print(f"PacketLabelGenerator: Added formatted position: {position}")
        
        # Component description - adjust position based on label size - using x0, y0 as base
        pdf.set_font('Arial', '', font_size_small)  # Regular font for description is fine
        description = component_description[:110].strip() if component_description else ""
        # Sanitize description to ensure compatibility with PDF encoding
        #description = self._sanitize_text(description)
        desc_y_pos = y0 + header_height + 10
        desc_width = label_width - barcode_size - 8
        pdf.set_xy(x0+2, desc_y_pos)
        pdf.set_text_color(*text_color_normal)
        pdf.multi_cell(desc_width, label_height * 0.07, description, align='L')
        print(f"PacketLabelGenerator: Added description: {description[:20]}...")
        
        # Barcode (DataMatrix) - size is now responsive - using x0, y0 as base
        print(f"PacketLabelGenerator: Generating barcode with data: {barcode}")
        
        try:
            # Generate barcode image using treepoem
            barcode_image = treepoem.generate_barcode(
                barcode_type='datamatrix',
                data=barcode
            ).convert('1')
            
            # Save to temporary file
            barcode_image_path = f'/tmp/packet_barcode_{uuid_short}.png'
            barcode_image.save(barcode_image_path, format='PNG')
            
            # Calculate barcode position based on label size - using x0, y0 as base
            barcode_x = x0+label_width-barcode_size-4
            barcode_y = y0+8+7
            
            # Add to PDF
            pdf.set_xy(barcode_x, barcode_y)
            pdf.image(barcode_image_path, x=None, y=None, w=barcode_size, h=barcode_size, type='PNG', link='')
            print(f"PacketLabelGenerator: Barcode added successfully with size {barcode_size}mm")
        except Exception as e:
            print(f"PacketLabelGenerator: Error generating barcode: {e}")
            # In case of error, add a placeholder text
            pdf.set_text_color(255, 0, 0)
            pdf.set_xy(x0+label_width-barcode_size-4, y0+8+7)
            pdf.cell(barcode_size, barcode_size, "BARCODE", 1, 0, 'C')
            
        print(f"PacketLabelGenerator: Label completed for packet {packet_id}")
    