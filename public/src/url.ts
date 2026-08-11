import { checkAndPromptForName, showError } from "./menu-ui";
import { roomExists } from "./room-api";
import { sn } from "./session";
import { getAppPathname, getBasePath, getRoomPath } from "./app-paths";

export async function checkURLForRoom(): Promise<void> {
    const roomCode = getRoomCodeFromPath()?.toUpperCase();

    if (!roomCode) return;

    if (!/^[A-Z0-9]{4}$/.test(roomCode)) {
        clearRoomURL();
        showError("menu-error", "Invalid room code");
        return;
    }

    const exists = await roomExists(roomCode);
    if (exists === undefined) {
        showError("menu-error", "Cannot reach game server. Try again in a moment.");
        return;
    }

    if (!exists) {
        clearRoomURL();
        showError("menu-error", `Room ${roomCode} does not exist`);
        return;
    }

    if (
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
    const roomPath = getRoomPath(roomCode);
    const roomState = { bughouseView: "game", roomCode };

    if (
        globalThis.location.pathname ===
        new URL(roomPath, globalThis.location.origin).pathname
    ) {
        globalThis.history.replaceState(roomState, "", roomPath);
        return;
    }

    globalThis.history.pushState(roomState, "", roomPath);
}

export function clearRoomURL(): void {
    globalThis.history.replaceState(
        { bughouseView: "menu", menuView: "main" },
        "",
        getBasePath(),
    );
}

function getRoomCodeFromPath(): string | undefined {
    const pathParts = getAppPathname()
        .split("/")
        .filter(Boolean);

    return pathParts[0] === "games" ? pathParts[1] : undefined;
}
