import { sanitizeChatMessage } from "@shared/chat";
import { Color, type Move } from "@shared/chess";
import type { GameConfig } from "@shared/config";
import {
    getPlayerDisplayName,
    isValidPlayerName,
    PLAYER_NAME_MAX_LENGTH,
    Player,
    PlayerStatus,
} from "@shared/player";
import { Room, RoomStatus, Team } from "@shared/room";
import type { GameSocket } from "./index";
import { io, profiles, rooms } from "./index";
import { recordCompletedGame } from "./stats-store";
import { saveProfiles } from "./profile-store";

export function setupHandlers(socket: GameSocket): void {
    socket.on("ping", () => {
        socket.emit("pong");
    });

    socket.on("set-name", (name: string) => {
        if (typeof name !== "string") return;

        const trimmedName = name.trim().slice(0, PLAYER_NAME_MAX_LENGTH);
        if (!trimmedName) return;
        if (!isValidPlayerName(trimmedName)) {
            socket.emit(
                "error",
                "Names can only use letters, numbers, and underscores",
            );
            return;
        }

        const room = socket.room;
        const roomPlayer = room?.players.get(socket.player.id);
        if (
            room &&
            roomPlayer &&
            roomHasDisplayName(room, trimmedName, socket.player.id)
        ) {
            socket.emit("error", "That name is already taken in this room");
            return;
        }

        socket.player.name = trimmedName;

        const profile = profiles.get(socket.player.id);
        if (profile) {
            profile.name = trimmedName;
            saveProfiles(profiles);
        }

        if (room && roomPlayer) {
            roomPlayer.name = trimmedName;
            io.to(room.code).emit(
                "p-set-name",
                socket.player.id,
                trimmedName,
            );
        }
    });

    socket.on("create-room", () => {
        const code = createRoom(undefined, socket.player.id);
        if (!code) {
            socket.emit("error", "Room limit reached");
            return;
        }

        joinRoom(socket, code);
    });

    socket.on("join-room", (code: string) => {
        joinRoom(socket, code.toUpperCase());
    });

    socket.on("leave-room", () => {
        handlePlayerLeave(socket);
    });

    socket.on("disconnect", () => {
        handlePlayerLeave(socket);
    });

    socket.on("start-room", () => {
        if (!socket.room || socket.room.status !== RoomStatus.LOBBY) return;
        if (socket.room.hostID !== socket.player.id) return;

        const currentTime = Date.now();
        if (socket.room.tryStartRoom(currentTime)) {
            io.to(socket.room.code).emit(
                "started-room",
                socket.room.game.serialize(),
                currentTime,
            );
        }
    });

    socket.on("update-room-settings", (settings: Partial<GameConfig>) => {
        if (!socket.room || socket.room.status !== RoomStatus.LOBBY) return;
        if (socket.room.hostID !== socket.player.id) return;

        if (!socket.room.updateConfig(settings)) return;

        io.to(socket.room.code).emit(
            "room-settings-updated",
            socket.room.game.serialize(),
        );
        io.to(socket.room.code).emit("room-host-updated", socket.room.hostID);
    });

    socket.on("send-chat", (message: string) => {
        if (!socket.room) return;
        if (typeof message !== "string") return;

        const trimmedMessage = sanitizeChatMessage(message);
        if (!trimmedMessage) return;

        if (trimmedMessage.toLowerCase().startsWith("/ban ")) {
            handleBanCommand(socket, trimmedMessage.slice(5).trim());
            return;
        }

        const allChatPrefix = "/a ";
        const isAllChatOverride = trimmedMessage.startsWith(allChatPrefix);
        const outgoingMessage = isAllChatOverride
            ? trimmedMessage.slice(allChatPrefix.length).trim()
            : trimmedMessage;
        if (!outgoingMessage) return;

        const player = socket.room.getPlayer(socket.player.id);
        const team =
            player?.status === PlayerStatus.SPECTATING
                ? undefined
                : getPlayerTeam(socket);
        const sendToAll =
            socket.room.status !== RoomStatus.PLAYING ||
            isAllChatOverride ||
            !team ||
            !hasTeammate(socket.room, team, socket.player.id);

        if (sendToAll) {
            socket.room.chat.push(socket.player.id, outgoingMessage);
            io.to(socket.room.code).emit(
                "p-sent-chat",
                socket.player.id,
                outgoingMessage,
            );
            return;
        }

        emitTeamChat(socket.room, team, socket.player.id, outgoingMessage);
    });

    socket.on("join-board", (boardID: number, color: Color) => {
        if (!socket.room || socket.room.status !== RoomStatus.LOBBY) return;

        const board = socket.room.game.matches[boardID];
        const oppTeam =
            board.getTeam(color) === Team.RED ? Team.BLUE : Team.RED;

        for (const match of socket.room.game.matches)
            if (match.getPlayerTeam(oppTeam)?.id === socket.player.id) return;

        const player = socket.room.getPlayer(socket.player.id);
        if (!player) return;

        const wasSpectating = player.status === PlayerStatus.SPECTATING;
        player.status = PlayerStatus.CONNECTED;
        board.setPlayer(player, color);
        if (wasSpectating)
            io.to(socket.room.code).emit(
                "p-set-status",
                socket.player.id,
                PlayerStatus.CONNECTED,
            );
        io.to(socket.room.code).emit(
            "p-joined-board",
            socket.player.id,
            boardID,
            color,
        );
    });

    socket.on("move-board", (boardID: number, color: Color, move: Move) => {
        if (!socket.room || socket.room.status !== RoomStatus.PLAYING) return;

        const board = socket.room.game.matches[boardID];

        if (
            board.getPlayer(color)?.id !== socket.player.id ||
            !board.chess.isLegal(move, false, socket.room.game.getMoveRules())
        )
            return;

        const currentTime = Date.now();
        board.updateTime(currentTime);
        socket.room.game.doMove(boardID, move);

        io.to(socket.room.code).emit(
            "p-moved-board",
            boardID,
            move,
            currentTime,
        );

        const kingWinner = socket.room.game.checkKingAccumulation();
        if (kingWinner) {
            recordCompletedGame(socket.room);
            socket.room.endRoom(kingWinner);
            io.to(socket.room.code).emit(
                "ended-room",
                kingWinner,
                `${kingWinner === Team.BLUE ? "Blue" : "Red"} captured all kings!`,
                currentTime,
            );
        } else if (
            !socket.room.game.getMoveRules().allowKingCapture &&
            board.chess.isCheckmate()
        ) {
            const winningTeam = board.getTeam(color);
            const winner = board.getPlayer(color);
            if (!winner) return;

            recordCompletedGame(socket.room);
            socket.room.endRoom(winningTeam);
            io.to(socket.room.code).emit(
                "ended-room",
                winningTeam,
                getPlayerDisplayName(winner) + " won!",
                currentTime,
            );
        }
    });

    socket.on("leave-board", (boardID: number, color: Color) => {
        if (!socket.room || socket.room.status !== RoomStatus.LOBBY) return;

        const board = socket.room.game.matches[boardID];
        if (board.getPlayer(color)?.id !== socket.player.id) return;

        board.removePlayer(color);
        io.to(socket.room.code).emit("p-left-board", boardID, color);
    });

    socket.on("toggle-spectator", () => {
        if (
            !socket.room ||
            (socket.room.status !== RoomStatus.LOBBY &&
                socket.room.status !== RoomStatus.PLAYING)
        )
            return;

        const player = socket.room.getPlayer(socket.player.id);
        if (!player) return;
        if (socket.room.status === RoomStatus.PLAYING && getPlayerTeam(socket))
            return;

        if (player.status === PlayerStatus.SPECTATING) {
            player.status = PlayerStatus.CONNECTED;
            io.to(socket.room.code).emit(
                "p-set-status",
                socket.player.id,
                PlayerStatus.CONNECTED,
            );
            return;
        }

        if (socket.room.status === RoomStatus.PLAYING) {
            player.status = PlayerStatus.SPECTATING;
            io.to(socket.room.code).emit(
                "p-set-status",
                socket.player.id,
                PlayerStatus.SPECTATING,
            );
            return;
        }

        const vacatedSeats = getPlayerSeats(socket.room, socket.player.id);
        player.status = PlayerStatus.SPECTATING;

        socket.room.removePlayerFromBoards(socket.player.id);

        for (const { boardID, color } of vacatedSeats)
            io.to(socket.room.code).emit("p-left-board", boardID, color);

        io.to(socket.room.code).emit(
            "p-set-status",
            socket.player.id,
            PlayerStatus.SPECTATING,
        );
    });

    socket.on("resign-room", () => {
        if (!socket.room || socket.room.status !== RoomStatus.PLAYING) return;

        const playerTeam = getPlayerTeam(socket);
        if (!playerTeam) return;

        const winningTeam = playerTeam === Team.BLUE ? Team.RED : Team.BLUE;

        recordCompletedGame(socket.room);
        socket.room.endRoom(winningTeam);
        io.to(socket.room.code).emit(
            "ended-room",
            winningTeam,
            "Resigned by " + getPlayerDisplayName(socket.player),
            Date.now(),
        );
    });
}

