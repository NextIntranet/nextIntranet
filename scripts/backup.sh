#!/usr/bin/env bash
#
# NextIntranet backup script
# Zálohuje PostgreSQL databázi, MinIO (S3) data a Redis dump.
#
# Použití:
#   ./scripts/backup.sh                    # záloha do ./backups/<timestamp>/
#   ./scripts/backup.sh /cesta/k/adresari  # záloha do zadaného adresáře
#   BACKUP_COMPONENTS="db minio" ./scripts/backup.sh  # záloha jen vybraných komponent
#
# Komponenty: db, minio, redis (default: všechny)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${1:-$PROJECT_DIR/backups/$TIMESTAMP}"
COMPONENTS="${BACKUP_COMPONENTS:-db minio redis}"

# Načtení proměnných z .env
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
fi

POSTGRES_DB="${POSTGRES_DB:-nextintranet}"
POSTGRES_USER="${POSTGRES_USER:-nextintranet_user}"
MINIO_BUCKET="${MINIO_BUCKET:-nextintranet-dev}"

mkdir -p "$BACKUP_DIR"

echo "=== NextIntranet backup ==="
echo "Čas:      $TIMESTAMP"
echo "Cíl:      $BACKUP_DIR"
echo "Komponenty: $COMPONENTS"
echo ""

# --- PostgreSQL ---
if echo "$COMPONENTS" | grep -qw "db"; then
    echo "[1/3] Záloha PostgreSQL databáze '$POSTGRES_DB'..."
    docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T db_nextintranet \
        pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9 \
        > "$BACKUP_DIR/db.dump"
    echo "      → $BACKUP_DIR/db.dump ($(du -h "$BACKUP_DIR/db.dump" | cut -f1))"
else
    echo "[1/3] PostgreSQL přeskočeno"
fi

# --- MinIO / S3 ---
if echo "$COMPONENTS" | grep -qw "minio"; then
    echo "[2/3] Záloha MinIO bucketu '$MINIO_BUCKET'..."
    docker compose -f "$PROJECT_DIR/docker-compose.yml" run --rm --entrypoint "" minio_init \
        /bin/sh -c "
            /usr/bin/mc alias set local http://minio:9000 \${MINIO_ROOT_USER:-minioadmin} \${MINIO_ROOT_PASSWORD:-minioadmin} &&
            /usr/bin/mc mirror --quiet local/$MINIO_BUCKET /backup
        " --volume "$BACKUP_DIR/minio:/backup"
    # Fallback: pokud mc mirror selže, zkusíme přímou kopii volume
    if [ $? -ne 0 ] || [ ! -d "$BACKUP_DIR/minio" ] || [ -z "$(ls -A "$BACKUP_DIR/minio" 2>/dev/null)" ]; then
        echo "      mc mirror nedostupný, kopíruji volume přímo..."
        if [ -d "$PROJECT_DIR/.data/minio" ]; then
            tar -czf "$BACKUP_DIR/minio.tar.gz" -C "$PROJECT_DIR/.data" minio
            echo "      → $BACKUP_DIR/minio.tar.gz ($(du -h "$BACKUP_DIR/minio.tar.gz" | cut -f1))"
        else
            echo "      ⚠ MinIO data adresář neexistuje, přeskočeno"
        fi
    else
        echo "      → $BACKUP_DIR/minio/"
    fi
else
    echo "[2/3] MinIO přeskočeno"
fi

# --- Redis ---
if echo "$COMPONENTS" | grep -qw "redis"; then
    echo "[3/3] Záloha Redis..."
    docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T redis redis-cli BGSAVE > /dev/null 2>&1 || true
    sleep 2
    REDIS_CONTAINER=$(docker compose -f "$PROJECT_DIR/docker-compose.yml" ps -q redis)
    if [ -n "$REDIS_CONTAINER" ]; then
        docker cp "$REDIS_CONTAINER:/data/dump.rdb" "$BACKUP_DIR/redis.rdb" 2>/dev/null
        if [ -f "$BACKUP_DIR/redis.rdb" ]; then
            echo "      → $BACKUP_DIR/redis.rdb ($(du -h "$BACKUP_DIR/redis.rdb" | cut -f1))"
        else
            echo "      ⚠ Redis dump nenalezen v kontejneru, přeskočeno"
        fi
    else
        echo "      ⚠ Redis kontejner neběží, přeskočeno"
    fi
else
    echo "[3/3] Redis přeskočeno"
fi

echo ""
echo "=== Záloha dokončena ==="
echo "Celková velikost: $(du -sh "$BACKUP_DIR" | cut -f1)"
echo "Adresář: $BACKUP_DIR"
