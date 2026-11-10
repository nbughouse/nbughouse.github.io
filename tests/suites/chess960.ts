import assert from "node:assert/strict";
import test from "node:test";
import { Color, PieceType } from "../../shared/src/chess";
import { Player } from "../../shared/src/player";
import { Room } from "../../shared/src/room";
export function chess960Tests(variant: string): void {
    for (const seed of [1, 42, 960]) {
        test(`${variant}: seeded start ${seed} creates valid mirrored Chess960 ranks`, t => {
            let state = seed;
            t.mock.method(Math, "random", () => {
                state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
                return state / 2 ** 32;
            });
            const room = new Room("variants");
            room.game.config.initialBoard = variant;
            room.players.set("white", new Player("white"));
            room.players.set("black", new Player("black"));
            assert.equal(room.tryStartRoom(1000), true);
            for (const { chess } of room.game.matches) {
                const rank = chess.board[7].map(piece => piece?.type);
                assert.deepEqual([...rank].sort(), [PieceType.ROOK, PieceType.KNIGHT, PieceType.BISHOP,
                    PieceType.QUEEN, PieceType.KING, PieceType.BISHOP, PieceType.KNIGHT, PieceType.ROOK].sort());
                // These fixed seeds must exercise randomization rather than the standard reset.
                assert.notDeepEqual(rank, [PieceType.ROOK, PieceType.KNIGHT, PieceType.BISHOP,
                    PieceType.QUEEN, PieceType.KING, PieceType.BISHOP, PieceType.KNIGHT, PieceType.ROOK]);
                const bishops = rank.flatMap((type, col) => type === PieceType.BISHOP ? [col] : []);
                assert.notEqual(bishops[0] % 2, bishops[1] % 2);
                const king = rank.indexOf(PieceType.KING);
                assert.ok(rank.indexOf(PieceType.ROOK) < king);
                assert.ok(king < rank.lastIndexOf(PieceType.ROOK));
                assert.equal(chess.whiteCastleLongRookCol, rank.indexOf(PieceType.ROOK));
                assert.equal(chess.whiteCastleShortRookCol, rank.lastIndexOf(PieceType.ROOK));
                assert.equal(chess.blackCastleLongRookCol, chess.whiteCastleLongRookCol);
                assert.equal(chess.blackCastleShortRookCol, chess.whiteCastleShortRookCol);
                assert.deepEqual(chess.board[0].map(piece => piece?.type), rank);
                for (const [row, color] of [[0, Color.BLACK], [7, Color.WHITE]] as const) {
                    assert.ok(chess.board[row].every(piece => piece?.color === color));
                    assert.ok(chess.board[row === 0 ? 1 : 6].every(piece => piece?.type === PieceType.PAWN && piece.color === color));
                }
                assert.ok(chess.board.slice(2, 6).flat().every(piece => piece === undefined));
            }
        });
    }
}
