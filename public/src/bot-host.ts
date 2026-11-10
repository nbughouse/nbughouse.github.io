import { BotScheduler } from "./bot-scheduler";
import { RoomStatus } from "@shared/room";
import { BotEngine } from "./bot-engine";
import { gs, sn } from "./session";

let engine: BotEngine | undefined;
let generation = 0;
let running = false;
let failedRoom: object | undefined;
let failedHost: string | undefined;
let pendingMove: number | undefined;
let requested = false;
let wake: ReturnType<typeof setTimeout> | undefined;
const scheduler = new BotScheduler();

function schedule(at: number): void {
    clearTimeout(wake);
    wake = setTimeout(() => { wake = undefined; void runBots(); }, Math.max(0, at - Date.now()));
}

function status(message: string): void {
    let element = document.querySelector<HTMLElement>("#bot-engine-status");
    if (!element) {
        element = document.createElement("div");
        element.id = "bot-engine-status";
        element.setAttribute("role", "status");
        document.querySelector("#sidebar-header")?.after(element);
    }
    element.textContent = message;
    element.hidden = !message;
}

export async function prepareBotEngine(): Promise<void> {
    const current = engine ??= new BotEngine();
    try { await current.load(); }
    catch (error) {
        if (engine === current) {
            current.dispose();
            engine = undefined;
        }
        throw error;
    }
}

export function stopBotEngine({ keepLoaded = false }: { keepLoaded?: boolean } = {}): void {
    generation++;
    clearTimeout(wake);
    wake = undefined;
    scheduler.clear();
    if (keepLoaded) engine?.stopSearch();
    else {
        engine?.dispose();
        engine = undefined;
    }
    pendingMove = undefined;
    status("");
}

function ownsEngine(): boolean {
    return sn.room?.kind === "bot" && sn.room.hostID === sn.player?.id &&
        (sn.game.local || sn.socket.connected);
}

export function initBotHost(): void {
    for (const event of ["joined-room", "bot-room-updated", "room-host-updated", "started-room", "p-moved-board", "ended-room", "bot-move-rejected"]) {
        sn.game.on(event, (boardID?: number) => {
            requested = true;
            if (event !== "p-moved-board" || pendingMove === boardID) pendingMove = undefined;
            clearTimeout(wake);
            if (event === "p-moved-board" && boardID !== undefined) scheduler.moved(boardID);
            if (event === "started-room" || event === "ended-room") scheduler.clear();
            if (!ownsEngine() || event === "ended-room") {
                stopBotEngine();
                return;
            }
            if (failedRoom === sn.room && failedHost === sn.room?.hostID) return;
            void runBots();
        });
    }
    sn.socket.on("disconnect", () => { if (!sn.game.local) stopBotEngine(); });
}

async function runBots(): Promise<void> {
    if (running || pendingMove !== undefined || !ownsEngine()) return;
    running = true;
    requested = false;
    const token = generation;
    try {
        await prepareBotEngine();
        if (token !== generation || !ownsEngine()) return;
        status("");
        while (token === generation && ownsEngine() && gs.room.status === RoomStatus.PLAYING && pendingMove === undefined) {
            const room = gs.room;
            const action = scheduler.next(room, Date.now());
            if (action.kind === "wait") {
                if (Number.isFinite(action.until)) schedule(action.until);
                return;
            }
            if (action.kind === "move") {
                pendingMove = action.board;
                gs.game.send("bot-move", action.board, room.game.matches[action.board].chess.turn, action.move, room.revision);
                return;
            }
            const best = await engine!.search(action.fen, room.botLevel, [...action.legal.keys()], action.plan.deadline - Date.now());
            if (token !== generation || !ownsEngine() || gs.room !== room || room.status !== RoomStatus.PLAYING) return;
            scheduler.accept(room, action, best);
        }
    } catch (error) {
        if (token !== generation) return;
        failedRoom = sn.room;
        failedHost = sn.room?.hostID;
        stopBotEngine();
        status(error instanceof Error ? error.message : "Bot engine stopped.");
        sn.game.send("bot-engine-error");
    } finally {
        running = false;
        // A confirmation may arrive while a search is unwinding.
        if (requested && ownsEngine() && failedRoom !== sn.room) void runBots();
    }
}