function getPlayerTeam(socket: GameSocket): Team | undefined {
    if (!socket.room) return;

    return getPlayerTeamInRoom(socket.room, socket.player.id);
}

function getPlayerTeamInRoom(room: Room, playerID: string): Team | undefined {
    for (const match of room.game.matches) {
        if (match.getPlayerTeam(Team.BLUE)?.id === playerID)
            return Team.BLUE;

        if (match.getPlayerTeam(Team.RED)?.id === playerID)
            return Team.RED;
    }
}

function hasTeammate(room: Room, team: Team, playerID: string): boolean {
    for (const match of room.game.matches) {
        const teammate = match.getPlayerTeam(team);
        if (teammate && teammate.id !== playerID) return true;
    }

    return false;
}

function emitTeamChat(
    room: Room,
    team: Team,
    playerID: string,
    message: string,
): void {
    for (const connectedSocket of io.sockets.sockets.values()) {
        const recipient = connectedSocket as GameSocket;
        if (recipient.room?.code !== room.code) continue;
        if (getPlayerTeamInRoom(room, recipient.player.id) !== team) continue;

        recipient.emit("p-sent-chat", playerID, message);
    }
}

function handleBanCommand(socket: GameSocket, targetName: string): void {
    const room = socket.room;
    if (!room || !targetName) return;

    if (room.hostID !== socket.player.id) {
        emitServerChat(socket, "Only the host can ban players from this room.");
        return;
    }

    const target = findPlayerByDisplayName(room, targetName);
    if (!target) {
        emitServerChat(socket, `No player named "${targetName}" is in this room.`);
        return;
    }

    if (target.id === socket.player.id) {
        emitServerChat(socket, "The host cannot ban themselves.");
        return;
    }

    banPlayerFromRoom(room, target.id);
    io.to(room.code).emit(
        "p-sent-chat",
        "server",
        `${getPlayerDisplayName(target)} was banned from the room.`,
    );
}

