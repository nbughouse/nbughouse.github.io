import assert from "node:assert/strict";
import test from "node:test";
import { botMoveDelay, botWaitBudget, botWaitReason } from "../../shared/src/bot-timing";
import { configureBotRoom, submitBotRoomMove, updateBotRoomSettings, validBotOptions } from "../../shared/src/bots";
import { Chess, Color, PieceType, type Move } from "../../shared/src/chess";
import { Player } from "../../shared/src/player";
import { Room, RoomStatus } from "../../shared/src/room";
import { BotScheduler } from "../../public/src/bot-scheduler";

function room() {
    const room = new Room("BOTS", "host");
    configureBotRoom(room, { boards: 3, level: 5, speed: 5 }, new Player("host"));
    room.tryStartRoom(1000);
    // Scheduler scenarios below choose arbitrary engine seats independently of lobby teams.
    // Give each seat its own player so toggling one engine never changes another seat.
    for (const [board, match] of room.game.matches.entries()) {
        for (const color of [Color.WHITE, Color.BLACK]) {
            const player = new Player(`timing:${board}:${color}`);
            player.isBot = board !== 0 || color !== Color.WHITE;
            match.setPlayer(player, color);
        }
    }
    return room;
}
function empty() {
    const chess = new Chess();
    chess.board = chess.board.map(row => row.map(() => undefined));
    chess.whiteCastleShort = chess.whiteCastleLong = chess.blackCastleShort = chess.blackCastleLong = false;
    return chess;
}
function mateSetup() {
    const chess = empty();
    chess.board[2][5] = { type: PieceType.KING, color: Color.WHITE };
    chess.board[0][7] = { type: PieceType.KING, color: Color.BLACK };
    return chess;
}
const kingMove: Move = { from: { loc: "board", row: 2, col: 5 }, to: { loc: "board", row: 3, col: 5 } };

function waitingRoom() {
    const r = room();
    r.game.matches[0].chess = mateSetup();
    r.game.matches[0].whitePlayer!.isBot = true;
    const partner = empty();
    partner.turn = Color.BLACK;
    partner.board[0][7] = { type: PieceType.KING, color: Color.BLACK };
    partner.board[7][7] = { type: PieceType.KING, color: Color.WHITE };
    partner.board[0][0] = { type: PieceType.ROOK, color: Color.BLACK };
    partner.board[6][0] = { type: PieceType.QUEEN, color: Color.WHITE };
    r.game.matches[1].chess = partner;
    return r;
}

test("speed is independent, validated, serialized, and backward compatible", () => {
    const r = room();
    r.status = RoomStatus.LOBBY;
    assert.equal(updateBotRoomSettings(r, {}, 5, 9), true);
    assert.equal(r.botLevel, 5);
    assert.equal(Room.deserialize(r.serialize()).botSpeed, 9);
    const old = r.serialize(); delete old.botSpeed;
    assert.equal(Room.deserialize(old).botSpeed, 5);
    for (const speed of [0, 10, 1.5, NaN, "5", null])
        assert.equal(validBotOptions({ boards: 2, level: 5, speed }), false);
    assert.equal(updateBotRoomSettings(r, { timeBase: 60 }, 5, 10), false);
    assert.equal(r.game.config.timeBase, 180);
});

test("pacing scales with speed, clock, forced moves and bounded variation", () => {
    const delay = (speed: number, remaining = 180000, choices = 20, random = 0.5) =>
        botMoveDelay(remaining, 180000, speed, choices, random);
    assert.ok(delay(1) > delay(5) && delay(5) > delay(9));
    assert.ok(delay(5, 1000) < delay(5));
    assert.ok(delay(5, 180000, 1) < delay(5));
    assert.ok(delay(5, 180000, 20, 0) < delay(5, 180000, 20, 1));
    assert.equal(delay(5, 0), 0);
    assert.ok(botWaitBudget(1000, 3000) < 1000);
});

