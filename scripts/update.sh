#!/usr/bin/env bash
#
# NextIntranet update script (nasazení z GHCR image)
# Stáhne aktuální image z GHCR a restartuje kontejnery bez lokálního buildu.
#
# Použití:
#   ./scripts/update.sh              # git pull + docker compose pull + up -d + migrace
#   ./scripts/update.sh --restart    # pouze restart kontejnerů (bez pull)
#   ./scripts/update.sh --migrate    # po update spustit migrace (plán + apply)
#   ./scripts/update.sh --no-migrate # migrace přeskočit
#
# Pozn.: Pro build z lokálních zdrojů použij ./scripts/update_with_build.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_DIR="$(cd "$PROJECT_DIR/.." && pwd)"

ONLY_RESTART=false
RUN_MIGRATIONS=""
CHANGED_FILES=""

for arg in "$@"; do
    case "$arg" in
        --restart) ONLY_RESTART=true ;;
        --migrate) RUN_MIGRATIONS=true ;;
        --no-migrate) RUN_MIGRATIONS=false ;;
    esac
done

# Zkrácený alias pro docker compose příkaz
# Dvě podporovaná rozložení:
#  1) dev:  <COMPOSE_DIR>/dev/docker-compose.yml + <COMPOSE_DIR>/docker-compose.dev.yml + <COMPOSE_DIR>/.env
#     (repozitář je podadresář nadřazeného adresáře)
#  2) stack přímo v repozitáři (např. /data/nextintranet): docker-compose.yml,
#     docker-compose.override.yml a .env leží v PROJECT_DIR
if [ -f "$COMPOSE_DIR/dev/docker-compose.yml" ]; then
    DC="docker compose -f $COMPOSE_DIR/dev/docker-compose.yml -f $COMPOSE_DIR/docker-compose.dev.yml --env-file $COMPOSE_DIR/.env"
elif [ -f "$PROJECT_DIR/docker-compose.yml" ]; then
    COMPOSE_DIR="$PROJECT_DIR"
    DC="docker compose --project-directory $PROJECT_DIR"
else
    echo "Nenalezen docker-compose.yml ani v $COMPOSE_DIR/dev, ani v $PROJECT_DIR." >&2
    exit 1
fi

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

echo "=== NextIntranet update (GHCR image) ==="
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

# --- Git pull (aktualizace compose souborů a konfigurace) ---
echo "[1/4] Stahování změn z gitu..."
cd "$PROJECT_DIR"

BEFORE_HASH="$(git rev-parse HEAD)"
git pull
git submodule update --init --recursive
AFTER_HASH="$(git rev-parse HEAD)"

if [ "$BEFORE_HASH" = "$AFTER_HASH" ]; then
    echo "      Žádné nové změny v gitu."
    CHANGED_FILES=""
else
    CHANGED_FILES="$(git diff --name-only "$BEFORE_HASH" "$AFTER_HASH")"
    echo "      Aktualizováno: $(git --no-pager log --oneline "$BEFORE_HASH..$AFTER_HASH" | wc -l | tr -d ' ') nových commitů"
fi

# --- Stažení image z GHCR ---
echo ""
echo "[2/4] Stahování image z GHCR..."
# služby s `build:` se nestahují, ty vyžadují update_with_build.sh
$DC pull --ignore-buildable

# --- Restart kontejnerů s novými image ---
echo ""
echo "[3/4] Spouštím kontejnery s novými image..."
$DC up -d
echo "      Restartuji nginx (obnova DNS rozlišení)..."
$DC restart nginx

# --- Migrace ---
echo ""
echo "[4/4] Migrace..."
maybe_run_migrations

echo ""
echo "=== Aktualizace dokončena ==="
$DC ps
