import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nextintranet_backend.settings')
import django
django.setup()

import json
import uuid
import hashlib
from nextintranet_warehouse.models.warehouse import Warehouse

def oid_to_uuid4(oid: str) -> uuid.UUID:
    """
    Převod ObjectId na UUID4 pomocí hashování.
    """
    oid_bytes = oid.encode('utf-8')
    hash_bytes = hashlib.sha256(oid_bytes).digest()[:16]
    return uuid.UUID(bytes=hash_bytes)

# Načtení souboru a zpracování po řádcích
with open('documents/store_positions.json', 'r', encoding='utf-8') as file:
    lines = file.readlines()

# Uchování mapy ID pro provázání parent-child
id_map = {"#": None}
warehouse_map = {}
data_entries = []

# Načtení dat do paměti
for line in lines:
    try:
        entry = json.loads(line)
        data_entries.append(entry)
    except json.JSONDecodeError as e:
        print(f"Chyba při parsování JSON: {e}")

# Nejprve vytvoření hlavních skladů
for entry in data_entries:
    warehouse_id = entry.get('warehouse', {}).get('$oid')
    if warehouse_id:
        if warehouse_id not in warehouse_map:
            warehouse_name = f"Warehouse {len(warehouse_map) + 1}"
            uid = oid_to_uuid4(warehouse_id)
            warehouse, _ = Warehouse.objects.get_or_create(
                name=warehouse_name,
                defaults={
                    'id': uid,
                    'uuid': uid,
                    'location': warehouse_id,
                    'description': f"Automaticky vytvořený sklad {warehouse_name}",
                    'parent_id': None,
                    'can_store_items': False
                }
            )
            warehouse_map[warehouse_id] = uid
            id_map[warehouse_id] = uid  # Mapování pro nadřazené sklady
            print(f"Vytvořen hlavní sklad: {warehouse_name}")

# Vytvoření všech podřízených skladů
for entry in data_entries:
    parent_uuid = None

    # Zpracování nadřazeného skladu
    parent_id = entry.get('parent')
    if parent_id and not isinstance(parent_id, str):
        parent_id = parent_id['$oid']
    if parent_id == "#":
        warehouse_id = entry.get('warehouse', {}).get('$oid')
        parent_uuid = warehouse_map.get(warehouse_id)
    elif parent_id:
        parent_uuid = id_map.get(parent_id)
        if not parent_uuid:
            print(f"Chyba: Nenalezen parent ID: {parent_id}")

    # Vytvoření nebo získání podřízeného skladu
    uid = oid_to_uuid4(entry['_id']['$oid'])
    warehouse, created = Warehouse.objects.get_or_create(
        name=entry['name'],
        defaults={
            'id': uid,
            'uuid': uid,
            'location': entry.get('warehouse', {}).get('$oid', ''),
            'description': entry.get('text', ''),
            'parent_id': parent_uuid,
            'can_store_items': True  # Defaultní nastavení
        }
    )

    # Uložení ID do mapy
    id_map[entry['_id']['$oid']] = uid

    if created:
        print(f"Vytvořen sklad: {warehouse.name}")
    else:
        print(f"Sklad již existuje: {warehouse.name}")

print("Import dokončen.")
