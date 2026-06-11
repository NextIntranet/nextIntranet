#!/usr/bin/env bash
#
# NextIntranet update script
# Stáhne nejnovější změny z gitu a případně přebuduje Docker obrazy.
#
# Použití:
#   ./scripts/update.sh            # automatická detekce potřeby rebuild
#   ./scripts/update.sh --rebuild  # vynucený rebuild bez ohledu na změny
#   ./scripts/update.sh --restart  # pouze restart, bez pull ani rebuild
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_DIR="$(cd "$PROJECT_DIR/.." && pwd)"

FORCE_REBUILD=false
ONLY_RESTART=false

for arg in "$@"; do
    case "$arg" in
        --rebuild) FORCE_REBUILD=true ;;
        --restart) ONLY_RESTART=true ;;
    esac
done

# Zkrácený alias pro docker compose příkaz
DC="docker compose -f $COMPOSE_DIR/dev/docker-compose.yml -f $COMPOSE_DIR/docker-compose.dev.yml --env-file $COMPOSE_DIR/.env"

# Soubory, jejichž změna vyžaduje přebudování obrazů
BUILD_TRIGGERS=(
    "nextintranet_backend/Dockerfile"
    "nextintranet_backend/requirements.txt"
    "nextintranet_backend/requirements"
    "nextintranet_frontend/Dockerfile"
    "nextintranet_frontend/package.json"
    "nextintranet_frontend/pnpm-lock.yaml"
    "nextintranet_frontend/packages/"
    "docker-compose.yml"
)

echo "=== NextIntranet update ==="
echo "Repozitář: $PROJECT_DIR"
echo "Compose:   $COMPOSE_DIR"
echo ""

# --- Pouze restart ---
if $ONLY_RESTART; then
    echo "[1/1] Restart kontejnerů..."
    $DC restart
    echo ""
    echo "=== Restart dokončen ==="
    exit 0
fi

# --- Git pull ---
echo "[1/3] Stahování změn z gitu..."
cd "$PROJECT_DIR"

BEFORE_HASH="$(git rev-parse HEAD)"
git pull
git submodule update --init --recursive
AFTER_HASH="$(git rev-parse HEAD)"

if [ "$BEFORE_HASH" = "$AFTER_HASH" ]; then
    echo "      Žádné nové změny."
    CHANGED_FILES=""
else
    CHANGED_FILES="$(git diff --name-only "$BEFORE_HASH" "$AFTER_HASH")"
    echo "      Aktualizováno: $(git --no-pager log --oneline "$BEFORE_HASH..$AFTER_HASH" | wc -l | tr -d ' ') nových commitů"
fi

# --- Detekce potřeby rebuildu ---
echo ""
echo "[2/3] Kontrola potřeby přebudování obrazů..."

NEEDS_REBUILD=false

if $FORCE_REBUILD; then
    echo "      Vynucený rebuild (--rebuild)."
    NEEDS_REBUILD=true
elif [ -z "$CHANGED_FILES" ]; then
    echo "      Žádné změny, rebuild není potřeba."
else
    for pattern in "${BUILD_TRIGGERS[@]}"; do
        if echo "$CHANGED_FILES" | grep -q "$pattern"; then
            echo "      Zjištěna změna v: $(echo "$CHANGED_FILES" | grep "$pattern")"
            NEEDS_REBUILD=true
            break
        fi
    done
    if ! $NEEDS_REBUILD; then
        echo "      Změny nevyžadují rebuild obrazů."
    fi
fi

# --- Docker build / up ---
echo ""
echo "[3/3] Aktualizace Docker kontejnerů..."

if $NEEDS_REBUILD; then
    echo "      Sestavuji obrazy..."
    $DC build
    echo "      Spouštím kontejnery..."
    $DC up -d
else
    echo "      Restartuji kontejnery (bez rebuildu)..."
    $DC up -d
fi

echo "      Restartuji nginx (obnova DNS rozlišení)..."
$DC restart nginx

echo ""
echo "=== Aktualizace dokončena ==="
$DC ps