test("independent turns keep elapsed time through other board moves and pocket changes", () => {
    const r = room(); const scheduler = new BotScheduler(() => 0.5);
    const first = scheduler.next(r, 1000);
    assert.equal(first.kind, "search"); if (first.kind !== "search") return;
    scheduler.accept(r, first, "e2e4");
    const second = scheduler.next(r, 1100);
    assert.equal(second.kind, "search"); if (second.kind !== "search") return;
    scheduler.accept(r, second, "e2e4");
    const wait = scheduler.next(r, 1200);
    assert.equal(wait.kind, "wait"); if (wait.kind !== "wait") return;
    assert.equal(wait.until, 4000);
    r.revision++;
    r.game.matches[first.board].chess.whitePocket.set(PieceType.KNIGHT, 1);
    const refresh = scheduler.next(r, 2000);
    assert.equal(refresh.kind, "search"); if (refresh.kind !== "search") return;
    assert.equal(refresh.board, first.board);
    scheduler.accept(r, refresh, "e2e4");
    assert.equal(scheduler.next(r, 4000).kind, "move");
    scheduler.moved(first.board);
    scheduler.accept(r, first, "e2e4"); // Old search cannot resurrect a completed turn.
    assert.equal(scheduler.next(r, 4000).kind, "move"); // Other board was never delayed.
    scheduler.clear();
    scheduler.accept(r, refresh, "e2e4");
    assert.equal(scheduler.next(r, 4000).kind, "search");
});

test("middle-board bot captures select one recipient and pass move validation", () => {
    const r = room();
    const chess = empty();
    chess.board[7][4] = { type: PieceType.KING, color: Color.WHITE };
    chess.board[0][4] = { type: PieceType.KING, color: Color.BLACK };
    chess.board[4][0] = { type: PieceType.ROOK, color: Color.WHITE };
    chess.board[4][3] = { type: PieceType.KNIGHT, color: Color.BLACK };
    r.game.matches[1].chess = chess;
    r.game.matches[2].whitePlayer!.isBot = false;
    const scheduler = new BotScheduler(() => 0.5);
    const search = scheduler.next(r, 1000);
    assert.equal(search.kind, "search"); if (search.kind !== "search") return;
    assert.equal(search.board, 1);
    scheduler.accept(r, search, "a4d4");
    const action = scheduler.next(r, 4000);
    assert.equal(action.kind, "move"); if (action.kind !== "move") return;
    assert.equal(action.move.captureRecipient, 0);
    assert.ok(submitBotRoomMove(r, "host", action.board, Color.WHITE, action.move, 4000, r.revision)?.moved);
    assert.equal(r.game.matches[0].chess.blackPocket.get(PieceType.KNIGHT), 1);
    assert.equal(r.game.matches[2].chess.whitePocket.get(PieceType.KNIGHT) ?? 0, 0);
});

test("waiting requires a visible incoming mating piece and leaves real pockets untouched", () => {
    const r = waitingRoom();
    const before = structuredClone(r.serialize());
    assert.deepEqual(botWaitReason(r, 0, kingMove), { kind: "await-piece", board: 1, piece: PieceType.QUEEN });
    assert.deepEqual(structuredClone(r.serialize()), before);
    r.game.matches[1].chess.board[6][0] = undefined;
    assert.equal(botWaitReason(r, 0, kingMove), undefined);
});

