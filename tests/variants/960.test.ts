import assert from "node:assert/strict";
import test from "node:test";
import { Chess, Color, MoveType, PieceType } from "../../shared/src/chess";
import { move } from "../helpers";
import { commonVariantTests } from "../suites/common";
import { chess960Tests } from "../suites/chess960";

commonVariantTests("960");
chess960Tests("960");

test("all 960 starting ranks castle correctly on either side for both colors", () => {
    const ranks: PieceType[][] = [];
    function permute(prefix: PieceType[], remaining: PieceType[]): void {
        if (!remaining.length) {
            const bishops = prefix.flatMap((p, i) => p === PieceType.BISHOP ? [i] : []);
            const rooks = prefix.flatMap((p, i) => p === PieceType.ROOK ? [i] : []);
            const king = prefix.indexOf(PieceType.KING);
            if (bishops[0] % 2 !== bishops[1] % 2 && rooks[0] < king && king < rooks[1]) ranks.push(prefix);
            return;
        }
        for (const type of new Set(remaining)) {
            const rest = [...remaining];
            rest.splice(rest.indexOf(type), 1);
            permute([...prefix, type], rest);
        }
    }
    permute([], [PieceType.ROOK, PieceType.KNIGHT, PieceType.BISHOP, PieceType.QUEEN, PieceType.KING, PieceType.BISHOP, PieceType.KNIGHT, PieceType.ROOK]);
    assert.equal(ranks.length, 960);
    for (const rank of ranks) for (const color of [Color.WHITE, Color.BLACK]) for (const short of [true, false]) {
        const chess = new Chess();
        chess.reset(rank);
        const row = color === Color.WHITE ? 7 : 0;
        const king = rank.indexOf(PieceType.KING);
        const rook = short ? rank.lastIndexOf(PieceType.ROOK) : rank.indexOf(PieceType.ROOK);
        chess.board = Array.from({ length: 8 }, () => Array(8).fill(undefined));
        chess.board[row][king] = { type: PieceType.KING, color };
        chess.board[row][rook] = { type: PieceType.ROOK, color };
        chess.turn = color;
        const castle = move(row, king, row, rook);
        assert.equal(chess.getLegalMoveType(castle), MoveType.CASTLE, `${rank} ${color} ${short}`);
        assert.equal(chess.doMove(castle).captured, undefined);
        assert.equal(chess.board[row][short ? 6 : 2]?.type, PieceType.KING);
        assert.equal(chess.board[row][short ? 5 : 3]?.type, PieceType.ROOK);
        assert.equal(chess.board.flat().filter(Boolean).length, 2);
    }
});
