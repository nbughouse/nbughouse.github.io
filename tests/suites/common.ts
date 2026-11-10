import assert from "node:assert/strict";
import test from "node:test";
import { Color, createPosition as square, MoveType, PieceType } from "../../shared/src/chess";
import { Game } from "../../shared/src/room";
import { move, drop, gameFor, play, finishDuck } from "../helpers";
export function commonVariantTests(variant: string): void {
    for (const color of [Color.WHITE, Color.BLACK]) {
        for (const promotion of [undefined, PieceType.QUEEN, PieceType.ROOK, PieceType.BISHOP, PieceType.KNIGHT]) {
            test(`${variant}: ${color} quiet promotion to ${promotion ?? "default queen"}`, () => {
                const game = gameFor(variant);
                const chess = game.matches[0].chess;
                chess.turn = color;
                const fromRow = color === Color.WHITE ? 1 : 6;
                const toRow = color === Color.WHITE ? 0 : 7;
                chess.board[fromRow][0] = { type: PieceType.PAWN, color };
                const action = { ...move(fromRow, 0, toRow, 0), promotion };
                assert.equal(chess.getLegalMoveType(action, false, game.getMoveRules()), MoveType.PROMOTION);
                play(game, action);
                assert.equal(chess.board[fromRow][0], undefined);
                assert.equal(chess.board[toRow][0]?.type, !promotion || promotion === PieceType.QUEEN ? PieceType.PROMOTED_QUEEN : promotion);
                assert.equal(chess.board[toRow][0]?.color, color);
                finishDuck(game);
                assert.equal(chess.turn, game.getMoveRules().turnless ? color : color === Color.WHITE ? Color.BLACK : Color.WHITE);
            });
        }
        test(`${variant}: ${color} capture promotion sends captured material to teammate`, () => {
            const game = gameFor(variant);
            const chess = game.matches[0].chess;
            chess.turn = color;
            const fromRow = color === Color.WHITE ? 1 : 6;
            const toRow = color === Color.WHITE ? 0 : 7;
            const enemy = color === Color.WHITE ? Color.BLACK : Color.WHITE;
            chess.board[fromRow][0] = { type: PieceType.PAWN, color };
            chess.board[toRow][1] = { type: PieceType.ROOK, color: enemy };
            play(game, { ...move(fromRow, 0, toRow, 1), promotion: PieceType.KNIGHT });
            assert.equal(chess.board[toRow][1]?.type, PieceType.KNIGHT);
            assert.equal(game.matches[1].chess.getPocket(enemy).get(PieceType.ROOK), 1);
        });
        test(`${variant}: ${color} en passant captures and transfers the pawn`, () => {
            const game = gameFor(variant);
            const chess = game.matches[0].chess;
            const enemy = color === Color.WHITE ? Color.BLACK : Color.WHITE;
            const row = color === Color.WHITE ? 3 : 4;
            const start = color === Color.WHITE ? 1 : 6;
            const target = color === Color.WHITE ? 2 : 5;
            chess.turn = enemy;
            chess.board[row][4] = { type: PieceType.PAWN, color };
            chess.board[start][3] = { type: PieceType.PAWN, color: enemy };
            play(game, move(start, 3, row, 3));
            finishDuck(game, 5, 0);
            const action = move(row, 4, target, 3);
            assert.equal(chess.getLegalMoveType(action, false, game.getMoveRules()), MoveType.CAPTURE);
            play(game, action);
            assert.equal(chess.board[row][3], undefined);
            assert.equal(chess.board[row][4], undefined);
            assert.deepEqual(chess.board[target][3], { type: PieceType.PAWN, color });
            assert.equal(chess.enPassantTarget, undefined);
            assert.equal(game.matches[1].chess.getPocket(enemy).get(PieceType.PAWN), 1);
        });
    }
    test(`${variant}: en passant expires after another chess move`, () => {
        const game = gameFor(variant);
        const chess = game.matches[0].chess;
        chess.turn = Color.BLACK;
        chess.board[1][3] = { type: PieceType.PAWN, color: Color.BLACK };
        chess.board[3][4] = { type: PieceType.PAWN, color: Color.WHITE };
        play(game, move(1, 3, 3, 3));
        finishDuck(game);
        play(game, move(7, 7, 6, 7));
        finishDuck(game, 4, 5);
        assert.equal(chess.enPassantTarget, undefined);
        assert.equal(chess.isLegal(move(3, 4, 2, 3), false, game.getMoveRules()), false);
    });
    test(`${variant}: drops consume pocket pieces and forbid back-rank pawns`, () => {
        const game = gameFor(variant);
        const chess = game.matches[0].chess;
        chess.addToPocket({ type: PieceType.PAWN, color: Color.WHITE });
        for (const row of [0, 7])
            assert.equal(chess.isLegal(drop(Color.WHITE, PieceType.PAWN, row, 2), false, game.getMoveRules()), false);
        play(game, drop(Color.WHITE, PieceType.PAWN, 4, 2));
        assert.equal(chess.getPocket(Color.WHITE).has(PieceType.PAWN), false);
        assert.equal(chess.board[4][2]?.type, PieceType.PAWN);
    });
    test(`${variant}: third occurrence on one board draws, independent of other boards`, () => {
        const game = gameFor(variant, false);
        // Zero cooldown makes the same board position playable in Kung Fu.
        game.config.pieceCooldown = game.config.pocketCooldown = 0;
        const cycle = [move(7, 6, 5, 5), move(0, 6, 2, 5), move(5, 5, 7, 6), move(2, 5, 0, 6)];
        if (game.getMoveRules().duck) {
            // Begin with a duck already on a stable square.
            game.matches[0].chess.board[4][4] = { type: PieceType.DUCK, color: Color.WHITE };
        }
        for (let iteration = 0; iteration < 2; iteration++) {
            for (let i = 0; i < cycle.length; i++) {
                play(game, cycle[i]);
                finishDuck(game, 4, i % 2 === 0 ? 3 : 4);
                if (iteration === 0 || i < 3)
                    assert.equal(game.checkThreefoldRepetition(), undefined);
            }
        }
        assert.equal(game.checkThreefoldRepetition(), 0);
        assert.equal(game.matches[1].chess.isThreefoldRepetition(game.getMoveRules()), false);
        const restored = Game.deserialize(JSON.parse(JSON.stringify(game.serialize())));
        assert.equal(restored.checkThreefoldRepetition(), 0);
        game.matches[0].chess.reset();
        assert.equal(game.checkThreefoldRepetition(), undefined);
    });
    test(`${variant}: capturing a promoted queen transfers a pawn`, () => {
        const game = gameFor(variant);
        const chess = game.matches[0].chess;
        chess.board[4][0] = { type: PieceType.ROOK, color: Color.WHITE };
        chess.board[4][3] = { type: PieceType.PROMOTED_QUEEN, color: Color.BLACK };
        play(game, move(4, 0, 4, 3));
        assert.equal(game.matches[1].chess.getPocket(Color.BLACK).get(PieceType.PAWN), 1);
        assert.equal(game.matches[1].chess.getPocket(Color.BLACK).has(PieceType.QUEEN), false);
    });
    test(`${variant}: castling moves both pieces and permanently loses rights`, () => {
        for (const short of [true, false]) {
            const game = gameFor(variant);
            const chess = game.matches[0].chess;
            chess.board[7][7] = undefined;
            chess.board[7][4] = { type: PieceType.KING, color: Color.WHITE };
            chess.board[7][short ? 7 : 0] = { type: PieceType.ROOK, color: Color.WHITE };
            chess.whiteCastleShort = chess.whiteCastleLong = true;
            play(game, move(7, 4, 7, short ? 6 : 2));
            assert.equal(chess.board[7][short ? 6 : 2]?.type, PieceType.KING);
            assert.equal(chess.board[7][short ? 5 : 3]?.type, PieceType.ROOK);
            assert.equal(chess.whiteCastleShort, false);
            assert.equal(chess.whiteCastleLong, false);
        }
    });
    test(`${variant}: en passant cannot capture a friendly or missing pawn`, () => {
        const game = gameFor(variant);
        const chess = game.matches[0].chess;
        chess.board[3][4] = { type: PieceType.PAWN, color: Color.WHITE };
        chess.enPassantTarget = square(2, 3);
        for (const adjacent of [undefined, { type: PieceType.PAWN, color: Color.WHITE }, { type: PieceType.KNIGHT, color: Color.BLACK }]) {
            chess.board[3][3] = adjacent;
            assert.equal(chess.isLegal(move(3, 4, 2, 3), false, game.getMoveRules()), false);
        }
    });
    test(`${variant}: king safety follows variant rules without mutating the board`, () => {
        const game = gameFor(variant);
        const chess = game.matches[0].chess;
        chess.board[7][7] = undefined;
        chess.board[7][4] = { type: PieceType.KING, color: Color.WHITE };
        chess.board[6][4] = { type: PieceType.ROOK, color: Color.WHITE };
        chess.board[0][4] = { type: PieceType.ROOK, color: Color.BLACK };
        const before = JSON.stringify(chess.serialize());
        assert.equal(chess.isLegal(move(6, 4, 6, 3), false, game.getMoveRules()), game.getMoveRules().allowKingCapture);
        assert.equal(JSON.stringify(chess.serialize()), before);
    });
    test(`${variant}: rules survive a game serialization round trip`, () => {
        const game = gameFor(variant);
        const flags = variant.split("+");
        const expected = {
            duck: flags.includes("duck"),
            allowKingCapture: flags.some(flag => ["duck", "koedem", "taijitu"].includes(flag)),
            forcePocketKingDrop: flags.includes("koedem"),
            accolade: flags.includes("accolade"),
            dropAggression: "mate",
            turnless: flags.includes("taijitu"),
        };
        assert.deepEqual(game.getMoveRules(), expected);
        const restored = Game.deserialize(JSON.parse(JSON.stringify(game.serialize())));
        assert.equal(restored.config.initialBoard, variant);
        assert.deepEqual(restored.getMoveRules(), expected);
    });
}
