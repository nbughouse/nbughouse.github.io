import { checkAndPromptForName } from "./menu-ui";
import { sn } from "./session";
import { getAppPathname, getBasePath, getRoomPath } from "./app-paths";

export function checkURLForRoom(): void {
    const roomCode = getRoomCodeFromPath();

    if (
        roomCode &&
        roomCode.length === 4 &&
        checkAndPromptForName(() => {
            clearRoomURL();
            sn.socket.emit("join-room", roomCode);
        })
    ) {
        clearRoomURL();
        sn.socket.emit("join-room", roomCode);
    }
}

export function updateURL(roomCode: string): void {
    globalThis.history.replaceState({}, "", getRoomPath(roomCode));
}

export function clearRoomURL(): void {
    globalThis.history.replaceState({}, "", getBasePath());
}

function getRoomCodeFromPath(): string | undefined {
    const pathParts = getAppPathname()
        .split("/")
        .filter(Boolean);

    return pathParts[0] === "games" ? pathParts[1] : undefined;
}
