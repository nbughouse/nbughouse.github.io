import assert from "node:assert/strict";
import test from "node:test";
import { Chess, Color, createPosition, MoveType, PieceType, type Move } from "../../shared/src/chess";
import { GameConfig } from "../../shared/src/config";
import { Game, Match, Team } from "../../shared/src/room";
import { commonVariantTests } from "../suites/common";
import { move as gameMove, drop as gameDrop } from "../helpers";

const rules = { duck: true, allowKingCapture: true };
const square = createPosition;
const move = (r: number, c: number, row: number, col: number): Move => ({
    from: square(r, c), to: square(row, col),
});
const duck = (chess: Chess, row: number, col: number): Move => ({
    from: createPosition(chess.turn, PieceType.DUCK), to: square(row, col),
});
function play(chess: Chess, action: Move): void {
    assert.equal(chess.isLegal(action, false, rules), true);
    chess.doMove(action, false, rules);
}
function empty(): Chess {
    const chess = new Chess();
    chess.board = Array.from({ length: 8 }, () => Array(8).fill(undefined));
    return chess;
}

test("each turn requires a chess move followed by a new empty duck square", () => {
    const chess = new Chess();
    assert.equal(chess.isLegal(duck(chess, 4, 3), false, rules), false);
    play(chess, move(6, 4, 4, 4));
    assert.equal(chess.turn, Color.WHITE);
    assert.equal(chess.duckPending, true);
    assert.equal(chess.isLegal(move(6, 3, 4, 3), false, rules), false);
    assert.equal(chess.isLegal(duck(chess, 4, 4), false, rules), false);
    assert.equal(chess.isLegal({ ...duck(chess, 4, 3), from: createPosition(Color.BLACK, PieceType.DUCK) }, false, rules), false);
    play(chess, duck(chess, 4, 3));
    assert.equal(chess.turn, Color.BLACK);
    assert.equal(chess.duckPending, false);
    play(chess, move(1, 4, 3, 4));
    assert.equal(chess.isLegal(duck(chess, 4, 3), false, rules), false);
    play(chess, duck(chess, 5, 4));
    assert.equal(chess.board[4][3], undefined);
    assert.equal(chess.board.flat().filter(p => p?.type === PieceType.DUCK).length, 1);
});

test("duck blocks sliders, pawn moves, captures, and drops, but knights can jump it", () => {
    const chess = empty();
    chess.board[7][0] = { type: PieceType.ROOK, color: Color.WHITE };
    chess.board[5][0] = { type: PieceType.DUCK, color: Color.WHITE };
    assert.equal(chess.isLegal(move(7, 0, 4, 0), false, rules), false);
    assert.equal(chess.isLegal(move(7, 0, 5, 0), false, rules), false);
    assert.equal(chess.isLegal(move(5, 0, 4, 0), false, rules), false);
    chess.board[6][1] = { type: PieceType.PAWN, color: Color.WHITE };
    chess.board[5][1] = { type: PieceType.DUCK, color: Color.BLACK };
    assert.equal(chess.isLegal(move(6, 1, 4, 1), false, rules), false);
    assert.equal(chess.isLegal(move(6, 1, 5, 0), false, rules), false);
    chess.addToPocket({ type: PieceType.KNIGHT, color: Color.WHITE });
    assert.equal(chess.isLegal({ from: createPosition(Color.WHITE, PieceType.KNIGHT), to: square(5, 0) }, false, rules), false);
    chess.board[7][1] = { type: PieceType.KNIGHT, color: Color.WHITE };
    assert.equal(chess.isLegal(move(7, 1, 5, 2), false, rules), true);
});

test("king safety restrictions are lifted, including castling through attack", () => {
    const chess = empty();
    chess.board[7][4] = { type: PieceType.KING, color: Color.WHITE };
    chess.board[7][7] = { type: PieceType.ROOK, color: Color.WHITE };
    chess.board[0][5] = { type: PieceType.ROOK, color: Color.BLACK };
    const castle = move(7, 4, 7, 6);
    assert.equal(chess.isLegal(castle), false);
    assert.equal(chess.getLegalMoveType(castle, false, rules), MoveType.CASTLE);
    play(chess, castle);
    assert.equal(chess.board[7][6]?.type, PieceType.KING);
    assert.equal(chess.board[7][5]?.type, PieceType.ROOK);
    assert.equal(chess.duckPending, true);
    const blocked = empty();
    blocked.board[7][4] = { type: PieceType.KING, color: Color.WHITE };
    blocked.board[7][7] = { type: PieceType.ROOK, color: Color.WHITE };
    blocked.board[7][5] = { type: PieceType.DUCK, color: Color.WHITE };
    assert.equal(blocked.isLegal(castle, false, rules), false);
});

test("duck placement preserves en passant, and a duck on the target blocks it", () => {
    const chess = empty();
    chess.board[3][4] = { type: PieceType.PAWN, color: Color.WHITE };
    chess.board[1][3] = { type: PieceType.PAWN, color: Color.BLACK };
    chess.turn = Color.BLACK;
    play(chess, move(1, 3, 3, 3));
    play(chess, duck(chess, 5, 0));
    assert.equal(chess.isLegal(move(3, 4, 2, 3), false, rules), true);
    const blocked = chess.clone();
    blocked.board[2][3] = { type: PieceType.DUCK, color: Color.WHITE };
    assert.equal(blocked.isLegal(move(3, 4, 2, 3), false, rules), false);
    play(chess, move(3, 4, 2, 3));
    assert.equal(chess.board[3][3], undefined);
});

