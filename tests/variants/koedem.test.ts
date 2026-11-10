import assert from "node:assert/strict";
import test from "node:test";
import { Color, PieceType } from "../../shared/src/chess";
import { move, drop, gameFor, play } from "../helpers";
import { commonVariantTests } from "../suites/common";
import { koedemTests } from "../suites/koedem";

commonVariantTests("koedem");
koedemTests("koedem");

test("Koedem requires a pocket king drop before other moves", () => {
    const game = gameFor("koedem");
    const chess = game.matches[0].chess;
    chess.addToPocket({ type: PieceType.KING, color: Color.WHITE });
    assert.equal(chess.isLegal(move(7, 7, 6, 7), false, game.getMoveRules()), false);
    play(game, drop(Color.WHITE, PieceType.KING, 5, 5));
    assert.equal(chess.getPocket(Color.WHITE).has(PieceType.KING), false);
    assert.equal(chess.board[5][5]?.type, PieceType.KING);
});

test("Koedem wins when one team accumulates all four kings", () => {
    const game = gameFor("koedem");
    for (const match of game.matches) {
        match.chess.board = Array.from({ length: 8 }, () => Array(8).fill(undefined));
        match.chess.whitePocket.clear();
        match.chess.blackPocket.clear();
    }
    game.matches[0].chess.whitePocket.set(PieceType.KING, 3);
    assert.equal(game.checkKingAccumulation(), undefined);
    game.matches[0].chess.whitePocket.set(PieceType.KING, 4);
    assert.equal(game.checkKingAccumulation(), game.matches[0].getTeam(Color.WHITE));
});
