# Bughouse N Player

Browser-based multiplayer bughouse chess with support for multiple simultaneous
boards. The frontend is a Vite TypeScript app, the backend is an Express and
Socket.IO server, and shared game state lives in `shared/src`.

## Live Setup

The complete app is hosted at `https://nbug.app`. The VM container serves the
Vite frontend, Express API, and Socket.IO endpoint through Caddy on one origin.

## Requirements

- Node.js 20 or newer.
- `pnpm` through Corepack.
- Docker and Docker Compose for the VM backend deployment.

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install
```

## Development

Run the local backend and Vite frontend together:

```bash
pnpm run dev
```

Then open:

```text
http://localhost:3000
```

Local ports:

- Frontend: `3000`
- Backend: `8000`

You can also run each process separately:

```bash
pnpm run dev:client
pnpm run dev:server
```

## Build Commands

Build only the frontend:

```bash
pnpm run build:frontend
```

This writes `dist/public` and copies the static assets.

Build only the VM backend:

```bash
pnpm run build:backend
```

Build everything:

```bash
pnpm run build
```

Start the built backend:

```bash
pnpm run start
```

Run the built backend and a local Vite preview together:

```bash
pnpm run start:all
```

Clean generated output:

```bash
pnpm run clean
```

## Configuration

Frontend build variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_BACKEND_URL` | Current page origin | Optional Socket.IO/API origin override. |
| `VITE_BASE_PATH` | `/` | Base path for static assets and room URLs. |

Production uses the defaults so the browser connects back to `https://nbug.app`.
The variables remain available for development or alternate deployments.

Backend variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `production` in Docker | Enables production behavior in the container. |
| `PORT` | `8000` | Backend listen port. |
| `FRONTEND_ORIGIN` | `https://nbug.app` | Primary allowed browser origin for Socket.IO CORS. |
| `ALLOWED_ORIGINS` | unset | Optional comma-separated extra allowed origins. |
| `BUGHOUSE_STATS_EVENTS_FILE` | unset locally, `/app/data/stats-events.jsonl` in Docker | Append-only server event log used to derive public stats. |
| `BUGHOUSE_PROFILES_FILE` | Beside `BUGHOUSE_STATS_EVENTS_FILE`, `/app/data/profiles.json` in Docker | Persistent anonymous IDs, authentication tokens, and player names. |

## Deployment

### GitHub Pages Frontend

The frontend can also be deployed as a static GitHub Pages site while using the
production backend at `https://nbug.app`.

The workflow in `.github/workflows/pages.yml` builds `dist/public` and deploys
it to Pages on pushes to `main` or from a manual workflow run. It sets
`VITE_BASE_PATH` to `/<repo-name>/`, which matches GitHub project Pages URLs.

Optional repository variable:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_BACKEND_URL` | `https://nbug.app` | Backend origin used by the Pages frontend for API and Socket.IO. |

If the Pages site uses a different origin than `https://nbug.app`, add that
origin to the backend with `ALLOWED_ORIGINS` or `FRONTEND_ORIGIN` so API and
Socket.IO requests are accepted.

### VM

The app deploys from `.github/workflows/deploy.yml` on pushes to `main`.

Required GitHub secrets:

```text
VM_HOST
VM_USER
VM_SSH_KEY
```

The workflow SSHes into the VM, keeps the checkout under
`/opt/BughouseNPlayer`, rebuilds the Docker image, and runs:

```bash
docker compose up -d --build --remove-orphans
```

Stats are persisted outside the Git checkout at:

```text
/opt/BughouseNPlayer-data/stats-events.jsonl
```

That file is bind-mounted into the container at `/app/data/stats-events.jsonl`.
The deploy workflow creates it before rebuilding and marks it append-only with
`chattr +a` when the VM filesystem supports it, so repo updates and container
rebuilds do not reset public gameplay totals.

If `/opt/BughouseNPlayer` already exists but is not a Git checkout, the workflow
moves it aside as `/opt/BughouseNPlayer.backup.<timestamp>` before cloning.

The Docker build compiles both the frontend and backend. The service is named
`bughouse-n-player`, exposes port `8000` inside the external `web` Docker
network, and expects the VM reverse proxy to route:

```text
https://nbug.app -> bughouse-n-player:8000
```

## Project Layout

```text
public/       Vite frontend app, styles, images, pieces, and sound
server/       Express server, Socket.IO setup, room events, and timers
shared/       Shared chess rules, room state, player state, chat, and config
scripts/      Build helper scripts
dist/         Generated build output
```

## Gameplay Flow

1. Enter a player name.
2. Create a room or join a room by code.
3. Pick open board seats with the `[+]` buttons.
4. The host starts the room once players are set.
5. Captures are added to teammate pockets.
6. Pocket pieces can be dropped on eligible boards.
7. A room ends on checkmate, resignation, or timeout.

The current room model creates two boards by default. Every seat on every
board must be occupied before the room starts when manual assignment is used.
With random assignment, connected room players are assigned automatically.

## Notes

- Do not commit `dist/`; it is generated by local builds and workflows.
- Direct room links are served by the Express `/games/:roomCode` fallback.
- Browser asset paths and room URLs are based on `VITE_BASE_PATH`.
- The frontend reconnects with stored session credentials when possible; if the
  backend has restarted and the old credentials are stale, it creates a fresh
  profile.
