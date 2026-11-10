import { Color, type Move } from "@shared/chess";
import { assignBotRoomHuman, configureBotRoom, fillBotSeats, submitBotRoomMove, updateBotRoomSettings, type BotOptions } from "@shared/bots";
import { Player } from "@shared/player";
import { Room, RoomStatus, Team } from "@shared/room";
import type { GameConnection } from "./game-connection";

interface LocalSession {
    game: GameConnection;
    player: Player | undefined;
    onlinePlayer: Player | undefined;
    name: string;
}

export function openLocalBotGame(session: LocalSession, options: BotOptions): void {
    session.game.closeLocal();
    const previousPlayer = session.player;
    const player = new Player(previousPlayer?.id ?? "local-human", session.name || "You");
    const room = new Room("SOLO", player.id);
    configureBotRoom(room, options, player);
    session.player = player;
    session.onlinePlayer = previousPlayer;
    let timer: ReturnType<typeof setInterval> | undefined;
    const publish = (event: string, ...args: unknown[]) =>
        session.game.publish(event, ...structuredClone(args));
    const snapshot = () => publish("joined-room", room.serialize());
    const end = (winner: Team | undefined, reason: string, now = Date.now()) => {
        room.game.updateTime(now);
        room.endRoom(winner);
        publish("ended-room", winner, reason, now);
    };
    session.game.useLocal((event: string, ...args: any[]) => {
        if (event === "start-room") {
            fillBotSeats(room);
            snapshot();
            const now = Date.now();
            if (room.tryStartRoom(now)) publish("started-room", room.game.serialize(), now);
        } else if (event === "update-bot-settings") {
            if (updateBotRoomSettings(room, args[0], args[1], args[2]))
                publish("bot-room-updated", room.serialize());
        } else if (event === "move-board" || event === "bot-move") {
            const [boardID, color, move, revision] = args as [number, Color, Move, number?];
            const result = submitBotRoomMove(room, player.id, boardID, color, move,
                Date.now(), event === "bot-move" ? revision : undefined);
            if (!result) {
                snapshot();
                return;
            }
            if (result.moved) publish("p-moved-board", boardID, move, room.game.matches[boardID].lastMoveTime);
            if (result.end) end(result.end.winner, result.end.reason);
        } else if (event === "resign-room" && room.status === RoomStatus.PLAYING) {
            const match = room.game.matches.find(match =>
                match.whitePlayer?.id === player.id || match.blackPlayer?.id === player.id);
            if (!match) return;
            const team = match.getTeam(match.whitePlayer?.id === player.id ? Color.WHITE : Color.BLACK);
            end(team === Team.RED ? Team.BLUE : Team.RED, "You resigned.");
        } else if (event === "ping") publish("pong");
        else if (event === "send-chat" && typeof args[0] === "string")
            publish("p-sent-chat", player.id, args[0]);
        else if (event === "leave-board" && room.status === RoomStatus.LOBBY) {
            room.removePlayerFromBoards(player.id);
            fillBotSeats(room);
            snapshot();
        } else if (event === "join-board" && room.status === RoomStatus.LOBBY) {
            const [boardID, color] = args as [number, Color];
            if (assignBotRoomHuman(room, player.id, boardID, color)) snapshot();
        } else if (event === "assign-player-board") {
            const [playerID, boardID, color] = args as [string, number, Color];
            if (assignBotRoomHuman(room, playerID, boardID, color)) snapshot();
        } else if (event === "bot-engine-error") {
            if (room.status === RoomStatus.PLAYING) end(undefined, "Bot engine stopped. Return home and try again.");
        }
    }, () => {
        clearInterval(timer);
        session.player = session.onlinePlayer;
        session.onlinePlayer = undefined;
    });
    timer = globalThis.setInterval(() => {
        if (room.status !== RoomStatus.PLAYING) return;
        const now = Date.now();
        room.game.updateTime(now);
        const timeout = room.game.checkTimeout();
        if (timeout) end(timeout.team === Team.RED ? Team.BLUE : Team.RED, "Time expired.", now);
    }, 100);
    snapshot();
}
