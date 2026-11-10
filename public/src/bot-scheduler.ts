import { botFen, botLegalMoves } from "@shared/bot-position";
import { botMoveDelay, botWaitBudget, botWaitReason, BOT_PACING, type BotWaitReason } from "@shared/bot-timing";
import type { Move } from "@shared/chess";
import { RoomStatus, type Room } from "@shared/room";

interface TurnPlan {
    due: number;
    deadline: number;
    fen: string;
    move?: Move;
    assessedRevision?: number;
    reason?: BotWaitReason;
}
type BotAction =
    | { kind: "move"; board: number; move: Move }
    | { kind: "search"; board: number; fen: string; legal: Map<string, Move>; plan: TurnPlan }
    | { kind: "wait"; until: number };

/** One timeline per board; the host owns the single wake timer and engine. */
export class BotScheduler {
    private plans = new Map<number, TurnPlan>();
    private room?: Room;
    private lastBoard = -1;
    constructor(private random = Math.random) {}

    clear(): void { this.plans.clear(); this.room = undefined; }
    moved(board: number): void { this.plans.delete(board); }

    next(room: Room, now: number): BotAction {
        if (this.room !== room) { this.clear(); this.room = room; }
        if (room.status !== RoomStatus.PLAYING) { this.clear(); return { kind: "wait", until: Infinity }; }
        const active: number[] = [];
        for (const [board, match] of room.game.matches.entries()) {
            if (!match.getPlayer(match.chess.turn)?.isBot) { this.plans.delete(board); continue; }
            active.push(board);
            const fen = botFen(match.chess);
            let plan = this.plans.get(board);
            const remaining = Math.max(0, (match.chess.turn ? match.whiteTime : match.blackTime) -
                Math.max(0, now - (match.lastMoveTime ?? now)));
            if (!plan) {
                const delay = botMoveDelay(remaining, room.game.config.timeBase * 1000, room.botSpeed, 2, this.random());
                plan = { due: now + delay, deadline: now + delay + botWaitBudget(remaining, delay), fen };
                this.plans.set(board, plan);
            } else if (plan.fen !== fen) {
                // Revalidate pockets without resetting elapsed thinking time.
                plan.fen = fen;
                plan.move = undefined;
                plan.assessedRevision = undefined;
            }
            plan.deadline = Math.min(plan.deadline, now + remaining * BOT_PACING.clockReserveFraction);
            plan.due = Math.min(plan.due, plan.deadline);
        }
        let until = Infinity;
        const waitingTeams = new Set();
        for (const board of active) {
            const plan = this.plans.get(board)!;
            if (!plan.move) continue;
            if (now < plan.due) { until = Math.min(until, plan.due); continue; }
            if (plan.assessedRevision !== room.revision) {
                plan.reason = botWaitReason(room, board, plan.move);
                plan.assessedRevision = room.revision;
            }
            const match = room.game.matches[board];
            const team = match.getTeam(match.chess.turn);
            if (plan.reason && !waitingTeams.has(team) && now < plan.deadline) {
                waitingTeams.add(team);
                until = Math.min(until, plan.deadline);
                continue;
            }
            if (!match.chess.isLegal(plan.move, false, room.game.getMoveRules())) {
                plan.move = undefined;
                continue;
            }
            return { kind: "move", board, move: plan.move };
        }
        const order = active.sort((a, b) =>
            ((a - this.lastBoard - 1 + room.game.matches.length) % room.game.matches.length) -
            ((b - this.lastBoard - 1 + room.game.matches.length) % room.game.matches.length));
        for (const board of order) {
            const plan = this.plans.get(board)!;
            if (plan.move) continue;
            this.lastBoard = board;
            const legal = botLegalMoves(room.game.matches[board].chess, room.game.getMoveRules());
            if (!legal.size) continue;
            if (legal.size === 1) plan.due = Math.min(plan.due, now + Math.max(0, plan.due - now) / 2);
            return { kind: "search", board, fen: plan.fen, legal, plan };
        }
        return { kind: "wait", until };
    }

    accept(room: Room, action: Extract<BotAction, { kind: "search" }>, best: string): void {
        if (this.room !== room || this.plans.get(action.board) !== action.plan ||
            botFen(room.game.matches[action.board].chess) !== action.fen) return;
        const move = action.legal.get(best);
        if (!move) throw new Error("The bot engine returned an unsupported move.");
        action.plan.move = room.game.config.pocketShare === "none" && room.game.getCapturedPiece(action.board, move)
            ? { ...move, captureRecipient: room.game.getCaptureRecipientBoards(action.board)[0] }
            : move;
    }
}
