import { Chat } from "./chat";
import type { Move, MoveResult, SerializedChess } from "./chess";
import { Chess, Color } from "./chess";
import { GameConfig } from "./config";
import { Player, PlayerStatus } from "./player";

const defaultTime = 180_000; // 3 minutes in milliseconds
const minMatches = 1;
const maxMatches = 8;
const minTimeBase = 30;
const maxTimeBase = 3600;
const minTimeBonus = 0;
const maxTimeBonus = 3600;

export enum RoomStatus {
    LOBBY = "lobby",
    PLAYING = "playing",
}

// Red: White unflipped & Black flipped
// Blue: White flipped & Black unflipped
export enum Team {
    RED = "red",
    BLUE = "blue",
}

export interface SerializedMatch {
    chess: SerializedChess;
    whitePlayer: Player | undefined;
    blackPlayer: Player | undefined;
    whiteTime: number;
    blackTime: number;
    queued: { moves: Move[]; color: Color };
    lastMoveTime: number | undefined;
    flipped: boolean;
}

export interface SerializedGame {
    config: Record<string, unknown>;
    matches: SerializedMatch[];
}

export interface SerializedRoom {
    code: string;
    hostID: string | undefined;
    status: RoomStatus;
    game: SerializedGame;
    chat: string;
    players: Record<string, Player>;
}

export class Room {
    code: string;
    hostID: string | undefined;
    players: Map<string, Player>;
    status: RoomStatus;
    game: Game;
    chat: Chat;

    constructor(code: string, hostID?: string) {
        this.code = code;
        this.hostID = hostID;
        this.players = new Map();
        this.status = RoomStatus.LOBBY;
        this.game = new Game();
        this.chat = new Chat();
        this.rebuildMatches();
    }

    serialize(): SerializedRoom {
        const serializedPlayers: Record<string, Player> = {};
        for (const [id, player] of this.players.entries())
            serializedPlayers[id] = player;

        return {
            code: this.code,
            hostID: this.hostID,
            status: this.status,
            game: this.game.serialize(),
            chat: this.chat.serialize(),
            players: serializedPlayers,
        };
    }

    static deserialize(data: SerializedRoom): Room {
        const room = new Room(data.code);
        room.hostID = data.hostID;
        room.status = data.status;
        room.chat = Chat.deserialize(data.chat);

        for (const [id, playerData] of Object.entries(data.players)) {
            const player = new Player(
                playerData.id,
                playerData.name,
                playerData.status,
            );
            player.wins = playerData.wins;
            player.total = playerData.total;
            room.players.set(id, player);
        }

        room.setGame(data.game);

        return room;
    }

    setGame(data: SerializedGame): void {
        this.game = Game.deserialize(data);

        for (const match of this.game.matches) {
            match.whitePlayer = match.whitePlayer
                ? this.players.get(match.whitePlayer.id)
                : undefined;
            match.blackPlayer = match.blackPlayer
                ? this.players.get(match.blackPlayer.id)
                : undefined;
        }
    }

    addPlayer(player: Player): void {
        if (!this.hostID) this.hostID = player.id;
        this.players.set(player.id, player);
    }

    disconnectPlayer(id: string): void {
        const player = this.players.get(id);
        if (!player) return;

        player.status = PlayerStatus.DISCONNECTED;
        this.removePlayerFromBoards(id);

        if (this.hostID === id) this.hostID = this.nextConnectedPlayerID();
    }

    removePlayer(id: string): void {
        this.players.delete(id);
        this.removePlayerFromBoards(id);

        if (this.hostID === id) this.hostID = this.nextConnectedPlayerID();
    }

    removePlayerFromBoards(id: string): void {
        for (const match of this.game.matches) {
            if (match.whitePlayer?.id === id) match.whitePlayer = undefined;
            if (match.blackPlayer?.id === id) match.blackPlayer = undefined;
        }
    }

    private nextConnectedPlayerID(): string | undefined {
        for (const player of this.players.values())
            if (player.status !== PlayerStatus.DISCONNECTED) return player.id;

        return undefined;
    }

    getPlayer(id: string): Player | undefined {
        return this.players.get(id);
    }

    allPlayersDisconnected(): boolean {
        if (this.players.size === 0) return true;
        for (const player of this.players.values())
            if (player.status !== PlayerStatus.DISCONNECTED) return false;

        return true;
    }

