import express from "express";
import { setupHandlers } from "./handlers";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { Server, Socket } from "socket.io";
import { config } from "@shared/config";
import { getPlayerDisplayName, Player } from "@shared/player";
import type { Room } from "@shared/room";
import { RoomStatus, Team } from "@shared/room";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const httpServer = http.createServer(app);
export const io = new Server(httpServer, {
    cors: {
        origin: isAllowedOrigin,
        credentials: true,
    },
});
export const rooms = new Map<string, Room>();
export const profiles = new Map<string, Profile>();

export class GameSocket extends Socket {
    room: Room | undefined;
    player!: Player;
}

export interface Profile {
    name: string;
    id: string;
    auth: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const devPublicPath = path.resolve(__dirname, "../../public");
const prodPublicPath = path.resolve(__dirname, "../public");
const hasBuiltClient = fs.existsSync(path.join(prodPublicPath, "index.html"));
const shouldUseDevClient =
    process.env.NODE_ENV !== "production" &&
    fs.existsSync(path.join(devPublicPath, "index.html"));
const publicPath = hasBuiltClient ? prodPublicPath : devPublicPath;
const sharedSrcPath = path.resolve(repoRoot, "shared/src");

app.use("/api", (request, response, next) => {
    const origin = request.headers.origin;
    if (isHttpOriginAllowed(origin)) {
        if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
    }
    next();
});

app.get("/api/rooms/:roomCode", (request, response) => {
    const roomCode = String(request.params.roomCode || "").toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(roomCode)) {
        return response.status(400).json({
            exists: false,
            error: "Invalid room code format",
        });
    }

    response.json({ exists: rooms.has(roomCode) });
});

if (shouldUseDevClient && !hasBuiltClient) {
    const { createServer } = await import("vite");
    const vite = await createServer({
        root: publicPath,
        resolve: {
            alias: {
                "@shared": sharedSrcPath,
            },
        },
        server: {
            middlewareMode: true,
            fs: {
                allow: [repoRoot],
            },
        },
        appType: "spa",
    });
    app.use(vite.middlewares);
} else if (hasBuiltClient) {
    app.use("/assets", express.static(path.join(publicPath, "assets")));
    app.use(express.static(publicPath));
} else {
    app.get("/", (_request, response) => {
        response.send("Bughouse N Player backend is running. Frontend is hosted separately.");
    });
}

app.get("/games/:roomCode", (request, response) => {
    const roomCode = request.params.roomCode as string;
    if (!/^[A-Z0-9]{4}$/.test(roomCode))
        return response.status(404).send("Invalid room code format");

    if (!shouldUseDevClient && !hasBuiltClient) {
        return response.status(404).send("Frontend is hosted separately");
    }

    response.sendFile("index.html", { root: publicPath });
});

io.on("connection", (socket: Socket) => {
    const gameSocket = socket as GameSocket;
    const handshakePlayerID = gameSocket.handshake.auth.playerID as
        | string
        | undefined;
    const handshakeToken = gameSocket.handshake.auth.token as
        | string
        | undefined;

    if (handshakePlayerID && handshakeToken) {
        const profile = profiles.get(handshakePlayerID);
        if (profile && profile.auth === handshakeToken) {
            gameSocket.player = new Player(handshakePlayerID, profile.name);
            profile.name = gameSocket.player.name;
            gameSocket.emit("sent-player", gameSocket.player.name);
        } else {
            issueFreshProfile(gameSocket);
        }
    } else {
        issueFreshProfile(gameSocket);
    }
    setupHandlers(gameSocket);
});

const PORT = Number(process.env.PORT) || config.serverPort;
httpServer.listen(PORT, () => {
    const startTime = Date.now();
    console.log(
        `<< Started Server [${PORT}] on ${new Date().toLocaleString()} >>\n`,
    );

    function writeStatus() {
        const secondsAgo = Math.floor((Date.now() - startTime) / 1000);
        console.log(
            `Uptime: ${secondsAgo}s | Rooms: ${rooms.size} | Players: ${profiles.size}`,
        );
    }
    writeStatus();
    setInterval(writeStatus, 5000);
});

setInterval(() => {
    const currentTime = Date.now();
    for (const [code, room] of rooms) {
        if (room.status === RoomStatus.PLAYING) {
            room.game.updateTime(currentTime);
            const timeout = room.game.checkTimeout();
            if (timeout) {
                const winningTeam =
                    timeout.team === Team.BLUE ? Team.RED : Team.BLUE;
                room.endRoom(winningTeam);
                io.to(code).emit(
                    "ended-room",
                    winningTeam,
                    getPlayerDisplayName(timeout.player) + " timed out.",
                    currentTime,
                );
            }
        }
    }
}, 100);

function randomPlayerID(): string {
    return (
        Math.random().toString(36).slice(2, 15) +
        Math.random().toString(36).slice(2, 15)
    );
}

function randomAuth(): string {
    return randomBytes(32).toString("hex");
}

function issueFreshProfile(socket: GameSocket): void {
    const id = randomPlayerID();
    const auth = randomAuth();
    const player = new Player(id);

    socket.player = player;
    profiles.set(id, { name: player.name, id, auth });
    socket.emit("created-player", id, auth);
}

function isAllowedOrigin(
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
): void {
    if (isHttpOriginAllowed(origin)) {
        callback(null, true);
        return;
    }

    callback(new Error("Origin not allowed"));
}

function isHttpOriginAllowed(origin: string | undefined): boolean {
    return !origin || getAllowedOrigins().has(origin);
}

function getAllowedOrigins(): Set<string> {
    const origins = new Set([
        "https://nbughouse.github.io",
        "https://nbughouse.duckdns.org",
        `http://localhost:${config.clientPort}`,
        `http://127.0.0.1:${config.clientPort}`,
        `http://localhost:${config.serverPort}`,
        `http://127.0.0.1:${config.serverPort}`,
    ]);

    addConfiguredOrigins(origins, process.env.FRONTEND_ORIGIN);
    addConfiguredOrigins(origins, process.env.ALLOWED_ORIGINS);

    return origins;
}

function addConfiguredOrigins(origins: Set<string>, value: string | undefined): void {
    if (!value) return;

    for (const rawOrigin of value.split(",")) {
        const origin = normalizeOrigin(rawOrigin);
        if (origin) origins.add(origin);
    }
}

function normalizeOrigin(rawOrigin: string): string | undefined {
    const trimmed = rawOrigin.trim();
    if (!trimmed) return undefined;

    try {
        return new URL(trimmed).origin;
    } catch {
        return trimmed.replace(/\/+$/, "");
    }
}
