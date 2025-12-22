from django import template
from django.utils.safestring import mark_safe

register = template.Library()

@register.filter
def format_uuid(value):
    """Formátuje UUID tak, že první část je tučná a zbytek šedý a menší."""
    print("pouziva se formatter... ", value)
    value = str(value)
    if not isinstance(value, str) or "-" not in value:
        print("Preskakuje se formatter... ", value, type(value))
        return value
    
    first_part, rest = value.split("-", 1)  # Rozdělení UUID podle první pomlčky
    # Then in your filter:
    return mark_safe(f'<strong>{first_part}</strong>-<span style="color: gray; font-size: 0.85em;">{rest}</span>')

format_uuid.is_safe = True