import assert from "node:assert/strict";
import test from "node:test";
import { Color, PieceType } from "../../shared/src/chess";
import { Match } from "../../shared/src/room";
import { move, drop, gameFor, play } from "../helpers";
import { commonVariantTests } from "../suites/common";

commonVariantTests("default");

test("rook movement and capture revoke only the relevant castling right", () => {
    const game = gameFor("default");
    const chess = game.matches[0].chess;
    chess.whiteCastleShort = chess.whiteCastleLong = true;
    chess.board[7][0] = { type: PieceType.ROOK, color: Color.WHITE };
    play(game, move(7, 0, 6, 0));
    assert.equal(chess.whiteCastleLong, false);
    assert.equal(chess.whiteCastleShort, true);
    chess.board[0][0] = { type: PieceType.ROOK, color: Color.BLACK };
    chess.blackCastleLong = chess.blackCastleShort = true;
    chess.board[6][0] = undefined;
    chess.board[6][0] = { type: PieceType.ROOK, color: Color.WHITE };
    chess.turn = Color.WHITE;
    play(game, move(6, 0, 0, 0));
    assert.equal(chess.blackCastleLong, false);
    assert.equal(chess.blackCastleShort, true);
});

test("drop aggression rejects checking and mating drops according to settings", () => {
    const game = gameFor("default");
    const chess = game.matches[0].chess;
    chess.board[7][7] = undefined;
    chess.board[2][6] = { type: PieceType.KING, color: Color.WHITE };
    chess.addToPocket({ type: PieceType.QUEEN, color: Color.WHITE });
    const mate = drop(Color.WHITE, PieceType.QUEEN, 1, 7);
    const check = drop(Color.WHITE, PieceType.QUEEN, 0, 0);
    assert.equal(chess.isLegal(mate, false, { dropAggression: "mate" }), true);
    assert.equal(chess.isLegal(mate, false, { dropAggression: "no-mate" }), false);
    assert.equal(chess.isLegal(check, false, { dropAggression: "no-mate" }), true);
    assert.equal(chess.isLegal(check, false, { dropAggression: "no-check" }), false);
    assert.equal(chess.board[1][7], undefined);
    assert.equal(chess.getPocket(Color.WHITE).get(PieceType.QUEEN), 1);
});

test("captures and shared drops record changes in another board's pockets only once", () => {
    const game = gameFor("default");
    game.matches.push(new Match(180000, false));
    const chess = game.matches[0].chess;
    chess.board[4][0] = { type: PieceType.ROOK, color: Color.WHITE };
    chess.board[4][3] = { type: PieceType.KNIGHT, color: Color.BLACK };
    play(game, move(4, 0, 4, 3));
    assert.equal(game.matches[1].chess.serialize().repetitionCounts?.length, 2);
    assert.equal(game.matches[2].chess.serialize().repetitionCounts?.length, 1);
    // A normal move on the first board must not recount the unchanged recipient.
    play(game, move(0, 7, 1, 7));
    assert.equal(game.matches[1].chess.serialize().repetitionCounts?.length, 2);
    for (const index of [0, 2]) game.matches[index].chess.whitePocket.set(PieceType.BISHOP, 1);
    play(game, drop(Color.WHITE, PieceType.BISHOP, 5, 5));
    assert.equal(game.matches[2].chess.whitePocket.has(PieceType.BISHOP), false);
    assert.equal(game.matches[1].chess.serialize().repetitionCounts?.length, 2);
});
