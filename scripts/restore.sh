#!/usr/bin/env bash
#
# NextIntranet restore script
# Obnoví PostgreSQL databázi, MinIO (S3) data a Redis dump ze zálohy.
#
# Použití:
#   ./scripts/restore.sh ./backups/20260520_130000      # obnoví vše ze zálohy
#   RESTORE_COMPONENTS="db" ./scripts/restore.sh ./backups/20260520_130000  # jen DB
#
# Komponenty: db, minio, redis (default: všechny nalezené v záloze)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -z "${1:-}" ]; then
    echo "Použití: $0 <cesta_k_záloze>"
    echo ""
    echo "Dostupné zálohy:"
    if [ -d "$PROJECT_DIR/backups" ]; then
        ls -1d "$PROJECT_DIR/backups"/*/ 2>/dev/null | while read -r dir; do
            name="$(basename "$dir")"
            size="$(du -sh "$dir" | cut -f1)"
            echo "  $name  ($size)"
        done
    else
        echo "  (žádné)"
    fi
    exit 1
fi

BACKUP_DIR="$1"

if [ ! -d "$BACKUP_DIR" ]; then
    echo "Chyba: adresář '$BACKUP_DIR' neexistuje"
    exit 1
fi

# Načtení proměnných z .env
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
fi

POSTGRES_DB="${POSTGRES_DB:-nextintranet}"
POSTGRES_USER="${POSTGRES_USER:-nextintranet_user}"
MINIO_BUCKET="${MINIO_BUCKET:-nextintranet-dev}"

# Autodetekce komponent v záloze
AUTO_COMPONENTS=""
[ -f "$BACKUP_DIR/db.dump" ] && AUTO_COMPONENTS="$AUTO_COMPONENTS db"
[ -d "$BACKUP_DIR/minio" ] || [ -f "$BACKUP_DIR/minio.tar.gz" ] && AUTO_COMPONENTS="$AUTO_COMPONENTS minio"
[ -f "$BACKUP_DIR/redis.rdb" ] && AUTO_COMPONENTS="$AUTO_COMPONENTS redis"
COMPONENTS="${RESTORE_COMPONENTS:-$AUTO_COMPONENTS}"

echo "=== NextIntranet restore ==="
echo "Zdroj:      $BACKUP_DIR"
echo "Komponenty: $COMPONENTS"
echo ""

read -rp "VAROVÁNÍ: Tato operace přepíše aktuální data. Pokračovat? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Zrušeno."
    exit 0
fi

# --- PostgreSQL ---
if echo "$COMPONENTS" | grep -qw "db"; then
    if [ ! -f "$BACKUP_DIR/db.dump" ]; then
        echo "[1/3] ⚠ db.dump nenalezen, přeskočeno"
    else
        echo "[1/3] Obnova PostgreSQL databáze '$POSTGRES_DB'..."

        # Ukončení aktivních spojení a drop/recreate databáze
        docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T db_nextintranet \
            psql -U "$POSTGRES_USER" -d postgres -c "
                SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();
            " > /dev/null 2>&1 || true

        docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T db_nextintranet \
            psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";" > /dev/null

        docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T db_nextintranet \
            psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";" > /dev/null

        docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T db_nextintranet \
            pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl \
            < "$BACKUP_DIR/db.dump"

        echo "      ✓ Databáze obnovena"
    fi
else
    echo "[1/3] PostgreSQL přeskočeno"
fi

# --- MinIO / S3 ---
if echo "$COMPONENTS" | grep -qw "minio"; then
    if [ -d "$BACKUP_DIR/minio" ]; then
        echo "[2/3] Obnova MinIO bucketu '$MINIO_BUCKET' (mc mirror)..."
        docker compose -f "$PROJECT_DIR/docker-compose.yml" run --rm --entrypoint "" minio_init \
            /bin/sh -c "
                /usr/bin/mc alias set local http://minio:9000 \${MINIO_ROOT_USER:-minioadmin} \${MINIO_ROOT_PASSWORD:-minioadmin} &&
                /usr/bin/mc mb --ignore-existing local/$MINIO_BUCKET &&
                /usr/bin/mc mirror --overwrite --quiet /backup local/$MINIO_BUCKET
            " --volume "$BACKUP_DIR/minio:/backup"
        echo "      ✓ MinIO bucket obnoven"
    elif [ -f "$BACKUP_DIR/minio.tar.gz" ]; then
        echo "[2/3] Obnova MinIO z tar archivu..."
        # Zastavíme MinIO, rozbalíme, spustíme
        docker compose -f "$PROJECT_DIR/docker-compose.yml" stop minio
        tar -xzf "$BACKUP_DIR/minio.tar.gz" -C "$PROJECT_DIR/.data/"
        docker compose -f "$PROJECT_DIR/docker-compose.yml" start minio
        echo "      ✓ MinIO data obnovena"
    else
        echo "[2/3] ⚠ MinIO záloha nenalezena, přeskočeno"
    fi
else
    echo "[2/3] MinIO přeskočeno"
fi

# --- Redis ---
if echo "$COMPONENTS" | grep -qw "redis"; then
    if [ ! -f "$BACKUP_DIR/redis.rdb" ]; then
        echo "[3/3] ⚠ redis.rdb nenalezen, přeskočeno"
    else
        echo "[3/3] Obnova Redis..."
        docker compose -f "$PROJECT_DIR/docker-compose.yml" stop redis
        cp "$BACKUP_DIR/redis.rdb" "$PROJECT_DIR/.data/redis/dump.rdb"
        docker compose -f "$PROJECT_DIR/docker-compose.yml" start redis
        echo "      ✓ Redis obnoven"
    fi
else
    echo "[3/3] Redis přeskočeno"
fi

echo ""
echo "=== Obnova dokončena ==="
echo ""
echo "Doporučení: restartujte služby pro jistotu:"
echo "  docker compose restart web web_asgi worker"
