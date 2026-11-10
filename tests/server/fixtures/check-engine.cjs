const fs = require("node:fs");
const path = require("node:path");
const engineDir = path.resolve(__dirname, "../../../public/assets/engine/fairy-stockfish");
const createEngine = require(path.join(engineDir, "stockfish.js"));
const cases = JSON.parse(fs.readFileSync(0, "utf8"));
const timer = setTimeout(() => { console.error("Engine smoke test timed out"); process.exit(1); }, 15000);

(async () => {
    const engine = await createEngine({ wasmBinary: fs.readFileSync(path.join(engineDir, "stockfish.wasm")) });
    let receiver;
    engine.addMessageListener(line => receiver?.(line));
    const command = (text, match) => new Promise(resolve => {
        receiver = line => { if (match(line)) { receiver = undefined; resolve(line); } };
        engine.postMessage(text);
    });
    await command("uci", line => line === "uciok");
    engine.postMessage("setoption name UCI_Variant value bughouse");
    engine.postMessage("setoption name Use NNUE value false");
    engine.postMessage("setoption name Threads value 1");
    engine.postMessage("setoption name Hash value 16");
    engine.postMessage("setoption name UCI_LimitStrength value false");
    await command("isready", line => line === "readyok");
    const results = [];
    for (const entry of cases) {
        engine.postMessage(`setoption name Skill Level value ${entry.skill}`);
        engine.postMessage(`position fen ${entry.fen}`);
        const line = await command(`go movetime 30 searchmoves ${entry.moves.join(" ")}`, line => line.startsWith("bestmove "));
        results.push(line.split(/\s+/)[1]);
    }
    console.log(JSON.stringify(results));
    engine.postMessage("quit");
    clearTimeout(timer);
    setTimeout(() => process.exit(0), 50);
})().catch(error => { console.error(error); process.exit(1); });
