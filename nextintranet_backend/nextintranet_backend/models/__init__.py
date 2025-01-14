# from nextintranet_warehouse.models.warehouse import *
# from .component import *
from .user import *
from .userSettings import *

from django.db import models
from django.utils import timezone
import uuid

class NIModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
