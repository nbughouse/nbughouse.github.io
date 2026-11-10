import assert from "node:assert/strict";
import test from "node:test";
import { Color, PieceType } from "../../shared/src/chess";
import { Team } from "../../shared/src/room";
import { move, drop, gameFor, play } from "../helpers";
export function koedemTests(variant: string): void {
    for (const color of [Color.WHITE, Color.BLACK]) {
        test(`${variant}: ${color} must drop a pocket king before moving or dropping other pieces`, () => {
            const game = gameFor(variant);
            const chess = game.matches[0].chess;
            chess.turn = color;
            chess.addToPocket({ type: PieceType.KING, color });
            chess.addToPocket({ type: PieceType.KNIGHT, color });
            const row = color === Color.WHITE ? 7 : 0;
            assert.equal(chess.isLegal(move(row, 7, row, 6), false, game.getMoveRules()), false);
            assert.equal(chess.isLegal(drop(color, PieceType.KNIGHT, 4, 4), false, game.getMoveRules()), false);
            play(game, drop(color, PieceType.KING, 5, 5));
            chess.turn = color;
            assert.equal(chess.isLegal(drop(color, PieceType.KNIGHT, 4, 4), false, game.getMoveRules()), true);
        });
        test(`${variant}: ${color} king capture transfers the king and wins only after accumulation`, () => {
            const game = gameFor(variant);
            const chess = game.matches[0].chess;
            const enemy = color === Color.WHITE ? Color.BLACK : Color.WHITE;
            chess.turn = color;
            const row = enemy === Color.WHITE ? 7 : 0;
            chess.board[row][0] = { type: PieceType.ROOK, color };
            const capture = move(row, 0, row, 7);
            assert.equal(game.checkCapturedKing(0, capture), undefined);
            play(game, capture);
            assert.equal(game.matches[1].chess.getPocket(enemy).get(PieceType.KING), 1);
            assert.equal(game.checkKingAccumulation(), undefined);
        });
    }
    for (const team of [Team.RED, Team.BLUE]) {
        test(`${variant}: accumulation counts board and pocket kings on flipped teammates for ${team}`, () => {
            const game = gameFor(variant);
            const color = team === Team.RED ? Color.WHITE : Color.BLACK;
            const partnerColor = color === Color.WHITE ? Color.BLACK : Color.WHITE;
            for (const match of game.matches) {
                match.chess.board = Array.from({ length: 8 }, () => Array(8).fill(undefined));
            }
            game.matches[0].chess.board[4][4] = { type: PieceType.KING, color };
            game.matches[1].chess.board[5][5] = { type: PieceType.KING, color: partnerColor };
            game.matches[1].chess.getPocket(partnerColor).set(PieceType.KING, 1);
            assert.equal(game.checkKingAccumulation(), undefined);
            game.matches[0].chess.getPocket(color).set(PieceType.KING, 1);
            assert.equal(game.checkKingAccumulation(), team);
        });
    }
}
