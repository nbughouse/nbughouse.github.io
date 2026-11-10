import assert from "node:assert/strict";
import { Color, createPosition as square, PieceType, type Move } from "../shared/src/chess";
import { GameConfig } from "../shared/src/config";
import { Game, Match } from "../shared/src/room";

export const move = (r: number, c: number, row: number, col: number): Move => ({ from: square(r, c), to: square(row, col) });
export const drop = (color: Color, type: PieceType, row: number, col: number): Move => ({ from: square(color, type), to: square(row, col) });
export function gameFor(variant: string, empty = true): Game {
    const game = new Game();
    game.config = new GameConfig(2, 180, 0, "increment", false, variant);
    game.matches = [new Match(180000, false), new Match(180000, true)];
    if (empty) {
        const chess = game.matches[0].chess;
        chess.board = Array.from({ length: 8 }, () => Array(8).fill(undefined));
        chess.board[7][7] = { type: PieceType.KING, color: Color.WHITE };
        chess.board[0][7] = { type: PieceType.KING, color: Color.BLACK };
        chess.whiteCastleShort = chess.whiteCastleLong = false;
        chess.blackCastleShort = chess.blackCastleLong = false;
    }
    return game;
}
export function play(game: Game, action: Move, board = 0, time = 1000): void {
    assert.equal(game.matches[board].chess.isLegal(action, false, game.getMoveRules()), true, JSON.stringify(action));
    assert.equal(game.canMove(board, action, time), true);
    game.doMove(board, action, time);
}
export function finishDuck(game: Game, row = 4, col = 4): void {
    const chess = game.matches[0].chess;
    if (chess.duckPending) play(game, drop(chess.turn, PieceType.DUCK, row, col));
}
