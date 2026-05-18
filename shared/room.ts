import { Chat } from "./chat";
import type { Move, MoveResult, SerializedChess } from "./chess";
import { Chess, Color } from "./chess";
import { GameConfig } from "./config";
import type { Player } from "./player";
import { PlayerStatus } from "./player";

const defaultTime = 180_000; // 3 minutes in milliseconds

export enum RoomStatus {
    LOBBY = "lobby",
    PLAYING = "playing",
}

export interface RoomListing {
    code: string;
    numPlayers: number;
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
    matches: SerializedMatch[];
}

export interface SerializedRoom {
    code: string;
    status: RoomStatus;
    game: SerializedGame;
    chat: string;
    players: Record<string, Player>;
}

export class Room {
    code: string;
    players: Map<string, Player>;
    status: RoomStatus;
    game: Game;
    chat: Chat;

    constructor(code: string) {
        this.code = code;
        this.players = new Map();
        this.status = RoomStatus.LOBBY;
        this.game = new Game();
        this.chat = new Chat();

        // Initialize two chess games for the room
        this.game.matches.push(
            new Match(defaultTime, false),
            new Match(defaultTime, true),
            new Match(defaultTime, false),
            // new Match(defaultTime, true)
            // new Match(defaultTime, false)
        );
    }

    serialize(): SerializedRoom {
        const serializedPlayers: Record<string, Player> = {};
        for (const [id, player] of this.players.entries())
            serializedPlayers[id] = player;

        return {
            code: this.code,
            status: this.status,
            game: this.game.serialize(),
            chat: this.chat.serialize(),
            players: serializedPlayers,
        };
    }

    static deserialize(data: SerializedRoom): Room {
        const room = new Room(data.code);
        room.status = data.status;
        room.game = Game.deserialize(data.game);
        room.chat = Chat.deserialize(data.chat);

        const playersData = data.players;
        for (const [id, playerData] of Object.entries(playersData))
            room.players.set(id, playerData);

        return room;
    }

    getRoomListing(): RoomListing {
        return {
            code: this.code,
            numPlayers: this.players.size,
        };
    }

    addPlayer(player: Player): void {
        this.players.set(player.id, player);
    }

    removePlayer(id: string): void {
        this.players.delete(id);

        for (const match of this.game.matches) {
            if (match.whitePlayer?.id === id) match.whitePlayer = undefined;
            if (match.blackPlayer?.id === id) match.blackPlayer = undefined;
        }
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
        for (const match of this.game.matches) {
            if (!match.whitePlayer || !match.blackPlayer) return false;
            if (
                match.whitePlayer.status !== PlayerStatus.READY ||
                match.blackPlayer.status !== PlayerStatus.READY
            )
                return false;
        }

        this.status = RoomStatus.PLAYING;

        for (const match of this.game.matches) {
            match.whiteTime = defaultTime;
            match.blackTime = defaultTime;
            match.lastMoveTime = currentTime;
            match.chess.reset();
        }

        return true;
    }

    endRoom(winner?: Team): void {
        this.status = RoomStatus.LOBBY;

        for (const player of this.players.values()) {
            if (player.status === PlayerStatus.DISCONNECTED)
                this.removePlayer(player.id);
            else player.status = PlayerStatus.NOT_READY;
        }

        if (!winner) return;

        const playersOnTeam = [];
        for (const match of this.game.matches)
            playersOnTeam.push(match.getPlayerTeam(winner));

        for (const player of this.players.values()) {
            if (playersOnTeam.includes(player)) player.wins++;
            player.total++;
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
            matches: this.matches.map((match) => match.serialize()),
        };
    }

    static deserialize(data: SerializedGame): Game {
        const state = new Game();
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