    tryStartRoom(currentTime: number = Date.now()): boolean {
        if (this.status !== RoomStatus.LOBBY) return false;

        if (
            this.game.config.playerAssignment === "random" &&
            !randomizeMatchPlayers(
                this.game.matches,
                this.connectedPlayers(),
            )
        )
            return false;

        for (const match of this.game.matches)
            if (!match.whitePlayer || !match.blackPlayer) return false;

        this.status = RoomStatus.PLAYING;

        for (const match of this.game.matches) {
            const startingTime = this.game.config.timeBase * 1000;
            match.whiteTime = startingTime;
            match.blackTime = startingTime;
            match.lastMoveTime = currentTime;
            resetMatchChess(match, this.game.config.initialBoard);
        }

        return true;
    }

    private connectedPlayers(): Player[] {
        return [...this.players.values()].filter(
            (player) => player.status !== PlayerStatus.DISCONNECTED,
        );
    }

    endRoom(winner?: Team): void {
        this.status = RoomStatus.LOBBY;

        if (winner) {
            const playersOnTeam = [];
            for (const match of this.game.matches)
                playersOnTeam.push(match.getPlayerTeam(winner));

            for (const player of this.players.values()) {
                if (playersOnTeam.includes(player)) player.wins++;
                player.total++;
            }
        }

        for (const player of this.players.values())
            if (player.status === PlayerStatus.DISCONNECTED)
                this.removePlayerFromBoards(player.id);
    }

    updateConfig(config: Partial<GameConfig>): boolean {
        let changed = false;
        let matchNumChanged = false;
        let timeBaseChanged = false;

        if (typeof config.matchNum === "number") {
            const matchNum = clampInteger(
                config.matchNum,
                minMatches,
                maxMatches,
            );
            if (this.game.config.matchNum !== matchNum) {
                this.game.config.matchNum = matchNum;
                changed = true;
                matchNumChanged = true;
            }
        }

        if (typeof config.timeBase === "number") {
            const timeBase = clampInteger(
                config.timeBase,
                minTimeBase,
                maxTimeBase,
            );
            if (this.game.config.timeBase !== timeBase) {
                this.game.config.timeBase = timeBase;
                changed = true;
                timeBaseChanged = true;
            }
        }

        if (typeof config.timeBonus === "number") {
            const timeBonus = clampInteger(
                config.timeBonus,
                minTimeBonus,
                maxTimeBonus,
            );
            if (this.game.config.timeBonus !== timeBonus) {
                this.game.config.timeBonus = timeBonus;
                changed = true;
            }
        }

        if (
            (config.timeType === "increment" || config.timeType === "delay") &&
            this.game.config.timeType !== config.timeType
        ) {
            this.game.config.timeType = config.timeType;
            changed = true;
        }

        if (
            typeof config.timeShared === "boolean" &&
            this.game.config.timeShared !== config.timeShared
        ) {
            this.game.config.timeShared = config.timeShared;
            changed = true;
        }

        if (
            typeof config.initialBoard === "string" &&
            config.initialBoard.trim().length > 0 &&
            this.game.config.initialBoard !== config.initialBoard
        ) {
            this.game.config.initialBoard = config.initialBoard.trim();
            changed = true;
        }

        if (
            (config.playerAssignment === "manual" ||
                config.playerAssignment === "random") &&
            this.game.config.playerAssignment !== config.playerAssignment
        ) {
            this.game.config.playerAssignment = config.playerAssignment;
            changed = true;
        }

        if (
            (config.pocketShare === "color" ||
                config.pocketShare === "shared" ||
                config.pocketShare === "none") &&
            this.game.config.pocketShare !== config.pocketShare
        ) {
            this.game.config.pocketShare = config.pocketShare;
            changed = true;
        }

        if (
            (config.dropAggression === "no-check" ||
                config.dropAggression === "no-mate" ||
                config.dropAggression === "mate") &&
            this.game.config.dropAggression !== config.dropAggression
        ) {
            this.game.config.dropAggression = config.dropAggression;
            changed = true;
        }

        if (
            (config.promotionType === "upgrade" ||
                config.promotionType === "steal") &&
            this.game.config.promotionType !== config.promotionType
        ) {
            this.game.config.promotionType = config.promotionType;
            changed = true;
        }

        if (
            typeof config.pawnDropRanks === "string" &&
            isValidPawnDropRanks(config.pawnDropRanks) &&
            this.game.config.pawnDropRanks !== config.pawnDropRanks
        ) {
            this.game.config.pawnDropRanks = config.pawnDropRanks;
            changed = true;
        }

        if (!changed) return false;

        if (matchNumChanged) this.rebuildMatches();
        else if (timeBaseChanged) this.updateLobbyMatchTimes();

        return true;
    }

