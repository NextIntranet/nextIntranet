import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nextintranet_backend.settings')

import django
django.setup()

import json
from nextintranet_warehouse.models.component import Component, Supplier, SupplierRelation, Tag
from nextintranet_warehouse.models.category import Category
from nextintranet_warehouse.models.component import Document
from nextintranet_warehouse.models.component import Packet
from nextintranet_warehouse.models.warehouse import Warehouse


def delete_all_components():
    """
    Delete all components from the database.
    """
    print(f"Found {Component.objects.count()} components in the database.")
    
    # Delete all components
    result = Component.objects.all().delete()
    
    print(f"Deleted all components.")
    print(f"Deletion result: {result}")
    
    # You might also want to delete related models
    # Uncomment these if needed:
    # SupplierRelation.objects.all().delete()
    # Tag.objects.all().delete()
    # Document.objects.all().delete()
    # Packet.objects.all().delete()

if __name__ == "__main__":
    delete_all_components()