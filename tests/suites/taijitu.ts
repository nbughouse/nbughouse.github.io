import assert from "node:assert/strict";
import test from "node:test";
import { Color, PieceType } from "../../shared/src/chess";
import { Game, Match } from "../../shared/src/room";
import { move, drop, gameFor, play } from "../helpers";
export function taijituTests(variant: string): void {
    test(`${variant}: cooldowns are independent per piece and survive serialization`, () => {
        const game = gameFor(variant);
        game.config.pocketShare = "color";
        game.config.pieceCooldown = 2;
        game.config.pocketCooldown = 3;
        const chess = game.matches[0].chess;
        chess.board[1][0] = { type: PieceType.PAWN, color: Color.BLACK };
        play(game, move(1, 0, 2, 0), 0, 1000);
        play(game, move(7, 7, 6, 7), 0, 1000);
        const next = move(2, 0, 3, 0);
        assert.equal(game.canMove(0, next, 2999), false);
        assert.equal(game.canMove(0, next, 3000), true);
        game.matches.push(new Match(180000, false));
        for (const index of [0, 1, 2])
            game.matches[index].chess.getPocket(index === 1 ? Color.BLACK : Color.WHITE).set(PieceType.KNIGHT, 2);
        play(game, drop(Color.WHITE, PieceType.KNIGHT, 4, 3), 0, 1000);
        const restored = Game.deserialize(JSON.parse(JSON.stringify(game.serialize())));
        assert.equal(restored.canMove(0, next, 2999), false);
        assert.equal(restored.canMove(0, next, 3000), true);
        for (const index of [0, 2]) {
            const action = drop(Color.WHITE, PieceType.KNIGHT, 5, 3);
            assert.equal(restored.canMove(index, action, 3999), false);
            assert.equal(restored.canMove(index, action, 4000), true);
        }
        assert.equal(restored.canMove(0, move(4, 3, 2, 2), 2999), false);
        assert.equal(restored.canMove(0, move(4, 3, 2, 2), 3000), true);
        assert.equal(restored.matches[0].chess.turn, Color.WHITE);
    });
    for (const board of [0, 1]) {
        for (const color of [Color.WHITE, Color.BLACK]) {
            test(`${variant}: king capture on board ${board + 1} awards the capturing ${color} team`, () => {
                const game = gameFor(variant);
                const chess = game.matches[board].chess;
                chess.board = Array.from({ length: 8 }, () => Array(8).fill(undefined));
                chess.board[4][0] = { type: PieceType.ROOK, color };
                chess.board[4][4] = { type: PieceType.KING, color: color === Color.WHITE ? Color.BLACK : Color.WHITE };
                const capture = move(4, 0, 4, 4);
                assert.equal(chess.isLegal(capture, false, game.getMoveRules()), true);
                assert.equal(game.checkCapturedKing(board, capture), game.matches[board].getTeam(color));
            });
        }
    }
}