test("waiting expires, and vanished opportunities release the move immediately", () => {
    const r = waitingRoom(); const scheduler = new BotScheduler(() => 0.5);
    for (let n = 0; n < 3; n++) {
        const a = scheduler.next(r, 1000);
        if (a.kind === "search") scheduler.accept(r, a, a.board === 0 ? "f6f5" : [...a.legal.keys()][0]);
    }
    const action = scheduler.next(r, 4000);
    assert.ok(action.kind === "move" && action.board !== 0); // Partner keeps playing.
    r.game.matches[1].whitePlayer!.isBot = false;
    r.game.matches[1].blackPlayer!.isBot = false;
    r.game.matches[2].whitePlayer!.isBot = false;
    const wait = scheduler.next(r, 4000);
    assert.equal(wait.kind, "wait"); if (wait.kind !== "wait") return;
    assert.ok(wait.until > 4000 && wait.until < 180000);
    assert.equal(scheduler.next(r, wait.until).kind, "move");
    r.game.matches[1].chess.board[6][0] = undefined;
    r.revision++;
    assert.equal(scheduler.next(r, 4001).kind, "move");
});

test("a move may wait when an opponent's recapture would supply a mating drop", () => {
    const r = room();
    const chess = empty();
    chess.board[7][7] = { type: PieceType.KING, color: Color.WHITE };
    chess.board[0][7] = { type: PieceType.KING, color: Color.BLACK };
    chess.board[7][0] = { type: PieceType.QUEEN, color: Color.WHITE };
    chess.board[6][0] = { type: PieceType.PAWN, color: Color.BLACK };
    chess.board[0][0] = { type: PieceType.ROOK, color: Color.BLACK };
    r.game.matches[0].chess = chess;
    r.game.matches[1].chess = mateSetup();
    const capture: Move = { from: { loc: "board", row: 7, col: 0 }, to: { loc: "board", row: 6, col: 0 } };
    assert.deepEqual(botWaitReason(r, 0, capture), { kind: "avoid-feeding-mate", board: 1, piece: PieceType.QUEEN });
    chess.board[0][0] = undefined;
    assert.equal(botWaitReason(r, 0, capture), undefined); // Our own capture supplies our team.
    chess.board[0][0] = { type: PieceType.ROOK, color: Color.BLACK };
    r.game.matches[1].chess.whitePocket.set(PieceType.QUEEN, 1);
    assert.equal(botWaitReason(r, 0, capture), undefined);
});

test("only one teammate waits, and a mating move never waits", () => {
    const r = waitingRoom();
    r.game.matches[2].chess = mateSetup();
    const scheduler = new BotScheduler(() => 0.5);
    for (let n = 0; n < 3; n++) {
        const a = scheduler.next(r, 1000);
        assert.equal(a.kind, "search"); if (a.kind !== "search") return;
        scheduler.accept(r, a, a.board === 1 ? [...a.legal.keys()][0] : "f6f5");
    }
    const partner = scheduler.next(r, 4000);
    assert.equal(partner.kind, "move"); if (partner.kind !== "move") return;
    assert.equal(partner.board, 1);
    r.game.matches[1].blackPlayer!.isBot = false;
    const other = scheduler.next(r, 4000);
    assert.equal(other.kind, "move"); if (other.kind !== "move") return;
    assert.equal(other.board, 2);
    const chess = r.game.matches[0].chess;
    chess.whitePocket.set(PieceType.QUEEN, 1);
    const mate: Move = { from: { loc: "pocket", color: Color.WHITE, type: PieceType.QUEEN }, to: { loc: "board", row: 1, col: 6 } };
    assert.equal(botWaitReason(r, 0, mate), undefined);
});

test("clock emergencies shorten deadlines and game end cancels planned moves", () => {
    const r = room(); const scheduler = new BotScheduler(() => 0.5);
    for (let n = 0; n < 2; n++) {
        const a = scheduler.next(r, 1000);
        if (a.kind === "search") scheduler.accept(r, a, "e2e4");
    }
    for (const m of r.game.matches) { m.whiteTime = 100; m.lastMoveTime = 2000; }
    const a = scheduler.next(r, 2000);
    assert.equal(a.kind, "wait"); if (a.kind !== "wait") return;
    assert.ok(a.until <= 2005);
    assert.equal(scheduler.next(r, a.until).kind, "move");
    r.endRoom();
    assert.deepEqual(scheduler.next(r, a.until), { kind: "wait", until: Infinity });
});
