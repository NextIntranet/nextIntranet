from nextintranet_backend.labels.formats.single import SingleLabelGenerator
from nextintranet_backend.labels.formats.a4_sheet import A4SheetLabelGenerator
from nextintranet_backend.labels.content.packet import PacketLabelGenerator
from nextintranet_backend.labels.content.component import ComponentLabelGenerator
from nextintranet_backend.labels.content.location import LocationLabelGenerator


class LabelGeneratorFactory:
    """Factory for creating label generators."""
    
    @staticmethod
    def create_label_generator(format_type, **kwargs):
        """
        Create a label generator of the specified format and register content generators.
        
        Args:
            format_type: Type of label format ('single', 'a4_2x7', etc.)
            kwargs: Additional arguments for the label generator
                width_mm: Width in mm
                height_mm: Height in mm
                color_mode: 'color' or 'bw' (black and white)
                margin_left_mm: Left margin in mm (for A4 sheet)
                margin_top_mm: Top margin in mm (for A4 sheet)
                spacing_h_mm: Horizontal spacing in mm (for A4 sheet)
                spacing_v_mm: Vertical spacing in mm (for A4 sheet)
                skip_labels: Number of labels to skip at the beginning (for A4 sheet)
                show_borders: Whether to show light gray borders around labels
                page_margin_left: Left margin of the page in mm
                page_margin_top: Top margin of the page in mm
                page_margin_right: Right margin of the page in mm
                page_margin_bottom: Bottom margin of the page in mm
            
        Returns:
            Configured label generator instance
        """
        print(f"LabelGeneratorFactory: Creating generator for format '{format_type}'")
        print(f"LabelGeneratorFactory: Parameters: {kwargs}")
        
        # Get common parameters with explicit default for show_borders
        color_mode = kwargs.get('color_mode', 'color')
        skip_labels = kwargs.get('skip_labels', 0)
        show_borders = kwargs.get('show_borders', True) # Default to True to ensure borders are visible
        
        # Page margins
        page_margin_left = kwargs.get('page_margin_left', 0)
        page_margin_top = kwargs.get('page_margin_top', 0)
        page_margin_right = kwargs.get('page_margin_right', 0)
        page_margin_bottom = kwargs.get('page_margin_bottom', 0)
        
        # Create format generator
        if format_type == 'single':
            print("LabelGeneratorFactory: Creating SingleLabelGenerator")
            generator = SingleLabelGenerator(
                width_mm=kwargs.get('width_mm', 66.04),
                height_mm=kwargs.get('height_mm', 38.1),
                color_mode=color_mode
            )
        elif format_type == 'a4_2x7':
            print("LabelGeneratorFactory: Creating A4SheetLabelGenerator (2x7)")
            generator = A4SheetLabelGenerator(
                label_width_mm=kwargs.get('width_mm', 63.5),
                label_height_mm=kwargs.get('height_mm', 38.1),
                columns=2,
                rows=7,
                margin_left_mm=kwargs.get('margin_left_mm', 10),
                margin_top_mm=kwargs.get('margin_top_mm', 10),
                spacing_h_mm=kwargs.get('spacing_h_mm', 5),
                spacing_v_mm=kwargs.get('spacing_v_mm', 0),
                color_mode=color_mode,
                skip_labels=skip_labels,
                show_borders=show_borders,
                page_margin_left=page_margin_left,
                page_margin_top=page_margin_top,
                page_margin_right=page_margin_right,
                page_margin_bottom=page_margin_bottom
            )
        elif format_type == 'a4_3x7':
            print("LabelGeneratorFactory: Creating A4SheetLabelGenerator (3x7)")
            # Retrieve margin settings with more appropriate defaults for 3x7 layout
            margin_left_mm = kwargs.get('margin_left_mm', 3)
            margin_top_mm = kwargs.get('margin_top_mm', 3)
            spacing_h_mm = kwargs.get('spacing_h_mm', 0)
            spacing_v_mm = kwargs.get('spacing_v_mm', 0)

            width_mm = kwargs.get('width_mm', 70)
            height_mm = kwargs.get('height_mm', 42.3)

            margin_left_mm = 3
            margin_top_mm = 3
            spacing_h_mm = 0
            spacing_v_mm = 0
            skip_labels = 0
            width_mm = 70
            height_mm = 42.3
            
            print(f"LabelGeneratorFactory: Using margins for 3x7: left={margin_left_mm}mm, top={margin_top_mm}mm")
            print(f"LabelGeneratorFactory: Using spacing for 3x7: h={spacing_h_mm}mm, v={spacing_v_mm}mm")
            
            generator = A4SheetLabelGenerator(
                label_width_mm=width_mm,
                label_height_mm=height_mm,
                columns=3,
                rows=7,
                margin_left_mm=margin_left_mm,
                margin_top_mm=margin_top_mm,
                spacing_h_mm=spacing_h_mm,
                spacing_v_mm=spacing_v_mm,
                color_mode=color_mode,
                skip_labels=skip_labels,
                show_borders=show_borders,
                page_margin_left=kwargs.get('page_margin_left', 3),   # Default 5mm page margin
                page_margin_top=kwargs.get('page_margin_top', 3),    # Default 10mm page margin
                page_margin_right=kwargs.get('page_margin_right', 3), # Default 5mm page margin
                page_margin_bottom=kwargs.get('page_margin_bottom', 3) # Default 10mm page margin
            )
        elif format_type == 'a4_4x10':
            print("LabelGeneratorFactory: Creating A4SheetLabelGenerator (4x10)")
            generator = A4SheetLabelGenerator(
                label_width_mm=kwargs.get('width_mm', 48),
                label_height_mm=kwargs.get('height_mm', 25),
                columns=4,
                rows=10,
                margin_left_mm=kwargs.get('margin_left_mm', 10),
                margin_top_mm=kwargs.get('margin_top_mm', 15),
                spacing_h_mm=kwargs.get('spacing_h_mm', 0),
                spacing_v_mm=kwargs.get('spacing_v_mm', 0),
                color_mode=color_mode,
                skip_labels=skip_labels,
                show_borders=show_borders,
                page_margin_left=page_margin_left,
                page_margin_top=page_margin_top,
                page_margin_right=page_margin_right,
                page_margin_bottom=page_margin_bottom
            )
        else:
            print(f"LabelGeneratorFactory: Unknown format type: {format_type}")
            raise ValueError(f"Unknown format type: {format_type}")
        
        # Register content generators
        print("LabelGeneratorFactory: Registering content generators")
        generator.register_content_generator('packet', PacketLabelGenerator())
        generator.register_content_generator('component', ComponentLabelGenerator())
        generator.register_content_generator('location', LocationLabelGenerator())
        
        print(f"LabelGeneratorFactory: Generator created: {type(generator).__name__}")
        return generator
