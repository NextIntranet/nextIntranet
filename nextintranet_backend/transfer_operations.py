import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nextintranet_backend.settings')
import django
django.setup()

import json
import uuid
import hashlib
from nextintranet_warehouse.models.category import Category
from nextintranet_warehouse.models.component import StockOperation

from nextintranet_backend.models.user import User

import datetime



def oid_to_uuid4(oid: str) -> uuid.UUID:
    """
    Převod ObjectId na UUID4 pomocí hashování.
    """
    oid_bytes = oid.encode('utf-8')
    hash_bytes = hashlib.sha256(oid_bytes).digest()[:16]
    return uuid.UUID(bytes=hash_bytes)

# Načtení souboru a zpracování po řádcích
with open('documents/stock_operation.json', 'r', encoding='utf-8') as file:
    lines = file.readlines()

# Uchování mapy ID pro provázání parent-child
id_map = {"#": None}
data_entries = []
errors = []

# Načtení dat do paměti
for line in lines:
    try:
        entry = json.loads(line)
        data_entries.append(entry)
    except json.JSONDecodeError as e:
        print(f"Chyba při parsování JSON: {e}")

# Nejprve vytvoření všech kategorií a mapování
for entry in data_entries:
    print("  =========================  ")
    print("  =========================  \n")
    print(entry)

    try:
        id = oid_to_uuid4(entry['_id']['$oid'])
        pid = oid_to_uuid4(entry['pid']['$oid'])
        count = float(entry['count']['$numberDouble'])
        unit_price = entry['unit_price'].get('$numberInt', None)
        if not unit_price:
            unit_price = entry['unit_price'].get('$numberDouble', None)
        unit_price = float(unit_price)
        type = entry['type']
        timestamp_ms = float(entry['date']['$date']['$numberLong'])
        date = datetime.datetime.fromtimestamp(timestamp_ms/1000.0, tz=datetime.timezone.utc)
        date2 = datetime.datetime.fromtimestamp(timestamp_ms/1000.0, tz=datetime.timezone.utc)
        user = entry['user']
        description = entry['description']

        author = User.objects.filter(username=user).first()

        
        # Vytvoření operace
        # print(date)
        operation = StockOperation.objects.create(
            id=id,
            created_at=date,
            timestamp=date,
            packet_id=pid,
            operation_type = type,
            quantity = count,
            relative_quantity = True,
            unit_price = unit_price,
            previous_operation = None,
            author = author,
            description = f'{description}, autor: {user}'
        )
        
        # Explicitly update timestamp to ensure it's set to the correct date
        operation.timestamp = date
        operation.created_at = date
        operation.save()

        print(date)
        
    except Exception as e:
        print("Chyba..", e)
        errors.append((e))
    
# Po zpracování všech operací nastavíme previous_operation
print("Nastavování previous_operation...")

# Uspořádáme operace podle timestamp
operations = StockOperation.objects.all().order_by('timestamp')

# Pro každý packet seřadíme operace chronologicky a nastavíme provázání
packet_operations = {}

# Seskupení operací podle packet_id
for op in operations:
    if op.packet_id not in packet_operations:
        packet_operations[op.packet_id] = []
    packet_operations[op.packet_id].append(op)

# Nastavení previous_operation pro každý packet
for packet_id, ops in packet_operations.items():
    # Seřazení operací podle času (pro jistotu)
    sorted_ops = sorted(ops, key=lambda x: x.timestamp)
    print(sorted_ops)
    
    previous_op = None
    for op in sorted_ops:
        op.previous_operation = previous_op
        op.save()
        previous_op = op
    
    print(f"Nastaveny operace pro packet {packet_id}: {len(sorted_ops)} operací")

print(errors)
