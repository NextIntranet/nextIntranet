import os
import uuid
from datetime import date


def upload_key(module: str, filename: str) -> str:
    """S3 object key `uploads/<module>/<yyyy>/<mm>/<uuid>.<ext>` for a newly uploaded file."""
    ext = os.path.splitext(filename or "")[1].lower() or ".bin"
    return f"uploads/{module}/{date.today():%Y/%m}/{uuid.uuid4()}{ext}"
