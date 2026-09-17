#!/usr/bin/env bash
#
# NextIntranet one-time migration: MinIO -> RustFS
#
# Kopíruje objekty přes S3 API (mc mirror) ze starého MinIO do nového RustFS.
# Formát dat na disku MinIO a RustFS se liší, takže se přenos dělá na úrovni
# S3 – z pohledu aplikace (S3 klienti, Django/boto3) je RustFS bezešvá náhrada:
# stejný bucket, stejné credentials, stejná veřejná schémata.
#
# Předpoklady:
#   - docker-compose.yml má služby rustfs a rustfs_init (nový stack)
#   - stará MinIO data jsou v $MINIO_LEGACY_DATA_DIR (default ./.data/minio)
#
# Použití:
#   ./scripts/migrate_minio_to_rustfs.sh
#   MINIO_LEGACY_DATA_DIR=/cesta/k/minio ./scripts/migrate_minio_to_rustfs.sh
#   BACKUP... (credentials se berou z .env: MINIO_ROOT_USER/PASSWORD, MINIO_BUCKET)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Načtení proměnných z .env
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
fi

MINIO_LEGACY_DATA_DIR="${MINIO_LEGACY_DATA_DIR:-$PROJECT_DIR/.data/minio}"
LEGACY_CONTAINER="nextintranet-migration-minio"
MINIO_BUCKET="${MINIO_BUCKET:-nextintranet-dev}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"

if [ ! -d "$MINIO_LEGACY_DATA_DIR" ]; then
    echo "Chyba: adresář se starými MinIO daty '$MINIO_LEGACY_DATA_DIR' neexistuje." >&2
    echo "Nastavte MINIO_LEGACY_DATA_DIR na cestu s původními MinIO daty." >&2
    exit 1
fi

# Síť vezmeme přímo z běžícího rustfs kontejneru (ještě jich může existovat víc s podobným jménem)
NETWORK="$(docker inspect --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' rustfs 2>/dev/null)"
if [ -z "$NETWORK" ]; then
    echo "Chyba: kontejner rustfs neběží / není na žádné síti. Spusťte 'docker compose up -d'." >&2
    exit 1
fi

echo "=== MinIO -> RustFS migrace ==="
echo "Zdroj (MinIO data):  $MINIO_LEGACY_DATA_DIR"
echo "Cíl (RustFS):        http://rustfs:9000"
echo "Bucket:              $MINIO_BUCKET"
echo ""

# 1) Cíl musí běžet (rustfs + vytvoření bucketu a anonymního přístupu)
echo "[1/4] Zajištění běžícího RustFS..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" up -d rustfs rustfs_init >/dev/null

# 2) Dočasné MinIO s původními daty
echo "[2/4] Spuštění dočasného MinIO s původními daty..."
docker rm -f "$LEGACY_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$LEGACY_CONTAINER" --network "$NETWORK" \
    -v "$MINIO_LEGACY_DATA_DIR:/data" \
    -e MINIO_ROOT_USER="$MINIO_ROOT_USER" \
    -e MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
    minio/minio:latest server /data --console-address ":9001" >/dev/null

cleanup() {
    echo ""
    echo "[cleanup] Zastavuji dočasné MinIO..."
    docker rm -f "$LEGACY_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 3) Počkat na dostupnost zdroje i cíle a zrcadlit bucket
echo "[3/4] Čekání na MinIO a RustFS..."
docker run --rm --network "$NETWORK" --entrypoint /bin/sh minio/mc:latest \
    -c "
        until /usr/bin/mc alias set legacy http://$LEGACY_CONTAINER:9000 \"$MINIO_ROOT_USER\" \"$MINIO_ROOT_PASSWORD\" >/dev/null 2>&1; do
            echo '  čekám na legacy MinIO...'; sleep 1;
        done
        /usr/bin/mc alias set target http://rustfs:9000 \"$MINIO_ROOT_USER\" \"$MINIO_ROOT_PASSWORD\" >/dev/null
        echo '  legacy MinIO připraven, bucket: '\$(/usr/bin/mc ls legacy/$MINIO_BUCKET 2>/dev/null | wc -l)' objektů'
    "

echo "[4/4] Kopírování objektů (mc mirror) legacy MinIO -> RustFS..."
docker run --rm --network "$NETWORK" --entrypoint /bin/sh minio/mc:latest \
    -c "
        /usr/bin/mc alias set legacy http://$LEGACY_CONTAINER:9000 \"$MINIO_ROOT_USER\" \"$MINIO_ROOT_PASSWORD\" >/dev/null
        /usr/bin/mc alias set target http://rustfs:9000 \"$MINIO_ROOT_USER\" \"$MINIO_ROOT_PASSWORD\" >/dev/null
        /usr/bin/mc mb --ignore-existing target/$MINIO_BUCKET >/dev/null 2>&1
        /usr/bin/mc mirror --overwrite --quiet legacy/$MINIO_BUCKET target/$MINIO_BUCKET
    "

echo ""
echo "=== Shrnutí ==="
echo "Objekty v legacy MinIO:"
docker run --rm --network "$NETWORK" --entrypoint /bin/sh minio/mc:latest \
    -c "/usr/bin/mc alias set legacy http://$LEGACY_CONTAINER:9000 \"$MINIO_ROOT_USER\" \"$MINIO_ROOT_PASSWORD\" >/dev/null && /usr/bin/mc ls --recursive legacy/$MINIO_BUCKET" 2>/dev/null || echo "  (žádné)"
echo "Objekty v RustFS:"
docker run --rm --network "$NETWORK" --entrypoint /bin/sh minio/mc:latest \
    -c "/usr/bin/mc alias set target http://rustfs:9000 \"$MINIO_ROOT_USER\" \"$MINIO_ROOT_PASSWORD\" >/dev/null && /usr/bin/mc ls --recursive target/$MINIO_BUCKET" 2>/dev/null || echo "  (žádné)"
echo ""
echo "Migrace dokončena. Dočasné MinIO se uklidí automaticky."
echo "Stará data v '$MINIO_LEGACY_DATA_DIR' zůstávají zachována (archiv)."
