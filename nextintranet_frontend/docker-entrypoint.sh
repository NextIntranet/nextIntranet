#!/bin/sh
set -e

if [ ! -d /app/node_modules ] || [ ! -d /app/packages/app/node_modules ]; then
  pnpm install --frozen-lockfile
elif ! ls /app/packages/app/node_modules/react-markdown >/dev/null 2>&1 \
  || ! ls /app/packages/app/node_modules/remark-gfm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile
fi

if [ -f /app/documentation/scripts/build-manifest.mjs ] \
  && [ ! -f /app/documentation/manifest.json ]; then
  node /app/documentation/scripts/build-manifest.mjs
fi

exec "$@"
