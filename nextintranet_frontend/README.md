# NextIntranet React (v2)

Modern React rewrite of NextIntranet using Vite, TanStack Query, and pnpm workspaces.

## Architecture

```
packages/
├── core/         # API client, WebSocket, auth
├── ui/           # Shared UI components (shadcn/ui)
├── warehouse/    # Warehouse module
├── production/   # Production module (TODO)
├── users/        # Users module (TODO)
└── app/          # Main Vite application
```

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build
```

## Environment Variables

Copy `packages/app/.env.example` to `packages/app/.env`:

```env
VITE_API_URL=http://localhost:9000
VITE_WS_URL=ws://localhost:9000
```

## Tech Stack

- **Vite** - Fast build tool
- **React 18** - UI library
- **TypeScript** - Type safety
- **TanStack Query** - Data fetching & caching
- **React Router** - Routing
- **WebSocket** - Realtime communication
- **pnpm workspaces** - Monorepo management

## Migration from Angular

This is a parallel implementation running alongside the existing Angular frontend. Both can coexist during the migration period.

- Angular: `http://localhost:9000/`
- React: `http://localhost:9000/react`

## Docker

Development:
```bash
docker compose up frontend_react
```

Production build is served via nginx from the Docker image.
