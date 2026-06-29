import express from "express";
import { setupHandlers } from "./handlers";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { Server, Socket } from "socket.io";
import { config } from "@shared/config";
import { Player } from "@shared/player";
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
export const MENU_ROOM = "*";

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
    app.use("/audio", express.static(path.join(publicPath, "audio")));
    app.use("/img", express.static(path.join(publicPath, "img")));
    app.use("/pieces", express.static(path.join(publicPath, "pieces")));
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
    if (gameSocket.handshake.auth.playerID && gameSocket.handshake.auth.token) {
        const profile = profiles.get(gameSocket.handshake.auth.playerID);
        if (profile && profile.auth === gameSocket.handshake.auth.token) {
            gameSocket.player = new Player(
                gameSocket.handshake.auth.playerID,
                profile.name,
            );
            gameSocket.emit("sent-player", profile.name);
        } else {
            gameSocket.disconnect();
            return;
        }
    } else {
        const id = randomPlayerID();
        const auth = randomAuth();
        const player = new Player(id);
        gameSocket.player = player;
        profiles.set(id, { name: player.name, id, auth });
        gameSocket.emit("created-player", id, auth);
    }
    gameSocket.join(MENU_ROOM);
    setupHandlers(gameSocket);
    emitRoomList();
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
                room.endRoom(timeout.team === Team.BLUE ? Team.RED : Team.BLUE);
                io.to(code).emit(
                    "ended-room",
                    timeout.team,
                    timeout.player.name + " timed out.",
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

export function emitRoomList(): void {
    io.to(MENU_ROOM).emit(
        "listed-rooms",
        [...rooms.values()].map((room) => room.getRoomListing()),
    );
}

function isAllowedOrigin(
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
): void {
    if (!origin) {
        callback(null, true);
        return;
    }

    if (getAllowedOrigins().has(origin)) {
        callback(null, true);
        return;
    }

    callback(new Error("Origin not allowed"));
}

function getAllowedOrigins(): Set<string> {
    const origins = new Set([
        "https://lualum.github.io",
        "https://bughousenplayer.duckdns.org",
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
