import assert from "node:assert/strict";
import test from "node:test";
import { Color, PieceType } from "../../shared/src/chess";
import { Game } from "../../shared/src/room";
import { move, drop, gameFor, play, finishDuck } from "../helpers";
export function accoladeTests(variant: string): void {
    for (const color of [Color.WHITE, Color.BLACK]) {
        for (const partner of [PieceType.BISHOP, PieceType.ROOK, PieceType.QUEEN, PieceType.PROMOTED_QUEEN]) {
            // Captured promoted queens become pawns, so they cannot be dropped as queens.
            for (const pocket of partner === PieceType.PROMOTED_QUEEN ? [false] : [false, true]) {
                test(`${variant}: ${color} ${partner} combines with a knight by ${pocket ? "drop" : "move"}`, () => {
                    const game = gameFor(variant);
                    const chess = game.matches[0].chess;
                    chess.turn = color;
                    // Test the reverse direction of the existing knight-onto-partner coverage.
                    chess.board[4][4] = { type: PieceType.KNIGHT, color };
                    const fromRow = partner === PieceType.BISHOP ? 2 : 4;
                    if (pocket)
                        chess.addToPocket({ type: partner, color });
                    else
                        chess.board[fromRow][2] = { type: partner, color };
                    play(game, pocket ? drop(color, partner, 4, 4)
                        : move(fromRow, 2, 4, 4));
                    assert.deepEqual(chess.board[4][4], { type: PieceType.KNIGHT, color, combinedWith: partner });
                    assert.equal(chess.getPocket(color).has(partner), false);
                    assert.equal(game.matches[1].chess.whitePocket.size, 0);
                    assert.equal(game.matches[1].chess.blackPocket.size, 0);
                    const restored = Game.deserialize(JSON.parse(JSON.stringify(game.serialize())));
                    assert.deepEqual(restored.matches[0].chess.board[4][4], chess.board[4][4]);
                    finishDuck(game, 5, 5);
                    chess.turn = color;
                    const before = JSON.stringify(chess.serialize());
                    assert.equal(chess.isLegal(move(4, 4, 2, 3), false, game.getMoveRules()), true);
                    assert.equal(chess.isLegal(move(4, 4, partner === PieceType.BISHOP ? 3 : 4, 5), false, game.getMoveRules()), true);
                    assert.equal(JSON.stringify(chess.serialize()), before);
                });
            }
        }
        test(`${variant}: ${color} cannot combine unsupported or already combined pieces`, () => {
            const game = gameFor(variant);
            const chess = game.matches[0].chess;
            chess.turn = color;
            chess.board[4][4] = { type: PieceType.KNIGHT, color };
            for (const target of [
                { type: PieceType.PAWN, color },
                { type: PieceType.KNIGHT, color },
                { type: PieceType.KING, color },
                { type: PieceType.KNIGHT, color, combinedWith: PieceType.ROOK },
            ]) {
                chess.board[2][3] = target;
                const before = JSON.stringify(chess.serialize());
                assert.equal(chess.isLegal(move(4, 4, 2, 3), false, game.getMoveRules()), false);
                assert.equal(JSON.stringify(chess.serialize()), before);
            }
        });
    }
}
