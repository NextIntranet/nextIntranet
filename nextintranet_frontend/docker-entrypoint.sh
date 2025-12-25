#!/bin/sh
set -e

if [ ! -d /app/node_modules ] || [ ! -d /app/packages/app/node_modules ]; then
  pnpm install --frozen-lockfile
elif ! ls /app/packages/app/node_modules/react-select >/dev/null 2>&1; then
  pnpm install --frozen-lockfile
fi

exec "$@"