test("promotion and pocket drops also require a duck placement", () => {
    const chess = empty();
    chess.board[1][0] = { type: PieceType.PAWN, color: Color.WHITE };
    play(chess, { ...move(1, 0, 0, 0), promotion: PieceType.KNIGHT });
    assert.equal(chess.board[0][0]?.type, PieceType.KNIGHT);
    assert.equal(chess.duckPending, true);
    play(chess, duck(chess, 1, 0));
    chess.addToPocket({ type: PieceType.ROOK, color: Color.BLACK });
    play(chess, { from: createPosition(Color.BLACK, PieceType.ROOK), to: square(4, 4) });
    assert.equal(chess.turn, Color.BLACK);
    assert.equal(chess.duckPending, true);
    assert.equal(chess.getPocket(Color.BLACK).has(PieceType.ROOK), false);
});

test("serialization and optimistic two-step moves preserve phase and turn", () => {
    const game = new Game();
    game.config = new GameConfig(2, 180, 0, "increment", false, "960+duck");
    game.matches = [new Match(180000, false), new Match(180000, true)];
    const first = move(6, 4, 4, 4);
    const second = { from: createPosition(Color.WHITE, PieceType.DUCK), to: square(5, 4) };
    game.matches[0].queued.moves = [first, second];
    const predicted = game.getFinalChess(0);
    assert.equal(predicted.turn, Color.BLACK);
    assert.equal(predicted.duckPending, false);
    game.doMove(0, first);
    const restored = Game.deserialize(JSON.parse(JSON.stringify(game.serialize())));
    assert.equal(restored.matches[0].chess.duckPending, true);
    assert.equal(restored.matches[0].chess.isLegal(second, false, restored.getMoveRules()), true);
    restored.doMove(0, second);
    assert.equal(restored.matches[0].chess.turn, Color.BLACK);
    assert.equal(restored.matches[1].chess.getPocket(Color.WHITE).has(PieceType.DUCK), false);
    assert.equal(game.matches[0].chess.clone().duckPending, true);
    restored.matches[0].chess.reset();
    assert.equal(restored.matches[0].chess.duckPending, false);
    assert.equal(restored.matches[0].chess.board.flat().some(p => p?.type === PieceType.DUCK), false);
});

test("king capture wins immediately and never distributes a king to another board", () => {
    const game = new Game();
    game.config.initialBoard = "duck";
    game.matches = [new Match(180000, false), new Match(180000, true)];
    const chess = empty();
    game.matches[0].chess = chess;
    chess.board[1][4] = { type: PieceType.ROOK, color: Color.WHITE };
    chess.board[0][4] = { type: PieceType.KING, color: Color.BLACK };
    const capture = move(1, 4, 0, 4);
    assert.equal(chess.isLegal(capture, false, game.getMoveRules()), true);
    assert.equal(game.checkCapturedKing(0, capture), Team.RED);
    game.doMove(0, capture);
    assert.equal(chess.duckPending, false);
    assert.equal(game.matches[1].chess.getPocket(Color.BLACK).has(PieceType.KING), false);
});

test("fowling counts pocket drops as legal moves and ignores check", () => {
    const chess = empty();
    chess.board[0][0] = { type: PieceType.PAWN, color: Color.WHITE };
    assert.equal(chess.isFowled(rules), true);
    chess.duckPending = true;
    assert.equal(chess.isFowled(rules), false);
    chess.duckPending = false;
    chess.addToPocket({ type: PieceType.KNIGHT, color: Color.WHITE });
    assert.equal(chess.isFowled(rules), false);
});

test("clock stays with mover through placement, and ordinary chess still alternates", () => {
    const match = new Match(10000, false);
    match.lastMoveTime = 1000;
    match.updateTime(2000);
    play(match.chess, move(6, 4, 4, 4));
    match.updateTime(3500);
    play(match.chess, duck(match.chess, 5, 4));
    match.updateTime(4000);
    assert.equal(match.whiteTime, 7500);
    assert.equal(match.blackTime, 9500);
    const normal = new Chess();
    normal.doMove(move(6, 4, 4, 4));
    assert.equal(normal.turn, Color.BLACK);
    assert.equal(normal.duckPending, false);
    assert.equal(normal.isLegal(duck(normal, 5, 4)), false);
});

test("incompatible modes normalize out, and malformed duck moves are rejected", () => {
    const config = new GameConfig(2, 180, 0, "increment", false, "960+koedem+taijitu+accolade+duck");
    assert.equal(config.initialBoard, "960+accolade+duck");
    const chess = new Chess();
    play(chess, move(6, 4, 4, 4));
    assert.equal(chess.isLegal(duck(chess, -1, 5), false, rules), false);
    assert.equal(chess.isLegal(duck(chess, 8, 5), false, rules), false);
    assert.equal(chess.isLegal({ ...duck(chess, 5, 4), promotion: PieceType.QUEEN }, false, rules), false);
    assert.equal(chess.isLegal(duck(chess, 5, 4), true, rules), false);
    assert.equal(chess.isLegal(undefined as unknown as Move, false, rules), false);
});

commonVariantTests("duck");

test("Duck intermediate positions never count; clone history is independent", () => {
    const chess = new Chess();
    const rules = { duck: true, allowKingCapture: true };
    chess.recordRepetition(rules);
    chess.doMove(gameMove(7, 6, 5, 5), false, rules);
    chess.recordRepetition(rules);
    assert.equal(chess.serialize().repetitionCounts?.length, 1);
    assert.equal(chess.isThreefoldRepetition(rules), false);
    const clone = chess.clone();
    clone.doMove(gameDrop(Color.WHITE, PieceType.DUCK, 4, 4), false, rules);
    clone.recordRepetition(rules);
    assert.equal(clone.serialize().repetitionCounts?.length, 2);
    assert.equal(chess.serialize().repetitionCounts?.length, 1);
});
