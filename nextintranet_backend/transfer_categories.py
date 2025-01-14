import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nextintranet_backend.settings')
import django
django.setup()

import json
import uuid
import hashlib
from nextintranet_warehouse.models.category import Category

def oid_to_uuid4(oid: str) -> uuid.UUID:
    """
    Převod ObjectId na UUID4 pomocí hashování.
    """
    oid_bytes = oid.encode('utf-8')
    hash_bytes = hashlib.sha256(oid_bytes).digest()[:16]
    return uuid.UUID(bytes=hash_bytes)

# Načtení souboru a zpracování po řádcích
with open('documents/category.json', 'r', encoding='utf-8') as file:
    lines = file.readlines()

# Uchování mapy ID pro provázání parent-child
id_map = {"#": None}
data_entries = []

# Načtení dat do paměti
for line in lines:
    try:
        entry = json.loads(line)
        data_entries.append(entry)
    except json.JSONDecodeError as e:
        print(f"Chyba při parsování JSON: {e}")

# Nejprve vytvoření všech kategorií a mapování
for entry in data_entries:
    try:
        oid = entry['_id']['$oid']
        uid = oid_to_uuid4(oid)
        parent_id = entry.get('parent')
        if parent_id and not isinstance(parent_id, str):
            parent_id = parent_id['$oid']

        # Vytvoření kategorie bez ohledu na hierarchii
        category, created = Category.objects.get_or_create(
            id=uid,
            defaults={
                'name': entry['name'],
                'abbreviation': entry['name'].lower(),
                'description': entry.get('description', ''),
                'icon': "{}/{}".format(entry.get('icon_source', ''), entry.get('icon', '')),
                'parent': None,  # Rodič se přidá později
            }
        )
        id_map[entry['_id']['$oid']] = category

        if created:
            print(f"Vytvořena kategorie: {category.name}")
        else:
            print(f"Kategorie již existuje: {category.name}")
    except Exception as e:
        print(f"Chyba při vytváření kategorie: {e}")

# Nastavení hierarchie kategorií
for entry in data_entries:
    try:
        category = id_map[entry['_id']['$oid']]
        parent_id = entry.get('parent')
        if parent_id and not isinstance(parent_id, str):
            parent_id = parent_id['$oid']
        parent = id_map.get(parent_id)

        if parent:
            category.parent = parent
            category.save()
            print(f"Nastaven rodič {parent.name} pro kategorii {category.name}")
    except Exception as e:
        print(f"Chyba při nastavování rodiče kategorie: {e}")
print("Import kategorií dokončen.")
