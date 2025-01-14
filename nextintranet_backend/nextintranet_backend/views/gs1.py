import re

def is_valid_gs1(code):
    """
    Validates if the given code is a valid GS1 code.
    
    GS1 codes are typically 8, 12, 13, or 14 digits long.
    """
    if not isinstance(code, str):
        return False
    
    # GS1 codes must be numeric and have a length of 8, 12, 13, or 14
    if not re.match(r'^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$', code):
        return False
    
    return True

# Example usage
print(is_valid_gs1("12345678"))  # True
print(is_valid_gs1("123456789012"))  # True
print(is_valid_gs1("1234567890123"))  # True
print(is_valid_gs1("12345678901234"))  # True
print(is_valid_gs1("1234567"))  # False
print(is_valid_gs1("123456789012345"))  # False