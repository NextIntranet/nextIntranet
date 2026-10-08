#!/usr/bin/env bash
#
# NextIntranet backup script
# Zálohuje PostgreSQL databázi, RustFS (S3) data a Redis dump.
#
# Použití:
#   ./scripts/backup.sh                    # záloha do ./backups/<timestamp>/
#   ./scripts/backup.sh /cesta/k/adresari  # záloha do zadaného adresáře
#   BACKUP_COMPONENTS="db rustfs" ./scripts/backup.sh  # záloha jen vybraných komponent
#
# Komponenty: db, rustfs, redis (default: všechny; kompatibilní i s "minio")
# Image pro S3 klienta lze přepsat: MC_IMAGE=... (default minio/mc:latest)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${1:-$PROJECT_DIR/backups/$TIMESTAMP}"
COMPONENTS="${BACKUP_COMPONENTS:-db rustfs redis}"

# Načtení proměnných z .env
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
fi

POSTGRES_DB="${POSTGRES_DB:-nextintranet}"
POSTGRES_USER="${POSTGRES_USER:-nextintranet_user}"
MINIO_BUCKET="${MINIO_BUCKET:-nextintranet-dev}"
MC_IMAGE="${MC_IMAGE:-minio/mc:latest}"
RUSTFS_IMAGE="${RUSTFS_IMAGE:-rustfs/rustfs:1.0.0-alpha.89}"

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

# --- RustFS / S3 ---
# Bucket se zrcadlí přes S3 API (mc mirror) do $BACKUP_DIR/minio/ – tento formát
# umí restore.sh nahrát zpět. mc běží v samostatném kontejneru (MC_IMAGE) ve stejné
# síti jako rustfs, služba rustfs_init v compose není potřeba.
if echo "$COMPONENTS" | grep -qwE "rustfs|minio"; then
    echo "[2/3] Záloha RustFS bucketu '$MINIO_BUCKET'..."
    RUSTFS_CONTAINER="$(docker compose -f "$PROJECT_DIR/docker-compose.yml" ps -q rustfs 2>/dev/null || true)"
    RUSTFS_CONTAINER="${RUSTFS_CONTAINER:-rustfs}"
    RUSTFS_NETWORK="$(docker inspect --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$RUSTFS_CONTAINER" 2>/dev/null | awk '{print $1}')"
    RUSTFS_HOST="$(docker inspect --format '{{.Name}}' "$RUSTFS_CONTAINER" 2>/dev/null | sed 's#^/##')"

    MIRROR_OK=0
    if [ -n "$RUSTFS_NETWORK" ] && [ -n "$RUSTFS_HOST" ]; then
        mkdir -p "$BACKUP_DIR/minio"
        if docker run --rm --network "$RUSTFS_NETWORK" \
            --user "$(id -u):$(id -g)" \
            -e MC_CONFIG_DIR=/tmp/.mc \
            -e S3_USER="${MINIO_ROOT_USER:-minioadmin}" \
            -e S3_PASS="${MINIO_ROOT_PASSWORD:-minioadmin}" \
            -v "$BACKUP_DIR/minio:/backup" \
            --entrypoint /bin/sh "$MC_IMAGE" -c "
                mc alias set local http://$RUSTFS_HOST:9000 \"\$S3_USER\" \"\$S3_PASS\" >/dev/null &&
                mc mirror --quiet --overwrite local/$MINIO_BUCKET /backup >/dev/null
            "; then
            MIRROR_OK=1
        fi
    else
        echo "      ⚠ RustFS kontejner neběží"
    fi

    if [ "$MIRROR_OK" -eq 1 ]; then
        echo "      → $BACKUP_DIR/minio/ ($(find "$BACKUP_DIR/minio" -type f | wc -l) souborů, $(du -sh --apparent-size "$BACKUP_DIR/minio" | cut -f1))"
    else
        # Fallback: surová kopie volume (RustFS disk formát, obnovitelný jen
        # nahráním zpět do rustfs_data volume – restore.sh ho automaticky nepoužije)
        echo "      mc mirror selhal, kopíruji RustFS volume přímo..."
        rm -rf "$BACKUP_DIR/minio"
        RUSTFS_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$RUSTFS_CONTAINER" 2>/dev/null || true)"
        RUSTFS_VOLUME="${RUSTFS_VOLUME:-$(docker volume ls -q | grep -E "^$(basename "$PROJECT_DIR")_rustfs_data$" | head -1)}"
        if [ -n "$RUSTFS_VOLUME" ]; then
            docker run --rm --user 0 -v "$RUSTFS_VOLUME":/data:ro -v "$BACKUP_DIR":/backup \
                --entrypoint /bin/sh "$RUSTFS_IMAGE" -c \
                "tar -czf /backup/rustfs_volume.tar.gz -C /data . && chown $(id -u):$(id -g) /backup/rustfs_volume.tar.gz"
            echo "      → $BACKUP_DIR/rustfs_volume.tar.gz ($(du -h "$BACKUP_DIR/rustfs_volume.tar.gz" | cut -f1))"
        else
            echo "      ⚠ RustFS volume nenalezena, přeskočeno"
        fi
    fi
else
    echo "[2/3] RustFS přeskočeno"
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
