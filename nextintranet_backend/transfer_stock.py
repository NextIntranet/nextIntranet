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

def oid_to_uuid4(oid: str):
    """Deterministický převod ObjectId na UUID."""
    import hashlib, uuid
    oid_bytes = oid.encode('utf-8')
    hash_bytes = hashlib.sha256(oid_bytes).digest()[:16]
    return uuid.UUID(bytes=hash_bytes)

# Načtení JSON souboru
with open('documents/stock.json', 'r', encoding='utf-8') as file:
    lines = file.readlines()

# Iterace přes záznamy a import dat
print(">>")
for line in lines:
    try:
        entry = json.loads(line)
        print(entry)

        # Najděte nebo vytvořte kategorii
        category_id = entry.get('category', [{}])[0].get('$oid')
        category = None
        if category_id:
            category = Category.objects.filter(id=oid_to_uuid4(category_id)).first()

        # Vytvoření nebo aktualizace komponenty
        component, created = Component.objects.get_or_create(
            name=entry['name'],
            defaults={
                'description': entry.get('description', ''),
                'category': category,
                'unit_type': 'float',  # Většinou kvůli cenám
                'internal_price': entry.get('price', {}).get('$numberDouble'),
            }
        )

        if created:
            print(f"Vytvořena komponenta: {component.name}")
        else:
            print(f"Aktualizována komponenta: {component.name}")

        # Dodavatelé
        for supplier_entry in entry.get('supplier', []):
            supplier, _ = Supplier.objects.get_or_create(
                name=supplier_entry['supplier']
            )

            SupplierRelation.objects.get_or_create(
                component=component,
                supplier=supplier,
                defaults={
                    'symbol': supplier_entry.get('symbol', '')
                }
            )

        # Propojení kategorií a dalších atributů
        if 'tags' in entry:
            for tag in entry['tags']:
                tag_obj, _ = Tag.objects.get_or_create(name=tag['id'])
                component.tags.add(tag_obj)

        # Zpracování primary image
        img_title = entry.get('img_title', {}).get('url')
        if img_title:
            document, _ = Document.objects.get_or_create(
                url=img_title,
                defaults={
                    'name': f"Primary image for {component.name}",
                    'doc_type': 'image',
                }
            )
            component.primary_image = document
            component.save()
            print(f"Nastaven primary_image pro komponentu {component.name}")

        # Vytvoření packetů
        for packet_entry in entry.get('packets', []):
            location_id = packet_entry.get('position', {}).get('$oid')
            location = None
            print("PAcket entry", packet_entry)
            print("Location ID", location_id)
            if location_id:
                location = Warehouse.objects.filter(id=oid_to_uuid4(location_id)).first()

            if location and component:


                Packet.objects.get_or_create(
                    component=component,
                    location=location,
                    defaults={
                        'description': packet_entry.get('description', ''),
                    }
                )

    except Exception as e:
        print(f"Chyba při parsování JSON: {e}")

print("Import dokončen.")
