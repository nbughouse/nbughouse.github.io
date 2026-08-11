export enum PlayerStatus {
    CONNECTED = "connected",
    SPECTATING = "spectating",
    DISCONNECTED = "disconnected",
}

export const GUEST_DISPLAY_NAME = "Guest";

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
        this.name = name;
        this.status = status;
    }

    clone(): Player {
        const player = new Player(this.id, this.name, this.status);
        player.wins = this.wins;
        player.total = this.total;
        return player;
    }
}

export function getPlayerDisplayName(player: Pick<Player, "name">): string {
    return player.name.trim() || GUEST_DISPLAY_NAME;
}
