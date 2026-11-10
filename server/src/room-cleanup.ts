import { PlayerStatus } from "@shared/player";
import type { Room } from "@shared/room";

const emptyRoomGraceMs = 30_000;
const emptySince = new WeakMap<Room, number>();

export function trackRoomPresence(room: Room, currentTime = Date.now()): void {
    const hasConnectedPlayers = [...room.players.values()].some(
        (player) => !player.isBot && player.status !== PlayerStatus.DISCONNECTED,
    );

    if (hasConnectedPlayers) emptySince.delete(room);
    else if (!emptySince.has(room)) emptySince.set(room, currentTime);
}

export function removeEmptyRooms(
    rooms: Map<string, Room>,
    currentTime = Date.now(),
): void {
    for (const [code, room] of rooms) {
        trackRoomPresence(room, currentTime);
        const since = emptySince.get(room);
        if (since !== undefined && currentTime - since >= emptyRoomGraceMs)
            rooms.delete(code);
    }
}
