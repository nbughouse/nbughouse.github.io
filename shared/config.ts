export type TimeType = "increment" | "delay";
export type InitialBoard = "default" | "960";
export type PocketShare = "color" | "shared" | "none";

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
    /** Pocket sharing rules */
    pocketShare: PocketShare;

    constructor(
        matchNumber: number = 2,
        timeBase: number = 180, // 3 minutes
        timeBonus: number = 0, // +0
        timeType: TimeType = "increment",
        timeShared: boolean = false,
        initialBoard: InitialBoard = "default",
        pocketShare: PocketShare = "color",
    ) {
        this.matchNum = matchNumber;
        this.timeBase = timeBase;
        this.timeBonus = timeBonus;
        this.timeType = timeType;
        this.timeShared = timeShared;
        this.initialBoard = initialBoard;
        this.pocketShare = pocketShare;
    }

    serialize(): Record<string, unknown> {
        return {
            "match-num": this.matchNum,
            "time-base": this.timeBase,
            "time-bonus": this.timeBonus,
            "time-type": this.timeType,
            "time-shared": this.timeShared,
            "initial-board": this.initialBoard,
            "pocket-share": this.pocketShare,
        };
    }

    static deserialize(data: Record<string, unknown>): GameConfig {
        return new GameConfig(
            (data["match-num"] ?? 2) as number,
            (data["time-base"] ?? 180) as number,
            (data["time-bonus"] ?? 0) as number,
            (data["time-type"] ?? "increment") as TimeType,
            (data["time-shared"] ?? false) as boolean,
            (data["initial-board"] ?? "default") as InitialBoard,
            (data["pocket-share"] ?? "color") as PocketShare,
        );
    }
}
