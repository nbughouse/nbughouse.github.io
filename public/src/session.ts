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
        const storedName = getStoredProfileValue("name");
        this.socket = io(getBackendUrl(), getSocketOptions(id, auth));

        this.room = undefined;
        this.player = id ? new Player(id, storedName || "") : undefined;
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
                        "color: #2196F3; font-weight: 600",
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
                        "color: #4CAF50; font-weight: 600",
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
        removeStoredProfileValue("id");
        removeStoredProfileValue("auth");
        removeStoredProfileValue("name");
    }
}

export function getBackendUrl(): string {
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
        autoConnect: false,
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
    const id = getStoredProfileValue("id");
    const auth = getStoredProfileValue("auth");

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

type ProfileStorageKey = "id" | "auth" | "name";

export function setStoredProfileValue(
    key: ProfileStorageKey,
    value: string,
): void {
    let persisted = false;
    try {
        const storage = globalThis.localStorage;
        if (storage) {
            storage.setItem(key, value);
            persisted = true;
        }
    } catch {
        // Fall back to session storage when persistent storage is unavailable.
    }

    if (persisted) {
        try {
            globalThis.sessionStorage?.removeItem(key);
        } catch {
            // The value is already persisted; stale session data is harmless.
        }
        return;
    }

    try {
        globalThis.sessionStorage?.setItem(key, value);
    } catch {
        // The in-memory session still works when browser storage is unavailable.
    }
}

function getStoredProfileValue(key: ProfileStorageKey): string | undefined {
    try {
        const storedValue = globalThis.localStorage?.getItem(key);
        if (storedValue) return storedValue;
    } catch {
        // Fall back to session storage when persistent storage is unavailable.
    }

    try {
        const legacyValue = globalThis.sessionStorage?.getItem(key) || undefined;
        if (legacyValue) setStoredProfileValue(key, legacyValue);
        return legacyValue;
    } catch {
        return undefined;
    }
}

function removeStoredProfileValue(key: ProfileStorageKey): void {
    try {
        globalThis.localStorage?.removeItem(key);
    } catch {
        // Ignore unavailable browser storage.
    }

    try {
        globalThis.sessionStorage?.removeItem(key);
    } catch {
        // Ignore unavailable browser storage.
    }
}