function banPlayerFromRoom(room: Room, playerID: string): void {
    const vacatedSeats = getPlayerSeats(room, playerID);
    room.bannedPlayerIDs.add(playerID);
    room.removePlayer(playerID);

    for (const connectedSocket of io.sockets.sockets.values()) {
        const targetSocket = connectedSocket as GameSocket;
        if (
            targetSocket.player?.id !== playerID ||
            targetSocket.room?.code !== room.code
        )
            continue;

        targetSocket.leave(room.code);
        targetSocket.room = undefined;
        targetSocket.emit("banned-from-room", room.code);
    }

    io.to(room.code).emit("p-left-room", playerID);
    for (const { boardID, color } of vacatedSeats)
        io.to(room.code).emit("p-left-board", boardID, color);
    io.to(room.code).emit("room-host-updated", room.hostID);
}

function emitServerChat(socket: GameSocket, message: string): void {
    socket.emit("p-sent-chat", "server", message);
}

function findPlayerByDisplayName(
    room: Room,
    displayName: string,
): Player | undefined {
    const normalizedDisplayName = normalizeDisplayName(displayName);
    for (const player of room.players.values())
        if (normalizeDisplayName(getPlayerDisplayName(player)) === normalizedDisplayName)
            return player;
}

function roomHasDisplayName(
    room: Room,
    displayName: string,
    exceptPlayerID?: string,
): boolean {
    const normalizedDisplayName = normalizeDisplayName(displayName);
    for (const player of room.players.values()) {
        if (player.id === exceptPlayerID) continue;
        if (normalizeDisplayName(getPlayerDisplayName(player)) === normalizedDisplayName)
            return true;
    }

    return false;
}

function normalizeDisplayName(name: string): string {
    return name.trim().toLocaleLowerCase();
}

function createRoom(roomCode?: string, hostID?: string): string | undefined {
    if (rooms.size >= 10_000) return;

    const code = roomCode || randomCode();
    const room = new Room(code, hostID);
    rooms.set(code, room);
    return code;
}

