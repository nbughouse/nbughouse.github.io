import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { Player } from "../shared/player";
import type { Room } from "../shared/room";
import { Settings } from "./settings";

export class Session {
    socket: Socket;
    room: Room | undefined;
    player: Player | undefined;
    auth: string;
    settings: Settings;

    constructor(id?: string, auth?: string) {
        this.socket =
            id && auth
                ? io({
                      auth: {
                          playerID: id,
                          token: auth,
                      },
                  })
                : io();

        this.room = undefined;
        this.player = id ? new Player(id) : undefined;
        this.auth = auth || "";
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
    }
}

export function initSession() {
    // const id = sessionStorage.getItem("id");
    // const auth = sessionStorage.getItem("auth");

    // if (id && auth) {
    //    session = new Session(id, auth);
    // } else {
    //    session = new Session();
    // }
    sn = new Session();
    gs = sn as GameSession;
    return sn;
}

export type GameSession = Session & {
    player: Player;
    room: Room;
};

export let sn: Session;
export let gs: GameSession;
