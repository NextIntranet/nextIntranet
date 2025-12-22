from abc import ABC, abstractmethod
from io import BytesIO
from fpdf import FPDF


class LabelContentGenerator(ABC):
    """Base class for generating the content of a specific label type."""
    
    def __init__(self, color_mode='color'):
        """
        Initialize the generator with color mode preference.
        
        Args:
            color_mode: 'color' or 'bw' (black and white)
        """
        self.color_mode = color_mode
        print(f"LabelContentGenerator: Initialized with color_mode={color_mode}")
    
    @abstractmethod
    def generate_label_content(self, pdf, data, label_width=None, label_height=None, x_position=None, y_position=None):
        """
        Generate the content for a specific label type.
        
        Args:
            pdf: FPDF object to draw on
            data: Label data
            label_width: Width of the label in mm
            label_height: Height of the label in mm
            x_position: X position of the label on the page
            y_position: Y position of the label on the page
        """
        pass


class LabelFormatGenerator(ABC):
    """Base class for generating labels in a specific format (single, A4 sheet, etc.)."""
    
    def __init__(self, width_mm=None, height_mm=None, color_mode='color'):
        self.width_mm = width_mm
        self.height_mm = height_mm
        self.pdf = None
        self.content_generators = {}
        self.color_mode = color_mode
        print(f"LabelFormatGenerator: Base class initialized with dimensions {width_mm}x{height_mm}mm, color_mode={color_mode}")
    
    def register_content_generator(self, key, generator):
        """Register a content generator for a specific label type."""
        print(f"LabelFormatGenerator: Registering generator for '{key}' type: {type(generator).__name__}")
        self.content_generators[key] = generator
        
    def _create_pdf(self):
        """Create a PDF document with the appropriate format."""
        pass
        
    @abstractmethod
    def generate_pdf(self, data):
        """Generate a PDF document with labels based on the provided data."""
        pass
    
    def output(self):
        """Output the PDF document as bytes."""
        print("LabelFormatGenerator: Generating PDF output")
        pdf_buffer = BytesIO()
        try:
            # Try to output with UTF-8 encoding if supported
            # fpdf2 returns bytes directly when dest='S'
            pdf_content = self.pdf.output(dest='S')
            # Only encode if it returned a string (for compatibility with older fpdf)
            if isinstance(pdf_content, str):
                pdf_content = pdf_content.encode('latin1')

        except UnicodeEncodeError as e:
            print(f"LabelFormatGenerator: Handling encoding error: {e}")
            # Fall back to ASCII with replacement for non-Latin1 characters
            pdf_content = self._safe_encode_output()
            
        pdf_buffer.write(pdf_content)
        pdf_buffer.seek(0)
        pdf_bytes = pdf_buffer.getvalue()
        print(f"LabelFormatGenerator: Generated PDF size: {len(pdf_bytes)} bytes")
        return pdf_bytes
    
    def _safe_encode_output(self):
        """Handle encoding issues by replacing non-Latin1 characters."""
        try:
            # Try to get the output as string and encode with error handling
            output = self.pdf.output(dest='S')
            if isinstance(output, str):
                return output.encode('latin1', errors='replace')
            return output
        except Exception as e:
            print(f"LabelFormatGenerator: Error in safe encoding: {e}")
            # Last resort fallback - get the raw output
            return self.pdf.output(dest='S').encode('ascii', errors='replace')
