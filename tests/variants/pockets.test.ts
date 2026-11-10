import assert from "node:assert/strict";
import test from "node:test";
import { Color, PieceType } from "../../shared/src/chess";
import { GameConfig } from "../../shared/src/config";
import { Game, Match, Team } from "../../shared/src/room";
import { drop, gameFor, move, play } from "../helpers";

function threeBoards(variant = "default") {
    const game = gameFor(variant);
    game.matches = [new Match(180000, true), game.matches[0], new Match(180000, false)];
    const chess = game.matches[1].chess;
    chess.board[4][0] = { type: PieceType.ROOK, color: Color.WHITE };
    chess.board[4][3] = { type: PieceType.KNIGHT, color: Color.BLACK };
    return game;
}

test("Independent is the default for new and missing serialized settings", () => {
    assert.equal(new GameConfig().pocketShare, "none");
    assert.equal(GameConfig.deserialize({}).pocketShare, "none");
    for (const mode of ["none", "color", "shared"])
        assert.equal(GameConfig.deserialize({ "pocket-share": mode }).pocketShare, mode);
});

test("Independent recipients are adjacent boards without wraparound", () => {
    const game = threeBoards();
    assert.deepEqual(game.getCaptureRecipientBoards(0), [1]);
    assert.deepEqual(game.getCaptureRecipientBoards(1), [0, 2]);
    assert.deepEqual(game.getCaptureRecipientBoards(2), [1]);
});

for (const recipient of [0, 2]) {
    test(`Independent capture sends only to selected board ${recipient}, using its teammate's piece color`, () => {
        const game = threeBoards();
        const action = { ...move(4, 0, 4, 3), captureRecipient: recipient };
        play(game, action, 1);
        for (let boardID = 0; boardID < 3; boardID++) {
            for (const color of [Color.WHITE, Color.BLACK]) {
                const receives = boardID === recipient &&
                    color === (recipient === 0 ? Color.BLACK : Color.WHITE);
                assert.equal(game.matches[boardID].chess.getPocket(color).get(PieceType.KNIGHT) ?? 0,
                    receives ? 1 : 0);
            }
        }
        const restored = Game.deserialize(JSON.parse(JSON.stringify(game.serialize())));
        const color = recipient === 0 ? Color.BLACK : Color.WHITE;
        restored.matches[recipient].chess.turn = color;
        play(restored, drop(color, PieceType.KNIGHT, 4, 4), recipient);
        assert.equal(restored.matches[recipient].chess.getPocket(color).has(PieceType.KNIGHT), false);
    });
}

test("Independent captures with two recipients require a valid choice before changing state", () => {
    const game = threeBoards();
    const action = move(4, 0, 4, 3);
    const before = game.serialize();
    assert.equal(game.canMove(1, action), false);
    for (const captureRecipient of [-1, 1, 3, 0.5, NaN])
        assert.equal(game.canMove(1, { ...action, captureRecipient }), false);
    assert.deepEqual(game.serialize(), before);
    assert.equal(game.canMove(1, move(4, 0, 5, 0)), true);
});

test("Independent drops do not spend another pocket or start its cooldown", () => {
    const game = threeBoards("taijitu");
    for (const match of game.matches) match.chess.whitePocket.set(PieceType.KNIGHT, 2);
    play(game, drop(Color.WHITE, PieceType.KNIGHT, 5, 3), 1, 1000);
    assert.equal(game.matches[1].chess.whitePocket.get(PieceType.KNIGHT), 1);
    for (const boardID of [0, 2]) {
        assert.equal(game.matches[boardID].chess.whitePocket.get(PieceType.KNIGHT), 2);
        assert.equal(game.matches[boardID].chess.whitePocketCooldown, 0);
    }
});

for (const pocketShare of ["color", "shared"] as const) {
    test(`${pocketShare}: captures pool material and a drop spends it everywhere, including flipped boards`, () => {
        const game = threeBoards("taijitu");
        game.config.pocketShare = pocketShare;
        play(game, move(4, 0, 4, 3), 1, 1000);
        for (const match of game.matches) {
            for (const color of [Color.WHITE, Color.BLACK]) {
                const pooled = pocketShare === "shared" || match.getTeam(color) === Team.RED;
                assert.equal(match.chess.getPocket(color).get(PieceType.KNIGHT) ?? 0, pooled ? 1 : 0);
            }
        }
        game.matches[0].chess.board[4][0] = { type: PieceType.ROOK, color: Color.BLACK };
        game.matches[0].chess.board[4][3] = { type: PieceType.KNIGHT, color: Color.WHITE };
        play(game, move(4, 0, 4, 3), 0, 1000);
        const restored = Game.deserialize(JSON.parse(JSON.stringify(game.serialize())));
        play(restored, drop(Color.BLACK, PieceType.KNIGHT, 4, 4), 0, 2000);
        for (const match of restored.matches) {
            for (const color of [Color.WHITE, Color.BLACK]) {
                const pooled = pocketShare === "shared" || match.getTeam(color) === Team.RED;
                assert.equal(match.chess.getPocket(color).get(PieceType.KNIGHT) ?? 0, pooled ? 1 : 0);
                assert.equal(match.chess.getPocketCooldown(color), pooled ? 12000 : 0);
            }
        }
    });
}

test("Independent en passant and capture promotions require a recipient too", () => {
    const game = threeBoards();
    const chess = game.matches[1].chess;
    chess.board[3][4] = { type: PieceType.PAWN, color: Color.WHITE };
    chess.board[3][3] = { type: PieceType.PAWN, color: Color.BLACK };
    chess.enPassantTarget = { loc: "board", row: 2, col: 3 };
    const enPassant = move(3, 4, 2, 3);
    assert.equal(game.canMove(1, enPassant), false);
    play(game, { ...enPassant, captureRecipient: 2 }, 1);
    assert.equal(game.matches[2].chess.whitePocket.get(PieceType.PAWN), 1);
    chess.turn = Color.WHITE;
    chess.board[1][0] = { type: PieceType.PAWN, color: Color.WHITE };
    chess.board[0][1] = { type: PieceType.ROOK, color: Color.BLACK };
    const promotion = { ...move(1, 0, 0, 1), promotion: PieceType.KNIGHT };
    assert.equal(game.canMove(1, promotion), false);
    play(game, { ...promotion, captureRecipient: 0 }, 1);
    assert.equal(game.matches[0].chess.blackPocket.get(PieceType.ROOK), 1);
});

test("A pooled king is counted once for Koedem, regardless of how many pockets display it", () => {
    const game = threeBoards("koedem");
    game.config.pocketShare = "color";
    for (const match of game.matches) {
        match.chess.board = Array.from({ length: 8 }, () => Array(8).fill(undefined));
        const color = match.getTeam(Color.WHITE) === Team.RED ? Color.WHITE : Color.BLACK;
        match.chess.getPocket(color).set(PieceType.KING, 2);
    }
    assert.equal(game.checkKingAccumulation(), undefined);
});
