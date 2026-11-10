import { Chess, Color, PieceType, invertColor, type Move, type MoveRules } from "./chess";
import { botLegalMoves } from "./bot-position";
import type { Room } from "./room";

/** A small policy surface: speed changes tempo, not engine strength. */
export const BOT_PACING = {
    movesPerClock: 60,
    clockReserveFraction: 1 / 20,
    defaultSpeed: 5,
    speedDoublingLevels: 4,
    waitingTurns: 4,
};

export function botMoveDelay(remaining: number, base: number, speed: number, choices: number, random = Math.random()): number {
    const tempo = 2 ** ((BOT_PACING.defaultSpeed - speed) / BOT_PACING.speedDoublingLevels);
    const complexity = choices <= 1 ? 0.5 : 1;
    const budget = Math.sqrt(Math.max(0, remaining) * Math.max(0, base)) / BOT_PACING.movesPerClock;
    return Math.max(0, Math.min(remaining * BOT_PACING.clockReserveFraction,
        budget * tempo * complexity * (0.5 + random)));
}

export function botWaitBudget(remaining: number, delay: number): number {
    return Math.max(0, Math.min(remaining * BOT_PACING.clockReserveFraction, delay * BOT_PACING.waitingTurns));
}

/** Work on copies; speculative pieces must never enter the actual position. */
function matingDrop(chess: Chess, color: Color, type: PieceType, rules: MoveRules): boolean {
    const copy = chess.clone();
    copy.turn = color;
    copy.getPocket(color).set(type, (copy.getPocket(color).get(type) ?? 0) + 1);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const move: Move = { from: { loc: "pocket", color, type }, to: { loc: "board", row, col } };
        if (!copy.isLegal(move, false, rules)) continue;
        const after = copy.clone();
        after.doMove(move, false, rules);
        if (after.isCheckmate(rules)) return true;
    }
    return false;
}

export interface BotWaitReason {
    kind: "await-piece" | "avoid-feeding-mate";
    board: number;
    piece: PieceType;
}

/** Conservative team coordination, based only on visible legal captures and mate. */
export function botWaitReason(room: Room, board: number, move: Move): BotWaitReason | undefined {
    if (room.game.config.pocketShare === "shared") return;
    const match = room.game.matches[board];
    const color = match.chess.turn;
    const team = match.getTeam(color);
    const rules = room.game.getMoveRules();
    const afterMove = match.chess.clone();
    afterMove.doMove(move, false, rules);
    if (afterMove.isCheckmate(rules)) return;
    // Our captures feed our own team. It is the opponent's reply that can
    // feed their partner, including a recapture of the piece we just moved.
    const fedTypes = new Set<PieceType>();
    for (const reply of botLegalMoves(afterMove, rules).values()) {
        const victim = afterMove.getPiece(reply.to);
        const enPassant = reply.from.loc === "board" && reply.to.loc === "board" &&
            afterMove.getPiece(reply.from)?.type === PieceType.PAWN && reply.from.col !== reply.to.col && !victim;
        if (victim && victim.color === color)
            fedTypes.add(victim.type === PieceType.PROMOTED_QUEEN ? PieceType.PAWN : victim.type);
        else if (enPassant) fedTypes.add(PieceType.PAWN);
    }
    for (const [index, partner] of room.game.matches.entries()) {
        if (index === board) continue;
        if (room.game.config.pocketShare === "none" &&
            !room.game.getCaptureRecipientBoards(board).includes(index)) continue;
        const ally = partner.getTeam(Color.WHITE) === team ? Color.WHITE : Color.BLACK;
        // Only an opponent already on move can use an immediate supplied drop.
        if (partner.chess.turn === invertColor(ally)) {
            for (const type of fedTypes)
                if (!(partner.chess.getPocket(partner.chess.turn).get(type) ?? 0) &&
                    matingDrop(partner.chess, partner.chess.turn, type, rules))
                    return { kind: "avoid-feeding-mate", board: index, piece: type };
        }
        if (partner.chess.turn !== ally) continue;
        const available = new Set<PieceType>();
        for (const capture of botLegalMoves(partner.chess, rules).values()) {
            const victim = partner.chess.getPiece(capture.to);
            if (victim && victim.color !== ally)
                available.add(victim.type === PieceType.PROMOTED_QUEEN ? PieceType.PAWN : victim.type);
        }
        for (const type of available) {
            if ((match.chess.getPocket(color).get(type) ?? 0) > 0) continue;
            if (matingDrop(match.chess, color, type, rules))
                return { kind: "await-piece", board: index, piece: type };
        }
    }
}
