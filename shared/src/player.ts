export enum PlayerStatus {
    CONNECTED = "connected",
    SPECTATING = "spectating",
    DISCONNECTED = "disconnected",
}

export const GUEST_DISPLAY_NAME = "Guest";
export const PLAYER_NAME_MAX_LENGTH = 20;
const PLAYER_NAME_ALLOWED_CHARACTERS = /[^A-Za-z0-9_]/g;
const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

export class Player {
    id: string;
    name: string;
    status: PlayerStatus;

    wins: number = 0;
    total: number = 0;

    constructor(
        id: string,
        name: string = "",
        status: PlayerStatus = PlayerStatus.CONNECTED,
    ) {
        this.id = id;
        this.name = sanitizePlayerName(name);
        this.status =
            status === PlayerStatus.SPECTATING ||
            status === PlayerStatus.DISCONNECTED
                ? status
                : PlayerStatus.CONNECTED;
    }
}

export function getPlayerDisplayName(player: Pick<Player, "name">): string {
    return player.name.trim() || GUEST_DISPLAY_NAME;
}

export function sanitizePlayerName(name: string): string {
    return name
        .trim()
        .replace(PLAYER_NAME_ALLOWED_CHARACTERS, "")
        .slice(0, PLAYER_NAME_MAX_LENGTH);
}

export function isValidPlayerName(name: string): boolean {
    return (
        name.length > 0 &&
        name.length <= PLAYER_NAME_MAX_LENGTH &&
        PLAYER_NAME_PATTERN.test(name)
    );
}
