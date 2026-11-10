import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Chess, Color, PieceType } from "../../shared/src/chess";
import { BOT_SKILLS } from "../../shared/src/bots";
import { botFen, botLegalMoves } from "../../shared/src/bot-position";

test("vendored WASM engine returns an app-legal bughouse move at all nine levels", () => {
    const cases = BOT_SKILLS.map((skill, index) => {
        const chess = new Chess();
        if (index % 2) {
            chess.doMove({ from: { loc: "board", row: 6, col: 4 }, to: { loc: "board", row: 4, col: 4 } });
            chess.blackPocket.set(PieceType.KNIGHT, 1);
        } else chess.whitePocket.set(PieceType.PAWN, 1);
        return { skill, fen: botFen(chess), moves: [...botLegalMoves(chess, {}).keys()] };
    });
    const output = execFileSync(process.execPath,
        [fileURLToPath(new URL("fixtures/check-engine.cjs", import.meta.url))],
        { input: JSON.stringify(cases), encoding: "utf8", timeout: 20000 });
    const results = JSON.parse(output.trim().split("\n").at(-1)!) as string[];
    assert.equal(results.length, 9);
    results.forEach((move, index) => assert.ok(cases[index].moves.includes(move), `Level ${index + 1}: ${move}`));
    assert.equal(Color.WHITE, 1);
});
