import type { ManagerOptions, Socket, SocketOptions } from "socket.io-client";
import { io } from "socket.io-client";
import { config } from "@shared/config";
import { Player } from "@shared/player";
import type { Room } from "@shared/room";
import { Settings } from "./settings";

export class Session {
    socket: Socket;
    room: Room | undefined;
    player: Player | undefined;
    auth: string;
    name: string;
    settings: Settings;

    constructor(id?: string, auth?: string) {
        const storedName =
            globalThis.sessionStorage?.getItem("name") || undefined;
        this.socket = io(getSocketUrl(), getSocketOptions(id, auth));

        this.room = undefined;
        this.player = id ? new Player(id, storedName) : undefined;
        this.auth = auth || "";
        this.name = storedName || "";
        this.settings = new Settings();

        if (this.settings.logSocket) {
            const ignoredEvents = new Set(["ping", "pong"]);

            // Log all incoming socket events (filtered)
            this.socket.onAny((event, ...arguments_) => {
                if (!ignoredEvents.has(event)) {
                    console.log(
                        `%c⬇ [RECEIVE] ${event}`,
                        "color: #2196F3; font-weight: bold",
                        arguments_,
                    );
                }
            });

            // Log all outgoing socket events (filtered)
            const originalEmit = this.socket.emit.bind(this.socket);
            this.socket.emit = function (
                event: string,
                ...arguments_: unknown[]
            ) {
                if (!ignoredEvents.has(event)) {
                    console.log(
                        `%c⬆ [EMIT] ${event}`,
                        "color: #4CAF50; font-weight: bold",
                        arguments_,
                    );
                }
                return originalEmit(event, ...arguments_);
            };
        }
    }

    resetSession(): void {
        this.room = undefined;
        this.player = undefined;
        this.auth = "";
        this.name = "";
        globalThis.sessionStorage?.removeItem("id");
        globalThis.sessionStorage?.removeItem("auth");
        globalThis.sessionStorage?.removeItem("name");
    }
}

function getSocketUrl(): string {
    const configuredBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim();
    if (configuredBackendUrl) return configuredBackendUrl.replace(/\/+$/, "");

    if (globalThis.location.port === String(config.clientPort)) {
        return `${globalThis.location.protocol}//${globalThis.location.hostname}:${config.serverPort}`;
    }

    return globalThis.location.origin;
}

function getSocketOptions(
    playerID: string | undefined,
    token: string | undefined,
): Partial<ManagerOptions & SocketOptions> {
    const options: Partial<ManagerOptions & SocketOptions> = {
        transports: ["websocket", "polling"],
        tryAllTransports: true,
        upgrade: false,
    };

    if (playerID && token) {
        options.auth = { playerID, token };
    }

    return options;
}

export function initSession() {
    const id = globalThis.sessionStorage?.getItem("id") || undefined;
    const auth = globalThis.sessionStorage?.getItem("auth") || undefined;

    sn = new Session(id, auth);
    gs = sn as GameSession;
    return sn;
}

export type GameSession = Session & {
    player: Player;
    room: Room;
};

export let sn: Session;
export let gs: GameSession;
