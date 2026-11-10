import { BOT_SKILLS } from "@shared/bots";
import { getAssetPath } from "./app-paths";

export class BotEngine {
    private worker: Worker;
    private waiting?: { matches: (line: string) => boolean; resolve: (line: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
    private ready: Promise<void>;
    private disposed = false;

    constructor() {
        if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === "undefined")
            throw new Error("Bot play needs cross-origin isolation. Open the game on its main host with COOP/COEP headers enabled.");
        this.worker = new Worker(getAssetPath("engine/bot-worker.js"));
        this.worker.onmessage = event => {
            if (event.data.error) this.fail(new Error(event.data.error));
            const line = event.data.ready ? "worker-ready" : event.data.line;
            if (typeof line === "string" && this.waiting?.matches(line)) {
                const pending = this.waiting;
                this.waiting = undefined;
                clearTimeout(pending.timer);
                pending.resolve(line);
            }
        };
        this.worker.onerror = () => this.fail(new Error("Fairy-Stockfish could not start. Please reload and try again."));
        this.ready = this.initialize();
    }

    private waitFor(matches: (line: string) => boolean, timeout = 15_000): Promise<string> {
        if (this.disposed) return Promise.reject(new Error("Bot engine stopped."));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => this.fail(new Error("Fairy-Stockfish timed out.")), timeout);
            this.waiting = { matches, resolve, reject, timer };
        });
    }

    private command(command: string): void { this.worker.postMessage(command); }

    private async initialize(): Promise<void> {
        await this.waitFor(line => line === "worker-ready");
        let bughouse = false;
        let skills = false;
        const initialized = this.waitFor(line => {
            if (line.startsWith("option name UCI_Variant") && line.includes("bughouse")) bughouse = true;
            if (line.startsWith("option name Skill Level") && line.includes("min -20")) skills = true;
            return line === "uciok";
        });
        this.command("uci");
        await initialized;
        if (!bughouse || !skills) throw new Error("This engine build does not support the required bughouse levels.");
        this.command("setoption name UCI_Variant value bughouse");
        this.command("setoption name Use NNUE value false");
        this.command("setoption name Threads value 1");
        this.command("setoption name Hash value 16");
        this.command("setoption name UCI_LimitStrength value false");
        const ready = this.waitFor(line => line === "readyok");
        this.command("isready");
        await ready;
    }

    async load(): Promise<void> { await this.ready; }

    async search(fen: string, level: number, moves: string[], timeBudget = Infinity): Promise<string> {
        await this.ready;
        if (this.disposed) throw new Error("Bot engine stopped.");
        this.command(`setoption name Skill Level value ${BOT_SKILLS[level - 1]}`);
        this.command(`position fen ${fen}`);
        const best = this.waitFor(line => line.startsWith("bestmove "), 5_000);
        // One search at a time, with a short budget to leave room for other boards.
        const movetime = Math.max(1, Math.floor(Math.min(level === 9 ? 250 : 100, timeBudget)));
        this.command(`go movetime ${movetime} searchmoves ${moves.join(" ")}`);
        return (await best).split(/\s+/)[1];
    }

    stopSearch(): void { if (!this.disposed) this.command("stop"); }

    private fail(error: Error): void {
        if (this.waiting) {
            clearTimeout(this.waiting.timer);
            this.waiting.reject(error);
            this.waiting = undefined;
        }
        this.disposed = true;
        this.worker.terminate();
    }

    dispose(): void { this.fail(new Error("Bot engine stopped.")); }
}