    private rebuildMatches(): void {
        const oldMatches = this.game.matches;
        const startingTime = this.game.config.timeBase * 1000;
        const matches: Match[] = [];

        for (let index = 0; index < this.game.config.matchNum; index++) {
            const existing = oldMatches[index];
            const match = existing ?? new Match(startingTime, index % 2 === 1);

            if (!existing) {
                match.whiteTime = startingTime;
                match.blackTime = startingTime;
                match.lastMoveTime = Date.now();
                resetMatchChess(match, this.game.config.initialBoard);
                match.queued = { moves: [], color: Color.WHITE };
                match.flipped = index % 2 === 1;
            }

            matches.push(match);
        }

        this.game.matches = matches;
    }

    private updateLobbyMatchTimes(): void {
        const startingTime = this.game.config.timeBase * 1000;
        for (const match of this.game.matches) {
            match.whiteTime = startingTime;
            match.blackTime = startingTime;
            match.lastMoveTime = Date.now();
        }
    }
}

export class Game {
    config: GameConfig;
    matches: Match[];

    constructor() {
        this.config = new GameConfig();
        this.matches = [];
    }

    serialize(): SerializedGame {
        return {
            config: this.config.serialize(),
            matches: this.matches.map((match) => match.serialize()),
        };
    }

    static deserialize(data: SerializedGame): Game {
        const state = new Game();
        state.config = GameConfig.deserialize(data.config ?? {});
        state.matches = data.matches.map((matchData) =>
            Match.deserialize(matchData),
        );
        return state;
    }

    getFinalChess(matchIndex: number): Chess {
        const chess = this.matches[matchIndex].chess.clone();
        for (const move of this.matches[matchIndex].queued.moves)
            chess.doMove(move, true);

        return chess;
    }

    doMove(matchIndex: number, move: Move): void {
        const match = this.matches[matchIndex];
        const result = match.chess.doMove(move);
        this.moveResultEffects(matchIndex, move, result);
    }

    private moveResultEffects(
        matchID: number,
        move: Move,
        result: MoveResult,
    ): void {
        if (result.captured) {
            for (let index = 0; index < this.matches.length; index++) {
                if (index === matchID) continue;
                if (
                    this.matches[index].flipped ===
                    this.matches[matchID].flipped
                )
                    continue;

                this.matches[index].chess.addToPocket({
                    type: result.captured.type,
                    color: result.captured.color,
                });
            }
        }

        if (move.from.loc === "pocket") {
            for (let index = 0; index < this.matches.length; index++) {
                if (index === matchID) continue;
                if (
                    this.matches[index].flipped !==
                    this.matches[matchID].flipped
                )
                    continue;

                this.matches[index].chess.removeFromPocket(
                    move.from.type,
                    move.from.color,
                );
            }
        }
    }

    updateTime(currentTime: number = Date.now()): void {
        for (const match of this.matches) match.updateTime(currentTime);
    }

    checkTimeout(): { team: Team; player: Player } | undefined {
        let minTime = Infinity;
        let minSide: Team | undefined;
        let minPlayer: Player | undefined;

        for (const match of this.matches) {
            if ((match.flipped ? match.blackTime : match.whiteTime) < minTime) {
                minTime = match.flipped ? match.blackTime : match.whiteTime;
                minSide = Team.BLUE;
                minPlayer = match.flipped
                    ? match.blackPlayer
                    : match.whitePlayer;
            }

            if ((match.flipped ? match.whiteTime : match.blackTime) < minTime) {
                minTime = match.flipped ? match.whiteTime : match.blackTime;
                minSide = Team.RED;
                minPlayer = match.flipped
                    ? match.whitePlayer
                    : match.blackPlayer;
            }
        }

        return minTime > 0 || !minSide || !minPlayer
            ? undefined
            : { team: minSide, player: minPlayer };
    }
}

function clampInteger(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.round(value)));
}

function isValidPawnDropRanks(value: string): boolean {
    const match = value.match(/^([1-7])-([1-7])$/);
    if (!match) return false;

    return Number(match[1]) <= Number(match[2]);
}

function resetMatchChess(
    match: Match,
    initialBoard: GameConfig["initialBoard"],
): void {
    void initialBoard;
    match.chess.reset();
}

/**
 * Randomly assigns every available player to exactly one team. Players may cover
 * multiple boards, but their assignments are balanced within their team and
 * always form one contiguous run of board indexes.
 */
