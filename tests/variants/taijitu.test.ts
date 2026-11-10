import assert from "node:assert/strict";
import test from "node:test";
import { Color, PieceType } from "../../shared/src/chess";
import { Match } from "../../shared/src/room";
import { move, drop, gameFor, play } from "../helpers";
import { commonVariantTests } from "../suites/common";
import { taijituTests } from "../suites/taijitu";

commonVariantTests("taijitu");
taijituTests("taijitu");

test("Kung Fu permits either color and enforces piece and shared pocket cooldowns", () => {
    const game = gameFor("taijitu");
    game.matches.push(new Match(180000, false));
    const chess = game.matches[0].chess;
    chess.board[1][0] = { type: PieceType.PAWN, color: Color.BLACK };
    const first = move(1, 0, 2, 0);
    play(game, first, 0, 1000);
    assert.equal(chess.turn, Color.WHITE);
    const next = move(2, 0, 3, 0);
    assert.equal(game.canMove(0, next, 10999), false);
    assert.equal(game.canMove(0, next, 11000), true);
    for (const index of [0, 2]) game.matches[index].chess.whitePocket.set(PieceType.KNIGHT, 2);
    play(game, drop(Color.WHITE, PieceType.KNIGHT, 5, 3), 0, 1000);
    assert.equal(game.matches[2].chess.whitePocket.get(PieceType.KNIGHT), 1);
    assert.equal(game.canMove(2, drop(Color.WHITE, PieceType.KNIGHT, 4, 3), 10999), false);
    assert.equal(game.canMove(2, drop(Color.WHITE, PieceType.KNIGHT, 4, 3), 11000), true);
});

test("Kung Fu cannot use its own double move as an en passant opportunity", () => {
    const game = gameFor("taijitu");
    const chess = game.matches[0].chess;
    chess.board[6][3] = { type: PieceType.PAWN, color: Color.WHITE };
    chess.board[6][4] = { type: PieceType.PAWN, color: Color.WHITE };
    play(game, move(6, 3, 4, 3));
    assert.equal(chess.isLegal(move(6, 4, 5, 3), false, game.getMoveRules()), false);
});
