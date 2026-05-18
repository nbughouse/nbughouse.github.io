export enum PlayerStatus {
    READY = "ready",
    NOT_READY = "not-ready",
    DISCONNECTED = "disconnected",
}

export class Player {
    id: string;
    name: string;
    status: PlayerStatus;

    wins: number = 0;
    total: number = 0;

    constructor(
        id: string,
        name: string = "Player",
        status: PlayerStatus = PlayerStatus.NOT_READY,
    ) {
        this.id = id;
        this.name = name;
        this.status = status;
    }
}