function joinRoom(socket: GameSocket, code: string): void {
    const room = rooms.get(code);

    if (!room) {
        socket.emit("error", "Room not found");
        return;
    }

    if (room.bannedPlayerIDs.has(socket.player.id)) {
        socket.emit("error", "You are banned from this room");
        return;
    }

    if (socket.room?.code === code || hasAnotherRoomConnection(socket, code)) {
        socket.emit("error", "You have already joined this room");
        return;
    }

    if (room.status === RoomStatus.PLAYING)
        for (const match of room.game.matches) match.updateTime(Date.now());

    const playerInRoom = room.players.get(socket.player.id);
    const duplicateNameExceptID = playerInRoom ? socket.player.id : undefined;
    if (roomHasDisplayName(room, socket.player.name, duplicateNameExceptID)) {
        socket.emit("error", "That name is already taken in this room");
        return;
    }

    if (socket.room) handlePlayerLeave(socket);

    socket.join(code);
    socket.room = room;

    if (playerInRoom) {
        playerInRoom.name = socket.player.name;
        playerInRoom.status = PlayerStatus.CONNECTED;
        socket.emit("joined-room", room.serialize());
        socket
            .to(room.code)
            .emit("p-set-name", socket.player.id, socket.player.name);
        socket
            .to(room.code)
            .emit("p-set-status", socket.player.id, PlayerStatus.CONNECTED);
    } else {
        const roomPlayer = new Player(
            socket.player.id,
            socket.player.name,
            PlayerStatus.CONNECTED,
        );
        room.addPlayer(roomPlayer);
        io.to(room.code).emit(
            "p-joined-room",
            socket.player.id,
            socket.player.name,
        );
        socket.emit("joined-room", room.serialize());
    }
}

function hasAnotherRoomConnection(socket: GameSocket, code: string): boolean {
    for (const connectedSocket of io.sockets.sockets.values()) {
        const otherSocket = connectedSocket as GameSocket;
        if (
            otherSocket.id !== socket.id &&
            otherSocket.player?.id === socket.player.id &&
            otherSocket.room?.code === code
        )
            return true;
    }

    return false;
}

function handlePlayerLeave(socket: GameSocket): void {
    const room = socket.room;
    if (!room) return;

    socket.leave(room.code);

    if (room.status === RoomStatus.LOBBY) handleLobbyPlayerLeave(socket, room);
    else handleGamePlayerDisconnect(socket, room);

    socket.room = undefined;

    if (shouldDeleteRoom(room)) deleteRoom(room.code);
}

function handleLobbyPlayerLeave(socket: GameSocket, room: Room): void {
    const vacatedSeats = getPlayerSeats(room, socket.player.id);

    room.removePlayer(socket.player.id);
    socket.to(room.code).emit("p-left-room", socket.player.id);

    for (const { boardID, color } of vacatedSeats)
        socket.to(room.code).emit("p-left-board", boardID, color);

    socket.to(room.code).emit("room-host-updated", room.hostID);
}

function handleGamePlayerDisconnect(socket: GameSocket, room: Room): void {
    const player = room.players.get(socket.player.id);
    if (!player) return;

    if (getPlayerSeats(room, socket.player.id).length === 0) {
        room.removePlayer(socket.player.id);
        socket.to(room.code).emit("p-left-room", socket.player.id);
        socket.to(room.code).emit("room-host-updated", room.hostID);
        return;
    }

    player.status = PlayerStatus.DISCONNECTED;
    socket
        .to(room.code)
        .emit("p-set-status", socket.player.id, PlayerStatus.DISCONNECTED);
}

function shouldDeleteRoom(room: Room): boolean {
    return room.status === RoomStatus.LOBBY && room.players.size === 0;
}

function deleteRoom(roomCode: string): void {
    rooms.delete(roomCode);
}

function getPlayerSeats(
    room: Room,
    playerID: string,
): { boardID: number; color: Color }[] {
    const seats = [];

    for (let boardID = 0; boardID < room.game.matches.length; boardID++) {
        const match = room.game.matches[boardID];
        if (match.whitePlayer?.id === playerID)
            seats.push({ boardID, color: Color.WHITE });
        if (match.blackPlayer?.id === playerID)
            seats.push({ boardID, color: Color.BLACK });
    }

    return seats;
}

function randomCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";

    do {
        result = "";
        for (let index = 0; index < 4; index++)
            result += chars.charAt(Math.floor(Math.random() * chars.length));
    } while (rooms.has(result));

    return result;
}