export function randomizeMatchPlayers(
    matches: Match[],
    availablePlayers: Player[],
    random: () => number = Math.random,
): boolean {
    const playersByID = new Map<string, Player>();
    for (const player of availablePlayers) playersByID.set(player.id, player);

    for (const match of matches) {
        if (
            match.whitePlayer &&
            match.whitePlayer.status !== PlayerStatus.DISCONNECTED
        )
            playersByID.set(match.whitePlayer.id, match.whitePlayer);
        if (
            match.blackPlayer &&
            match.blackPlayer.status !== PlayerStatus.DISCONNECTED
        )
            playersByID.set(match.blackPlayer.id, match.blackPlayer);
    }

    const players = shuffle([...playersByID.values()], random);
    if (players.length < 2 || players.length > matches.length * 2) return false;

    // A team cannot contain more players than it has board positions. Keeping
    // the team sizes as close as possible also minimizes assignment imbalance.
    const smallerTeamSize = Math.floor(players.length / 2);
    const redCount =
        smallerTeamSize +
        (players.length % 2 === 1 && random() < 0.5 ? 1 : 0);
    const redPlayers = players.slice(0, redCount);
    const bluePlayers = players.slice(redCount);

    assignTeamBoards(matches, Team.RED, redPlayers, random);
    assignTeamBoards(matches, Team.BLUE, bluePlayers, random);
    return true;
}

function assignTeamBoards(
    matches: Match[],
    team: Team,
    players: Player[],
    random: () => number,
): void {
    const orderedPlayers = shuffle(players, random);
    const minimumBoards = Math.floor(matches.length / orderedPlayers.length);
    let extraBoards = matches.length % orderedPlayers.length;
    let boardIndex = 0;

    for (const player of orderedPlayers) {
        const boardCount = minimumBoards + (extraBoards-- > 0 ? 1 : 0);
        for (let offset = 0; offset < boardCount; offset++)
            setMatchPlayerTeam(matches[boardIndex++], team, player);
    }
}

function setMatchPlayerTeam(match: Match, team: Team, player: Player): void {
    if ((team === Team.BLUE) === match.flipped) match.whitePlayer = player;
    else match.blackPlayer = player;
}

function shuffle<T>(items: T[], random: () => number): T[] {
    for (let index = items.length - 1; index > 0; index--) {
        const target = Math.floor(random() * (index + 1));
        [items[index], items[target]] = [items[target], items[index]];
    }
    return items;
}

export class Match {
    chess: Chess;
    whitePlayer: Player | undefined;
    blackPlayer: Player | undefined;
    whiteTime: number;
    blackTime: number;
    queued: { moves: Move[]; color: Color };
    lastMoveTime: number | undefined;
    flipped: boolean; // normal has bottom as white

    constructor(time: number = 0, flipped: boolean = false) {
        this.chess = new Chess();
        this.whitePlayer = undefined;
        this.blackPlayer = undefined;
        this.whiteTime = time;
        this.blackTime = time;
        this.queued = { moves: [], color: Color.WHITE };
        this.lastMoveTime = Date.now();
        this.flipped = flipped;
    }

    serialize(): SerializedMatch {
        return {
            chess: this.chess.serialize(),
            whitePlayer: this.whitePlayer,
            blackPlayer: this.blackPlayer,
            whiteTime: this.whiteTime,
            blackTime: this.blackTime,
            queued: this.queued,
            lastMoveTime: this.lastMoveTime,
            flipped: this.flipped,
        };
    }

    static deserialize(data: SerializedMatch): Match {
        const match = new Match();
        match.chess = Chess.deserialize(data.chess);
        match.whitePlayer = data.whitePlayer;
        match.blackPlayer = data.blackPlayer;
        match.whiteTime = data.whiteTime;
        match.blackTime = data.blackTime;
        match.queued = data.queued;
        match.lastMoveTime = data.lastMoveTime;
        match.flipped = data.flipped;
        return match;
    }

    getPlayer(color: Color): Player | undefined {
        return color ? this.whitePlayer : this.blackPlayer;
    }

    getTeam(color: Color): Team {
        return (color === Color.WHITE) === this.flipped ? Team.BLUE : Team.RED;
    }

    getPlayerTeam(team: Team): Player | undefined {
        return (team === Team.BLUE) === this.flipped
            ? this.whitePlayer
            : this.blackPlayer;
    }

    setPlayer(player: Player, color: Color): void {
        if (color) this.whitePlayer = player;
        else this.blackPlayer = player;
    }

    removePlayer(color: Color): void {
        if (color) this.whitePlayer = undefined;
        else this.blackPlayer = undefined;
    }

    updateTime(currentTime: number = Date.now()): void {
        if (!this.lastMoveTime) return;

        const elapsed = currentTime - this.lastMoveTime;
        if (this.chess.turn) this.whiteTime -= elapsed;
        else this.blackTime -= elapsed;

        this.lastMoveTime = currentTime;
    }
}
