export const config = {
    clientPort: 3000,
    serverPort: 8000,
};

export type TimeType = "increment" | "delay";
export type InitialBoard = "default" | "random" | string;
export type PlayerAssignment = "manual" | "random";
export type PocketShare = "color" | "shared" | "none";
export type DropAggression = "no-check" | "no-mate" | "mate";
export type PromotionType = "upgrade" | "steal";

export const kungFuGameLimitSeconds = 60 * 60;

export function hasInitialBoardVariant(
    initialBoard: InitialBoard,
    variant: string,
): boolean {
    return initialBoard.split("+").includes(variant);
}

export function isKungFuInitialBoard(initialBoard: InitialBoard): boolean {
    return hasInitialBoardVariant(initialBoard, "taijitu");
}

export class GameConfig {
    /** Number of boards */
    matchNum: number;
    /** Initial amount of time in seconds */
    timeBase: number;
    /** Amount of increment/delay in seconds */
    timeBonus: number;
    /** Type of time handling */
    timeType: TimeType;
    /** Whether time is shared across the team */
    timeShared: boolean;
    /** Starting board configuration */
    initialBoard: InitialBoard;
    /** Whether occupied players keep their seats or receive balanced random seats */
    playerAssignment: PlayerAssignment;
    /** Pocket sharing rules */
    pocketShare: PocketShare;
    /** Whether pocket drops can check or checkmate */
    dropAggression: DropAggression;
    /** Promotion capture behavior */
    promotionType: PromotionType;
    /** Allowed pawn drop ranks in min-max format */
    pawnDropRanks: string;
    /** Piece movement cooldown in seconds */
    pieceCooldown: number;
    /** Pocket drop cooldown in seconds */
    pocketCooldown: number;

    constructor(
        matchNumber: number = 2,
        timeBase: number = 180, // 3 minutes
        timeBonus: number = 0, // +0
        timeType: TimeType = "increment",
        timeShared: boolean = false,
        initialBoard: InitialBoard = "default",
        playerAssignment: PlayerAssignment = "random",
        pocketShare: PocketShare = "color",
        dropAggression: DropAggression = "mate",
        promotionType: PromotionType = "upgrade",
        pawnDropRanks: string = "2-7",
        pieceCooldown: number = 10,
        pocketCooldown: number = 10,
    ) {
        this.matchNum = matchNumber;
        this.timeBase = timeBase;
        this.timeBonus = timeBonus;
        this.timeType = timeType;
        this.timeShared = timeShared;
        this.initialBoard = initialBoard;
        this.playerAssignment = playerAssignment;
        this.pocketShare = pocketShare;
        this.dropAggression = dropAggression;
        this.promotionType = promotionType;
        this.pawnDropRanks = pawnDropRanks;
        this.pieceCooldown = pieceCooldown;
        this.pocketCooldown = pocketCooldown;
    }

    serialize(): Record<string, unknown> {
        return {
            "match-num": this.matchNum,
            "time-base": this.timeBase,
            "time-bonus": this.timeBonus,
            "time-type": this.timeType,
            "time-shared": this.timeShared,
            "initial-board": this.initialBoard,
            "player-assignment": this.playerAssignment,
            "pocket-share": this.pocketShare,
            "drop-aggression": this.dropAggression,
            "promotion-type": this.promotionType,
            "pawn-drop-ranks": this.pawnDropRanks,
            "piece-cooldown": this.pieceCooldown,
            "pocket-cooldown": this.pocketCooldown,
        };
    }

    static deserialize(data: Record<string, unknown>): GameConfig {
        const initialBoard =
            typeof data["initial-board"] === "string" &&
            data["initial-board"].trim()
                ? data["initial-board"]
                : "default";
        const playerAssignment =
            data["player-assignment"] === "manual" ? "manual" : "random";
        const timeType = data["time-type"] === "delay" ? "delay" : "increment";
        const pocketShare =
            data["pocket-share"] === "shared" || data["pocket-share"] === "none"
                ? data["pocket-share"]
                : "color";
        const dropAggression =
            data["drop-aggression"] === "no-check" ||
            data["drop-aggression"] === "no-mate"
                ? data["drop-aggression"]
                : "mate";
        const promotionType =
            data["promotion-type"] === "steal" ? "steal" : "upgrade";

        return new GameConfig(
            (data["match-num"] ?? 2) as number,
            (data["time-base"] ?? 180) as number,
            (data["time-bonus"] ?? 0) as number,
            timeType,
            (data["time-shared"] ?? false) as boolean,
            initialBoard,
            playerAssignment,
            pocketShare,
            dropAggression,
            promotionType,
            typeof data["pawn-drop-ranks"] === "string"
                ? data["pawn-drop-ranks"]
                : "2-7",
            (data["piece-cooldown"] ?? 10) as number,
            (data["pocket-cooldown"] ?? 10) as number,
        );
    }
}
