import fs from "node:fs";
import path from "node:path";
import type { Room } from "@shared/room";

type StatsEvent = PlayerSeenEvent | CompletedGameEvent;

interface PlayerSeenEvent {
    type: "player_seen";
    playerID: string;
    timestamp: string;
}

interface CompletedGameEvent {
    type: "completed_game";
    roomCode: string;
    playerIDs: string[];
    completedAt: string;
}

export interface SiteStats {
    uniquePlayers?: number;
    completedGames?: number;
    updatedAt?: string;
}

export function recordPlayerSeen(playerID: string): void {
    appendStatsEvent({
        type: "player_seen",
        playerID,
        timestamp: new Date().toISOString(),
    });
}

export function recordCompletedGame(room: Room): void {
    appendStatsEvent({
        type: "completed_game",
        roomCode: room.code,
        playerIDs: [...room.players.keys()],
        completedAt: new Date().toISOString(),
    });
}

export function getSiteStats(): SiteStats {
    const statsPath = getStatsEventsPath();
    if (!statsPath || !fs.existsSync(statsPath)) return {};

    const playerIDs = new Set<string>();
    const completedRoomEvents = new Set<string>();
    let updatedAt: string | undefined;

    for (const line of fs.readFileSync(statsPath, "utf8").split("\n")) {
        const event = parseStatsEvent(line);
        if (!event) continue;

        if (event.type === "player_seen") {
            playerIDs.add(event.playerID);
            updatedAt = event.timestamp;
        }

        if (event.type === "completed_game") {
            completedRoomEvents.add(`${event.roomCode}:${event.completedAt}`);
            updatedAt = event.completedAt;
        }
    }

    return {
        uniquePlayers: playerIDs.size,
        completedGames: completedRoomEvents.size,
        updatedAt,
    };
}

function appendStatsEvent(event: StatsEvent): void {
    const statsPath = getStatsEventsPath();
    if (!statsPath) return;

    fs.mkdirSync(path.dirname(statsPath), { recursive: true });
    fs.appendFileSync(statsPath, `${JSON.stringify(event)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
}

function getStatsEventsPath(): string | undefined {
    const configuredPath = process.env.BUGHOUSE_STATS_EVENTS_FILE?.trim();
    if (!configuredPath) return undefined;

    return path.resolve(configuredPath);
}

function parseStatsEvent(line: string): StatsEvent | undefined {
    const trimmed = line.trim();
    if (!trimmed) return undefined;

    try {
        const event = JSON.parse(trimmed) as Partial<StatsEvent>;

        if (
            event.type === "player_seen" &&
            typeof event.playerID === "string" &&
            typeof event.timestamp === "string"
        ) {
            return event as PlayerSeenEvent;
        }

        if (
            event.type === "completed_game" &&
            typeof event.roomCode === "string" &&
            Array.isArray(event.playerIDs) &&
            typeof event.completedAt === "string"
        ) {
            return event as CompletedGameEvent;
        }
    } catch {
        return undefined;
    }
}
