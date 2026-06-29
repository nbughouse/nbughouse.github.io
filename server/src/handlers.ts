import type { Server } from "socket.io";
import type { Color, Move } from "@shared/chess";
import { PlayerStatus } from "@shared/player";
import { Room, RoomStatus, Team } from "@shared/room";
import type { GameSocket } from "./index";
import { emitRoomList, io, MENU_ROOM, rooms } from "./index";

export function setupHandlers(socket: GameSocket): void {
    socket.on("ping", () => {
        socket.emit("pong");
    });

    socket.on("set-name", (name: string) => {
        socket.player.name = name.trim().slice(0, 20);
    });

    socket.on("create-room", () => {
        const code = createRoom();
        if (!code) {
            socket.emit("error", "Room limit reached");
            return;
        }

        joinRoom(socket, io, code);
        emitRoomList();
    });

    socket.on("join-room", (code: string) => {
        joinRoom(socket, io, code.toUpperCase());
        emitRoomList();
    });

    socket.on("leave-room", () => {
        handlePlayerLeave(socket);
        socket.join(MENU_ROOM);
    });

    socket.on("disconnect", () => {
        handlePlayerLeave(socket);
    });

    socket.on("toggle-ready", () => {
        if (!socket.room || socket.room.status === RoomStatus.PLAYING) return;

        socket.player.status =
            socket.player.status === PlayerStatus.READY
                ? PlayerStatus.NOT_READY
                : PlayerStatus.READY;

        io.to(socket.room.code).emit(
            "p-set-status",
            socket.player.id,
            socket.player.status,
        );

        const currentTime = Date.now();
        if (socket.room.tryStartRoom()) {
            io.to(socket.room.code).emit(
                "started-room",
                socket.room.game.serialize(),
                currentTime,
            );
        }
    });

    socket.on("send-chat", (message: string) => {
        if (!socket.room) return;

        const trimmedMessage = message.trim().slice(0, 200);
        socket.room.chat.push(socket.player.id, trimmedMessage);
        io.to(socket.room.code).emit(
            "p-sent-chat",
            socket.player.id,
            trimmedMessage,
        );
    });

    socket.on("join-board", (boardID: number, color: Color) => {
        if (!socket.room || socket.room.status !== RoomStatus.LOBBY) return;

        const board = socket.room.game.matches[boardID];
        const oppTeam =
            board.getTeam(color) === Team.RED ? Team.BLUE : Team.RED;

        for (const match of socket.room.game.matches)
            if (match.getPlayerTeam(oppTeam)?.id === socket.player.id) return;

        board.setPlayer(socket.player, color);
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
            !board.chess.isLegal(move, false)
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

        if (board.chess.isCheckmate()) {
            const winningTeam = board.getTeam(color);
            const winnerName = board.getPlayer(color)?.name;

            socket.room.endRoom(winningTeam);
            io.to(socket.room.code).emit(
                "ended-room",
                winningTeam,
                winnerName + " won!",
                currentTime,
            );
        }
    });

    socket.on("leave-board", (boardID: number, color: Color) => {
        if (!socket.room || socket.room.status !== RoomStatus.LOBBY) return;

        socket.room.game.matches[boardID].removePlayer(color);
        io.to(socket.room.code).emit("p-left-board", boardID, color);
    });

    socket.on("resign-room", () => {
        if (!socket.room || socket.room.status !== RoomStatus.PLAYING) return;

        const playerTeam = getPlayerTeam(socket);
        if (!playerTeam) return;

        socket.room.endRoom(playerTeam === Team.BLUE ? Team.RED : Team.BLUE);
        io.to(socket.room.code).emit(
            "ended-room",
            playerTeam,
            "Resigned by " + socket.player.name,
            Date.now(),
        );
    });
}

function getPlayerTeam(socket: GameSocket): Team | undefined {
    if (!socket.room) return;

    for (const match of socket.room.game.matches) {
        if (match.getPlayerTeam(Team.BLUE)?.id === socket.player.id)
            return Team.BLUE;

        if (match.getPlayerTeam(Team.RED)?.id === socket.player.id)
            return Team.RED;
    }
}

function createRoom(roomCode?: string): string | undefined {
    if (rooms.size >= 10_000) return;

    const code = roomCode || randomCode();
    const room = new Room(code);
    rooms.set(code, room);
    return code;
}

function joinRoom(socket: GameSocket, io: Server, code: string): void {
    const room = rooms.get(code);

    if (!room) {
        socket.emit("error", "Room not found");
        return;
    }

    socket.leave(MENU_ROOM);
    socket.join(code);
    socket.room = room;

    if (room.status === RoomStatus.PLAYING)
        for (const match of room.game.matches) match.updateTime(Date.now());

    const playerInRoom = room.players.get(socket.player.id);
    if (playerInRoom) {
        playerInRoom.status = PlayerStatus.NOT_READY;
        socket.emit("joined-room", room.serialize());
        socket
            .to(room.code)
            .emit("p-set-status", socket.player.id, PlayerStatus.NOT_READY);
    } else {
        socket.player.status = PlayerStatus.NOT_READY;
        room.addPlayer(socket.player);
        io.to(room.code).emit(
            "p-joined-room",
            socket.player.id,
            socket.player.name,
        );
        socket.emit("joined-room", room.serialize());
    }
}

function handlePlayerLeave(socket: GameSocket): void {
    const room = socket.room;
    if (!room) return;

    socket.leave(room.code);

    if (room.status === RoomStatus.LOBBY) handleLobbyPlayerLeave(socket, room);
    else handleGamePlayerDisconnect(socket, room);

    if (shouldDeleteRoom(room)) deleteRoom(room.code);
}

function handleLobbyPlayerLeave(socket: GameSocket, room: Room): void {
    room.removePlayer(socket.player.id);
    socket.to(room.code).emit("p-left-room", socket.player.id);
    emitRoomList();
}

function handleGamePlayerDisconnect(socket: GameSocket, room: Room): void {
    const player = room.players.get(socket.player.id);
    if (!player) return;

    player.status = PlayerStatus.DISCONNECTED;
    socket
        .to(room.code)
        .emit("p-set-status", socket.player.id, PlayerStatus.DISCONNECTED);
}

function shouldDeleteRoom(room: Room): boolean {
    return room.allPlayersDisconnected();
}

function deleteRoom(roomCode: string): void {
    rooms.delete(roomCode);
    emitRoomList();
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
