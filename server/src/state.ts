import { Server, Socket } from "socket.io";
import type { Player } from "@shared/player";
import type { Room } from "@shared/room";
import { loadProfiles } from "./profile-store";

// Keep shared handler state independent of the HTTP listener and server timers.
export const io = new Server();
export const rooms = new Map<string, Room>();
export const profiles = loadProfiles();

export class GameSocket extends Socket {
    room: Room | undefined;
    player!: Player;
}
