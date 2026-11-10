import { Color, PieceType, isValidPosition, type Move } from "./chess";
import { Player, PlayerStatus } from "./player";
import { Room, RoomStatus, Team } from "./room";
import type { GameConfig } from "./config";

export const BOT_SKILLS = [-20, -15, -10, -5, 0, 5, 10, 15, 20] as const;

export interface BotOptions {
    boards: 2 | 3;
    level: number;
    speed?: number;
    timeBase?: number;
}

export function validBotOptions(value: unknown): value is BotOptions {
    if (!value || typeof value !== "object") return false;
    const options = value as BotOptions;
    return (options.boards === 2 || options.boards === 3) &&
        (options.speed === undefined || validBotSpeed(options.speed)) &&
        Number.isInteger(options.level) && options.level >= 1 && options.level <= 9 &&
        (options.timeBase === undefined || (typeof options.timeBase === "number" &&
            Number.isFinite(options.timeBase) && options.timeBase >= 30 && options.timeBase <= 3600));
}

export function validBotSpeed(speed: number): boolean {
    return Number.isInteger(speed) && speed >= 1 && speed <= 9;
}

export function configureBotRoom(room: Room, options: BotOptions, host: Player): void {
    room.kind = "bot";
    room.botLevel = options.level;
    room.botSpeed = options.speed ?? 5;
    room.addPlayer(host);
    room.updateConfig({ matchNum: options.boards, timeBase: options.timeBase ?? 180, playerAssignment: "manual", pocketShare: "color" });
    room.game.matches[0].setPlayer(host, Color.WHITE);
    fillBotSeats(room);
}

/** Humans always play red; computers always play blue. */
export function isHumanBotSeat(room: Room, boardID: number, color: Color): boolean {
    return Number.isInteger(boardID) && (color === Color.WHITE || color === Color.BLACK) &&
        room.game.matches[boardID]?.getTeam(color) === Team.RED;
}

export function assignBotRoomHuman(room: Room, playerID: string, boardID: number, color: Color): boolean {
    const player = room.getPlayer(playerID);
    if (room.kind !== "bot" || room.status !== RoomStatus.LOBBY ||
        !player || player.isBot || player.status === PlayerStatus.DISCONNECTED ||
        !isHumanBotSeat(room, boardID, color)) return false;
    player.status = PlayerStatus.CONNECTED;
    room.game.matches[boardID].setPlayer(player, color);
    fillBotSeats(room);
    return true;
}

/** Preserve human assignments and share uncovered boards between humans. */
export function fillBotSeats(room: Room): void {
    if (room.kind !== "bot" || room.status !== RoomStatus.LOBBY) return;
    const humans = [...room.players.values()].filter(player =>
        !player.isBot && player.status === PlayerStatus.CONNECTED);
    let nextHuman = 0;
    for (const match of room.game.matches) {
        for (const color of [Color.WHITE, Color.BLACK]) {
            const current = match.getPlayer(color);
            if (match.getTeam(color) === Team.RED) {
                if (current && humans.includes(current)) continue;
                match.removePlayer(color);
                if (humans.length) match.setPlayer(humans[nextHuman++ % humans.length], color);
                continue;
            }
            if (current?.isBot) continue;
            match.removePlayer(color);
            const id = `bot:${room.game.matches.indexOf(match)}:${color}`;
            let bot = room.players.get(id);
            if (!bot) {
                bot = new Player(id, `Bot_L${room.botLevel}`);
                bot.isBot = true;
                room.players.set(id, bot);
            }
            match.setPlayer(bot, color);
        }
    }
    const seated = new Set(room.game.matches.flatMap(match =>
        [match.whitePlayer?.id, match.blackPlayer?.id]));
    for (const player of room.players.values())
        if (player.isBot && !seated.has(player.id)) room.players.delete(player.id);
}

/** Only settings supported by the browser engine are editable in bot lobbies. */
export function updateBotRoomSettings(room: Room, settings: Partial<GameConfig>, level = room.botLevel, speed = room.botSpeed): boolean {
    if (room.kind !== "bot" || room.status !== RoomStatus.LOBBY || !settings ||
        !Number.isInteger(level) || level < 1 || level > 9 || !validBotSpeed(speed)) return false;
    const supported: Partial<GameConfig> = {};
    if (settings.matchNum === 2 || settings.matchNum === 3) supported.matchNum = settings.matchNum;
    if (typeof settings.timeBase === "number" && Number.isFinite(settings.timeBase))
        supported.timeBase = settings.timeBase;
    const changed = room.updateConfig(supported);
    const levelChanged = room.botLevel !== level;
    const speedChanged = room.botSpeed !== speed;
    if (!changed && !levelChanged && !speedChanged) return false;
    room.botSpeed = speed;
    room.botLevel = level;
    fillBotSeats(room);
    for (const bot of room.players.values())
        if (bot.isBot) bot.name = `Bot_L${level}`;
    return changed || levelChanged || speedChanged;
}

export interface BotMoveResult {
    moved: boolean;
    end?: { winner?: Team; reason: string };
}

/** The same authority checks and rules run locally and in friends sessions. */
export function submitBotRoomMove(
    room: Room, actorID: string, boardID: number, color: Color,
    move: Move, now: number, botRevision?: number,
): BotMoveResult | undefined {
    if (room.kind !== "bot" || room.status !== RoomStatus.PLAYING ||
        !Number.isInteger(boardID) || (color !== Color.WHITE && color !== Color.BLACK) ||
        !move || !isValidPosition(move.from) || !isValidPosition(move.to)) return;
    const match = room.game.matches[boardID];
    const player = match?.getPlayer(color);
    if (!match || !player) return;
    if (player.isBot) {
        if (actorID !== room.hostID || botRevision !== room.revision) return;
    } else if (player.id !== actorID || botRevision !== undefined) return;
    if (match.chess.turn !== color || match.chess.getPiece(move.from)?.color !== color ||
        !match.chess.isLegal(move, false, room.game.getMoveRules()) ||
        !room.game.canMove(boardID, move, now)) return;
    room.game.updateTime(now);
    const timeout = room.game.checkTimeout();
    if (timeout) return { moved: false, end: {
        winner: timeout.team === Team.RED ? Team.BLUE : Team.RED, reason: "Time expired.",
    } };
    room.game.doMove(boardID, move, now);
    room.revision++;
    if (match.chess.isCheckmate()) return { moved: true, end: {
        winner: match.getTeam(color), reason: `Checkmate on board ${boardID + 1}.`,
    } };
    const repeated = room.game.checkThreefoldRepetition();
    if (repeated !== undefined) return { moved: true, end: {
        reason: `Draw by threefold repetition on board ${repeated + 1}.`,
    } };
    return { moved: true };
}

export function botPromotion(type: string): PieceType | undefined {
    return ({ q: PieceType.QUEEN, r: PieceType.ROOK, b: PieceType.BISHOP, n: PieceType.KNIGHT } as Record<string, PieceType>)[type];
}
