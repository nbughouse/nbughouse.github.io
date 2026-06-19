# Bughouse N Player

Browser-based multiplayer bughouse chess with multiple simultaneous boards. The
client is a Vite TypeScript app, the backend is an Express + Socket.IO server,
and shared game state lives in `shared/src`.

## Features

- Create and join four-character room-code lobbies.
- Join a board seat, ready up, and start once every board seat is filled.
- Play across multiple linked chess boards. The current room constructor creates
  three boards by default.
- Share captured pieces through bughouse-style pockets.
- Make board moves, pocket drops, premoves, resignations, and timeout wins.
- Use room chat, live lobby listings, grid/single-board controls, and game audio.
- Deep-link directly to rooms with `/games/ABCD`.

## Requirements

- Node.js 20 or newer is recommended.
- `pnpm` is recommended because the root `build` script currently delegates to
  `pnpm` subcommands.

This repo currently contains both `package-lock.json` and `pnpm-lock.yaml`.
Pick one package manager for day-to-day work and keep the lockfile strategy
consistent.

## Install

```bash
pnpm install
```

If you prefer npm for local development:

```bash
npm install
```

Note that `npm run build` still requires `pnpm` to be available unless the build
script is changed.

## Development

Start the client and server together:

```bash
pnpm run dev
```

Then open:

```text
http://localhost:3000
```

The Vite client runs on port `3000`. The Socket.IO backend runs on port `8000`.
The current browser session code connects directly to `http://localhost:8000`.

You can also run each side separately:

```bash
pnpm run dev:client
pnpm run dev:server
```

## Production Build

Build the shared code, client, and server:

```bash
pnpm run build
```

Start the built server:

```bash
pnpm run start
```

By default the production server listens on port `8000`. Set `PORT` to override
that:

```bash
PORT=9000 pnpm run start
```

The production server serves the built frontend from `dist/public` and the API
from the same Express process.

## Current Build Caveat

`package.json` references this step:

```bash
node scripts/fix-esm-relative-imports.mjs dist/shared
```

At the time this README was created, the repo does not include a `scripts/`
directory, so a full `pnpm run build` will fail until that helper is restored or
the build step is updated. The targeted scripts are still useful while working:

```bash
pnpm run build:shared
pnpm run build:client
pnpm run build:server
```

## Project Layout

```text
public/           Vite frontend app, styles, images, pieces, and audio
public/src/       Browser session, menu, game UI, board UI, and socket handlers
server/src/       Express server, Socket.IO setup, room events, and timers
shared/src/       Chess rules, room state, player state, chat, and config types
dist/             Generated build output
github/deploy.yml VM deployment workflow
```

## Gameplay Flow

1. Enter a player name.
2. Create a room or join a room by code.
3. Pick open board seats with the `[+]` buttons.
4. Ready up once all seats are assigned.
5. The room starts automatically when every seated player is ready.
6. Captures are added to teammate pockets, and pocket pieces can be dropped on
   eligible boards.
7. A room ends on checkmate, resignation, or timeout.

## Deployment Notes

The included `github/deploy.yml` workflow connects to a VM over SSH, updates
`/opt/Bughouse`, installs dependencies, builds, and restarts a `bughouse`
systemd service. Make sure the VM has the package manager required by the
current build script.
