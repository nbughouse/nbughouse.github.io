import { checkAndPromptForName } from "./menu-ui";
import { sn } from "./session";

export function checkURLForRoom(): void {
    // Extract room code from path like /games/ABCD
    const pathParts = globalThis.location.pathname.split("/");
    const roomCode = pathParts[2]; // Assuming /games/ROOMCODE structure

    if (
        roomCode &&
        roomCode.length === 4 &&
        checkAndPromptForName(() => {
            // Remove URL extension
            globalThis.history.replaceState({}, "", "/");
            sn.socket.emit("join-room", roomCode);
        })
    ) {
        // If name is already set, join immediately
        globalThis.history.replaceState({}, "", "/");
        sn.socket.emit("join-room", roomCode);
    }
}

export function updateURL(roomCode: string): void {
    const newPath = `/games/${roomCode}`;
    globalThis.history.replaceState({}, "", newPath);
}
