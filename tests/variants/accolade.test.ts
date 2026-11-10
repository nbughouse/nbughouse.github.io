import assert from "node:assert/strict";
import test from "node:test";
import { Color, PieceType } from "../../shared/src/chess";
import { move, gameFor, play } from "../helpers";
import { commonVariantTests } from "../suites/common";
import { accoladeTests } from "../suites/accolade";

commonVariantTests("accolade");
accoladeTests("accolade");

for (const partner of [PieceType.BISHOP, PieceType.ROOK, PieceType.QUEEN, PieceType.PROMOTED_QUEEN]) {
    test(`Accolade combines, moves and splits captured knight + ${partner}`, () => {
        const game = gameFor("accolade");
        const chess = game.matches[0].chess;
        chess.board[4][4] = { type: PieceType.KNIGHT, color: Color.WHITE };
        chess.board[2][3] = { type: partner, color: Color.WHITE };
        play(game, move(4, 4, 2, 3));
        assert.deepEqual(chess.board[2][3], { type: PieceType.KNIGHT, color: Color.WHITE, combinedWith: partner });
        chess.turn = Color.WHITE;
        assert.equal(chess.isLegal(move(2, 3, 4, 4), false, game.getMoveRules()), true);
        const partnerMove = partner === PieceType.BISHOP ? move(2, 3, 3, 4) : move(2, 3, 2, 4);
        assert.equal(chess.isLegal(partnerMove, false, game.getMoveRules()), true);
        chess.board[2][0] = { type: PieceType.ROOK, color: Color.BLACK };
        chess.turn = Color.BLACK;
        play(game, move(2, 0, 2, 3));
        const pocket = game.matches[1].chess.getPocket(Color.WHITE);
        assert.equal(pocket.get(PieceType.KNIGHT), 1);
        assert.equal(pocket.get(partner === PieceType.PROMOTED_QUEEN ? PieceType.PAWN : partner), 1);
    });
}
