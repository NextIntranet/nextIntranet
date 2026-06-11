#!/usr/bin/env bash
#
# NextIntranet update script
# Stáhne nejnovější změny z gitu a případně přebuduje Docker obrazy.
#
# Použití:
#   ./scripts/update.sh            # automatická detekce potřeby rebuild
#   ./scripts/update.sh --rebuild  # vynucený rebuild bez ohledu na změny
#   ./scripts/update.sh --restart  # pouze restart, bez pull ani rebuild
#   ./scripts/update.sh --migrate  # po update spustit migrace (plán + apply)
#   ./scripts/update.sh --no-migrate  # migrace přeskočit
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_DIR="$(cd "$PROJECT_DIR/.." && pwd)"

FORCE_REBUILD=false
ONLY_RESTART=false
RUN_MIGRATIONS=""
CHANGED_FILES=""

for arg in "$@"; do
    case "$arg" in
        --rebuild) FORCE_REBUILD=true ;;
        --restart) ONLY_RESTART=true ;;
        --migrate) RUN_MIGRATIONS=true ;;
        --no-migrate) RUN_MIGRATIONS=false ;;
    esac
done

# Zkrácený alias pro docker compose příkaz
DC="docker compose -f $COMPOSE_DIR/dev/docker-compose.yml -f $COMPOSE_DIR/docker-compose.dev.yml --env-file $COMPOSE_DIR/.env"

run_manage() {
    $DC run --rm --entrypoint "" web python manage.py "$@"
}

maybe_run_migrations() {
    if [ "$RUN_MIGRATIONS" = false ]; then
        echo "      Migrace přeskočeny (--no-migrate)."
        return 0
    fi

    if [ -n "$CHANGED_FILES" ] && echo "$CHANGED_FILES" | grep -qE 'migrations/'; then
        echo "      V pullu jsou nové migrační soubory:"
        echo "$CHANGED_FILES" | grep -E 'migrations/' | sed 's/^/        /'
    fi

    if [ "$RUN_MIGRATIONS" != true ]; then
        if [ ! -t 0 ]; then
            echo "      Netypový terminál — migrace přeskočeny."
            echo "      Ručně: $DC run --rm --entrypoint \"\" web python manage.py migrate"
            return 0
        fi

        echo ""
        read -r -p "Spustit databázové migrace? [y/N] " answer
        case "${answer,,}" in
            y|yes) ;;
            *) echo "      Migrace přeskočeny."; return 0 ;;
        esac
    fi

    echo ""
    echo "      Plán migrací (dry run):"
    if ! run_manage migrate --plan; then
        echo "      Chyba při načítání plánu migrací." >&2
        return 1
    fi

    echo ""
    if [ "$RUN_MIGRATIONS" = true ]; then
        echo "      Aplikuji migrace (--migrate)..."
    elif [ -t 0 ]; then
        read -r -p "Aplikovat migrace? [y/N] " apply_answer
        case "${apply_answer,,}" in
            y|yes) ;;
            *) echo "      Migrace nebyly aplikovány."; return 0 ;;
        esac
    fi

    echo "      Spouštím migrate..."
    run_manage migrate
    echo "      Migrace dokončeny."
}

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
    echo "[1/2] Restart kontejnerů..."
    $DC restart
    echo ""
    echo "[2/2] Migrace..."
    maybe_run_migrations
    echo ""
    echo "=== Restart dokončen ==="
    exit 0
fi

# --- Git pull ---
echo "[1/4] Stahování změn z gitu..."
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
echo "[2/4] Kontrola potřeby přebudování obrazů..."

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
echo "[3/4] Aktualizace Docker kontejnerů..."

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
echo "[4/4] Migrace..."
maybe_run_migrations

echo ""
echo "=== Aktualizace dokončena ==="
$DC ps
