# Bughouse N Player

Bughouse N Player is browser-based team chess played across multiple simultaneous
boards. Capture pieces to supply your teammates, drop pieces from your pocket,
and coordinate across boards to win the room for your team. Players can each
cover several boards, so you do not need a different person for every seat.

**[Play at nbug.app](https://nbug.app)** — create a room, share its link, and play
with friends, or start a bot room for solo or cooperative play.

## Features

- **Multiple boards:** human rooms support 1–8 boards, with two boards by default.
  Red and blue teams alternate chess colors across neighboring boards.
- **Flexible teams:** automatic balanced seat assignment, manual seat selection,
  host-controlled seat changes, and support for one player covering multiple boards.
- **Pocket play:** captured pieces transfer to teammates for later drops, with
  independent, team-shared, or everyone-shared pockets.
- **Variants:** Chess960, Accolade, Koedem, Kung Fu, and Duck, including compatible
  combinations.
- **Bot opponents:** solo or cooperative games on two or three boards, with nine
  difficulty levels and a separate nine-step speed setting.
- **Time controls:** base time, increment or delay, and optional shared team clocks.
- **Room tools:** invite links and four-character room codes, spectators, team
  chat, all-chat, host transfer, and host moderation.
- **Playing controls:** drag or click moves and drops, premoves where supported,
  promotion selection, and optional automatic queen promotion.
- **Customizable display:** piece sets, board themes, eight sound themes,
  animation speed, coordinates, move highlights, legal-move hints, and board layouts.
- **Session continuity:** stored anonymous player credentials and names, reconnect
  support, and saved browser preferences; no account signup is required.
- **Public statistics:** unique player IDs and completed multiplayer games,
  derived from server event records when statistics storage is configured.

## How to play

### Create or join a room

1. Open the app and enter a player name.
2. Choose **Create New Room**, or use **Join Room by ID** with a four-character
   code. You can also open a friend's room link directly.
3. Share the room link or code. In the lobby, the host can change the board count,
   clocks, variants, and pocket rules in **Settings**.
4. Use the open-seat `[+]` controls to choose seats, or let automatic assignment
   distribute players when the host presses **Start**. The host can also drag
   players onto seats. A player can cover multiple seats on the same team.
5. Play your boards and coordinate with teammates. After a game, the room returns
   to the lobby so the group can play again.

Human games need at least two players. The default random assignment balances
players across teams and distributes each team's boards among its players.
Manual assignment keeps chosen seats and fills remaining seats from connected
players when possible. Use the spectator control to watch instead of playing.

### Moves, captures, and pockets

Move by dragging a piece or clicking its starting and destination squares. To
drop a pocket piece, drag or select it and choose a legal destination.

With the default **Independent** pockets, a capture supplies one adjacent
teammate board. On an interior board with two possible recipients, choose which
neighbor receives the captured piece. On an end board, the sole neighbor receives
it automatically. With only one board, there is no neighboring board to receive
captures.

The other pocket modes change who can spend captured pieces:

| Pocket mode | Behavior |
| --- | --- |
| Independent | Each seat has its own pocket; captures go to one adjacent teammate board. |
| Team colors | Teammates across all boards share a supply; a drop consumes one piece from that supply. |
| Everyone | Both teams across all boards share a supply; a drop consumes one piece for everyone. |

Pawn drops cannot land on the first or last rank. Drop aggression can forbid
checking drops, forbid mating drops, or allow both. Captured promoted queens
return to pockets as pawns.

A checkmate, resignation, timeout, or variant win ends the entire room. Threefold
repetition on any one board draws the room automatically. Repetition includes
pockets, side to move, castling rights, and legally available en passant; Duck
positions count after duck placement. Clocks and cooldown timestamps do not
change position identity.

### Chat and room controls

Lobby chat is visible to everyone. During play, messages go to your team when
you have another human teammate; prefix a message with `/a ` to send it to the
whole room. Spectator messages and messages from players without a human
teammate use all-chat.

The host can use `/host <player name>` to transfer ownership and
`/ban <player name>` to remove and ban a player from the room. Host ownership can
also move to another connected player when the host leaves.

### Display and shortcuts

Open the settings gear to choose piece and board themes, sounds, movement mode,
animation speed, and visual hints. Preferences are saved in the browser.

| Key | Action |
| --- | --- |
| `x` | Flip board orientation. |
| `g` | Toggle the board grid layout. |
| `←` / `a` | Navigate to the previous board. |
| `→` / `d` | Navigate to the next board. |

The interface also offers board navigation buttons and a **Dual Board UI**
preference for two-board play.

## Variants and room settings

Select variants from the lobby's **Show Variants** panel before starting.

| Variant | Rules |
| --- | --- |
| Chess960 | Randomizes the back rank with bishops on opposite colors and the king between the rooks; supports Chess960 castling. |
| Accolade | Combine a knight with a friendly bishop, rook, or queen by moving or dropping one onto the other. The combined piece has both movement patterns. |
| Koedem | Kings can be captured and transferred into pockets. A pocket king must be dropped before other moves. A team wins when it holds at least four kings across boards and pockets. |
| Kung Fu | Both sides move without alternating turns. Pieces and pocket drops have configurable cooldowns; capturing a king wins. Normal clocks are disabled, and the game draws after one hour. |
| Duck | Make a chess move or pocket drop, then place the blocking duck on an empty square. After its first placement, the duck must change squares. It cannot be captured, and your clock runs until placement is complete. Capture the opposing king to win; check restrictions, including those for castling, do not apply. A player with no legal chess move or pocket drop wins by fowling. |

Chess960 and Accolade can combine with each other and with Koedem, Kung Fu, or
Duck. Koedem, Kung Fu, and Duck are mutually exclusive. Premoves are disabled in
Duck games. The internal name for Kung Fu is `taijitu`, including in test names.

The host can configure 1–8 boards, 30 seconds to 60 minutes of base time,
increment or delay, shared team clocks, pocket sharing, and drop aggression.
Kung Fu adds separate piece and pocket cooldown settings, both initially
10 seconds. Default human games use two standard boards, three minutes per
clock, no increment, independent pockets, and checking or mating drops allowed.

**Current setting limitations:** the interface exposes Custom FEN, promotion
Upgrade/Steal, and pawn-drop rank controls and stores their values, but the game
rules do not currently apply them. Starts use the standard layout or Chess960;
pawn drops remain restricted to ranks 2–7 and promotion follows the existing
upgrade behavior.

## Playing against bots

Choose **Create Bot Room** to open a local lobby. Humans play red and computers
play blue. Alone, you control every human seat. Settings offer two or three
boards, difficulty **1–9**, speed **1–9** from slow to fast, and starting clock
time, initially three minutes. Bot games use standard pieces and independent
pockets; variants and advanced room settings are unavailable.

Press **Start** to play locally. Moves, clocks, results, and engine searches run
in your browser, so the session can continue without the server after assets
have loaded. Local games do not survive a reload.

To play cooperatively, choose **Invite friends** in the **Players** tab. This
creates an online bot room with a shareable link and carries over your settings.
Human seats are automatically split among connected friends in the lobby; the
host can adjust them by dragging players onto seats. Computer seats cannot be
taken. The server validates moves and manages clocks and results, while the
host's browser runs the engine. If the host leaves, another connected human
becomes host and takes over engine work. Backgrounding the host browser can slow
bot play. Bot games do not count toward public completed-game totals.

Bots use the bundled Fairy-Stockfish WASM engine. Difficulty controls engine
strength independently of playing speed; levels are presets rather than
calibrated Elo ratings. Bots adjust their pace to clock pressure and can briefly
wait for a useful teammate capture or to avoid supplying an opponent's mating
drop. Engine searches rotate across boards in one worker; no remote engine
service or downloaded NNUE weights are used.

Bot play requires a secure browser context, such as HTTPS or localhost, and
cross-origin isolation. See the hosting requirements below if the interface
reports an engine setup error.

## Run locally

Use **Node.js 22.12 or newer** (the Docker build uses Node 22), or Node
20.19 or newer on the Node 20 release line, and **pnpm 9.15.9** through Corepack.
Docker and Docker Compose are only needed for container hosting.

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm run dev
```

Open **http://localhost:3000**. This command runs the Vite frontend on port 3000
and the backend on port 8000. The browser connects directly to port 8000 by
default when the page uses port 3000; Vite also provides `/api` and `/socket.io`
proxies to the backend.
Stop the processes with `Ctrl+C` when finished.

If you need to run the frontend and backend separately, use `pnpm run dev:client`
and `pnpm run dev:server` in separate terminals.

### Build and check

| Command | Purpose |
| --- | --- |
| `pnpm run build` | Build the frontend and backend into `dist/`. |
| `pnpm run build:frontend` | Build the frontend and copy assets into `dist/public`. |
| `pnpm run build:backend` | Build the backend and shared rules without rebuilding the frontend. |
| `pnpm run build:pages` | Build a static frontend with `404.html` and `.nojekyll`. |
| `pnpm run start` | Start the built backend, which also serves the built frontend when present. |
| `pnpm run start:all` | Start the built backend and a separate Vite preview. |
| `pnpm test` | Run variant, UI, server behavior, and vendored engine tests. |
| `pnpm run test:variants` | Run only variant and pocket-rule tests. |
| `pnpm run test:ui` | Run UI helper tests. |
| `pnpm run test:server` | Run server, local bot, timing, host-transfer, and engine tests. |
| `pnpm run test:typecheck` | Type-check the test suite. |
| `pnpm run clean` | Remove generated `dist/` output. |

Tests run as one-time commands without starting a server. Coverage includes all
960 castling layouts, compatible variant combinations, pocket transfers,
repetition, cooldowns, room cleanup, bot authority and host transfer, and a smoke
test of the bundled WASM engine at all nine difficulty levels. Install development
dependencies before running checks. Do not commit generated `dist/` output.

## Hosting

### Main deployment

The project is configured for **https://nbug.app**, with the frontend, API, and
Socket.IO endpoint on the same origin. The VM deployment uses Docker Compose
behind the VM's Caddy reverse proxy.

The [deployment workflow](.github/workflows/deploy.yml) runs on pushes to `main`
and requires these GitHub secrets:

- `VM_HOST`
- `VM_USER`
- `VM_SSH_KEY`

It checks out the repository at `/opt/BughouseNPlayer`, creates the external
Docker network `web` when needed, and rebuilds the service with
`docker compose up -d --build --remove-orphans`. An existing non-Git directory at
the checkout path is moved to a timestamped backup before cloning.

The Docker image builds both frontend and backend. The Compose service is named
`bughouse-n-player` and exposes port **8000** inside the `web` network; it does
not publish a host port. Configure the reverse proxy and domain to route:

```text
https://nbug.app -> bughouse-n-player:8000
```

For a manual deployment, prepare the external `web` network, persistent data
directory, and reverse proxy, then run the Compose command above. The deployment
workflow does not provision Caddy, DNS, or TLS certificates.

### Configuration

Frontend variables are read at build time; rebuild the frontend after changing
them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_BACKEND_URL` | Current page origin; port 8000 when the page uses port 3000 | API and Socket.IO backend origin; use this when hosting the frontend separately. |
| `VITE_BASE_PATH` | `/` | Base path for frontend assets and room links. |

| Backend variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8000` | Server listen port. |
| `NODE_ENV` | `production` in Docker | Selects production behavior. |
| `FRONTEND_ORIGIN` | `https://nbug.app` in Compose | Additional allowed frontend origin. |
| `ALLOWED_ORIGINS` | Unset | Comma-separated additional browser origins. |
| `BUGHOUSE_STATS_EVENTS_FILE` | Unset locally; `/app/data/stats-events.jsonl` in Compose | Append-only player and completed-game event log. |
| `BUGHOUSE_PROFILES_FILE` | `profiles.json` beside the stats log; `/app/data/profiles.json` in Compose | Persistent anonymous player IDs, authentication tokens, and names. Without either storage path, profiles stay in memory. |

The backend always allows `https://nbug.app` and localhost/127.0.0.1 on ports
3000 and 8000. `FRONTEND_ORIGIN` and `ALLOWED_ORIGINS` add to that list. Compose
passes `FRONTEND_ORIGIN` through from the environment; to use `ALLOWED_ORIGINS`
with Compose, add it to the service's environment configuration as well.

### Persistent data

Compose bind-mounts `/opt/BughouseNPlayer-data` on the VM to `/app/data` in the
container. This holds `stats-events.jsonl` and `profiles.json` outside the Git
checkout so container rebuilds preserve statistics and player identities.
The deploy workflow creates the stats log and attempts to mark it append-only
with `chattr +a` where supported.

Rooms, live games, chat, and room scores remain in memory and are lost when the
backend restarts. Stored credentials allow a browser to reuse its player
identity; if credentials are stale, the server issues a fresh profile. Public
stats at `/api/stats` are unavailable when no stats event file is configured.

### Separate frontend or static hosting

You can host `dist/public` separately and build with `VITE_BACKEND_URL` pointing
to a running backend. Set `VITE_BASE_PATH` for a subdirectory deployment and add
the frontend origin to the backend's allowed origins. The static host must serve
room links such as `/games/ABCD` through the app entry page; the integrated
Express host already provides that fallback. A static frontend still needs the
backend for online multiplayer, room lookup, and statistics.

`pnpm run build:pages` prepares GitHub Pages-compatible output, but this repository
does not currently include a Pages deployment workflow. For a GitHub project
site, set `VITE_BASE_PATH=/<repo-name>/` and configure deployment separately.

For browser bots, the frontend host must support a secure context and send:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Express, Vite development, and Vite preview already set these headers. GitHub
Pages does not provide them by default; use the main deployment or another host
that supplies them for bot play.

## Credits

Sounds and chess assets are credited to [Lichess](https://lichess.org).
The bundled Fairy-Stockfish WASM engine is version 1.1.12 under GPL-3.0; its
[source, package details, and license information](public/assets/engine/fairy-stockfish/README.md)
are included with the assets. The Duck icon is from Pictogrammers' Material
Design Icons under [Apache-2.0](public/assets/img/duck-LICENSE.txt).
