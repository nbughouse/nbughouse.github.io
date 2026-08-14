import { sanitizeChatMessage } from "@shared/chat";
import { type Color, type Move } from "@shared/chess";
import { Player, sanitizePlayerName, type PlayerStatus } from "@shared/player";
import {
    Room,
    RoomStatus,
    type SerializedGame,
    type SerializedRoom,
    type Team,
} from "@shared/room";
import {
    endGameUI,
    rebuildRoomBoardElements,
    refreshDualBoardLayout,
    showRoomElements,
    startGameUI,
} from "./game-ui";
import {
    updateUIAllChat,
    updateStartButton,
    updateRoomSettingsUI,
    updateUIPlayerList,
    updateUIPushChat,
    getPlayerPlaqueAppearance,
} from "./sidebar-ui";
import { showError, showMenuScreen } from "./menu-ui";
import {
    clearLastMoves,
    rememberLastMove,
    suppressMoveAnimation,
} from "./chess-ui";
import {
    startTimeUpdates,
    stopTimeUpdates,
    rememberLatestWinners,
    updateUIAllBoards,
    updateUIAllPlayers,
    updateUIPlayers,
    updateUITime,
} from "./match-ui";
import { gs } from "./session";
import { updateURL } from "./url";

export function initGameSocket(): void {
    gs.socket.on("joined-room", (raw: SerializedRoom) => {
        const room = Room.deserialize(raw);

        gs.room = room;

        showRoomElements();
        updateUIPlayerList();
        updateUIAllChat();
        updateUIAllBoards();
        updateUIAllPlayers();
        updateUITime();

        if (room.status === RoomStatus.PLAYING) {
            startGameUI();
            startTimeUpdates();
        } else {
            endGameUI();
            stopTimeUpdates();
        }

        updateURL(room.code);
    });

    gs.socket.on("room-host-updated", (hostID: string | undefined) => {
        gs.room.hostID = hostID;
        updateUIPlayerList();
        updateRoomSettingsUI();
        updateStartButton();
    });

    gs.socket.on("banned-from-room", (roomCode: string) => {
        showMenuScreen();
        showError("menu-error", `You were banned from room ${roomCode}`);
    });

    gs.socket.on("p-joined-room", (id: string, name: string) => {
        if (id === gs.player.id) return;

        gs.room.addPlayer(new Player(id, sanitizePlayerName(name)));
        updateUIPlayerList();
    });

    gs.socket.on("p-left-room", (id: string) => {
        gs.room.removePlayer(id);
        updateUIPlayerList();
    });

    gs.socket.on("p-set-name", (id: string, name: string) => {
        const player = gs.room.getPlayer(id);
        if (!player) return;

        const sanitizedName = sanitizePlayerName(name);
        player.name = sanitizedName;
        if (id === gs.player.id) gs.player.name = sanitizedName;
        updateUIPlayerList();
        updateUIAllPlayers();
        updateUIAllChat();
    });

    gs.socket.on(
        "p-joined-board",
        (id: string, boardID: number, color: Color) => {
            const player = gs.room.getPlayer(id);

            if (!player) return;

            gs.room.game.matches[boardID].setPlayer(player, color);
            updateUIPlayers(boardID);
            updateUIPlayerList();
            updateUIAllChat();
            refreshDualBoardLayout();
        },
    );

    gs.socket.on("p-left-board", (boardID: number, color: Color) => {
        gs.room.game.matches[boardID].removePlayer(color);
        updateUIPlayers(boardID);
        updateUIPlayerList();
        updateUIAllChat();
        refreshDualBoardLayout();
    });

    gs.socket.on("p-set-status", (id: string, status: PlayerStatus) => {
        const player = gs.room.getPlayer(id);

        if (!player) return;

        player.status = status;
        updateUIPlayerList();
        updateUIAllPlayers();
        updateStartButton();
        refreshDualBoardLayout();
    });

    gs.socket.on("room-settings-updated", (raw: SerializedGame) => {
        gs.room.setGame(raw);
        const renderedBoardCount = document.querySelectorAll(
            "#game-area .match-container",
        ).length;
        if (renderedBoardCount !== gs.room.game.matches.length)
            rebuildRoomBoardElements();
        updateUIAllBoards();
        updateUIAllPlayers();
        updateUITime();
        updateUIPlayerList();
        updateUIAllChat();
        updateRoomSettingsUI();
        refreshDualBoardLayout();
    });

    gs.socket.on("started-room", (raw: SerializedGame, timeStarted: number) => {
        gs.room.status = RoomStatus.PLAYING;
        gs.room.setGame(raw);
        for (const match of gs.room.game.matches) match.lastMoveTime = timeStarted;
        clearLastMoves();
        startGameUI();
        updateUIPlayerList();
        updateUIAllChat();
        startTimeUpdates();

    });

    gs.socket.on(
        "p-moved-board",
        (boardID: number, move: Move, newTime: number) => {
            const currentMatch = gs.room.game.matches[boardID];

            currentMatch.updateTime(newTime);

            if (currentMatch.queued.color === currentMatch.chess.turn)
                currentMatch.queued.moves.shift();

            rememberLastMove(boardID, move);
            gs.room.game.doMove(boardID, move);

            for (const match of gs.room.game.matches) {
                if (match.queued.moves.length === 0) continue;
                if (
                    !match.chess.isLegal(
                        match.queued.moves[0],
                        match.queued.color !== match.chess.turn,
                        gs.room.game.getMoveRules(),
                    )
                )
                    match.queued.moves.length = 0;
            }

            currentMatch.updateTime(Date.now());
            updateUITime();
            updateUIAllBoards();

            if (
                currentMatch.queued.moves[0] &&
                currentMatch.chess.isLegal(
                    currentMatch.queued.moves[0],
                    false,
                    gs.room.game.getMoveRules(),
                )
            ) {
                suppressMoveAnimation(boardID, currentMatch.queued.moves[0]);
                gs.socket.emit(
                    "move-board",
                    boardID,
                    currentMatch.chess.turn,
                    currentMatch.queued.moves[0],
                );
            }
        },
    );

    gs.socket.on("ended-room", (team: Team, reason: string, time: number) => {
        for (const match of gs.room.game.matches) match.updateTime(time);

        rememberLatestWinners(team);
        gs.room.endRoom(team);
        clearLastMoves();
        endGameUI();
        stopTimeUpdates();
        updateUITime();
        updateUIPlayerList();
        updateUIPushChat({
            id: "server",
            message: `Team ${team} won! ${reason}`,
        });

    });

    gs.socket.on(
        "p-sent-chat",
        (id: string, message: string, isAllChat = false) => {
            const plaque = getPlayerPlaqueAppearance(id);
            const chatMessage = gs.room.chat.push(
                id,
                sanitizeChatMessage(message),
                plaque.color,
                plaque.opacity,
                plaque.badges,
                isAllChat,
            );
            updateUIPushChat(chatMessage);
        },
    );
}
