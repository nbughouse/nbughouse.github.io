import { sanitizeChatMessage } from "@shared/chat";
import { Color, type Move, positionsEqual } from "@shared/chess";
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
    updateUIPushChat,
    getPlayerPlaqueAppearance,
} from "./chat-ui";
import {
    updateStartButton,
    updateUIPlayerList,
} from "./sidebar-ui";
import { updateRoomSettingsUI } from "./room-settings-ui";
import { showError, showMenuScreen } from "./menu-ui";
import {
    clearLastMoves,
    rememberLastMove,
    suppressMoveAnimation,
} from "./chess-ui";
import {
    areClientClocksEnabled,
    startTimeUpdates,
    stopTimeUpdates,
    rememberLatestWinners,
    resetLowTimeWarnings,
    updateUIAllBoards,
    updateUIAllPlayers,
    updateUIPlayers,
    updateUITime,
} from "./match-ui";
import { gs } from "./session";
import { playSound } from "./sound-ui";
import { updateURL } from "./url";

export function initGameSocket(): void {
    gs.socket.on("joined-room", (raw: SerializedRoom) => {
        const room = Room.deserialize(raw);

        gs.room = room;
        resetLowTimeWarnings();

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
        resetLowTimeWarnings();
        playSound("newChallenge");
        startGameUI();
        updateUIPlayerList();
        updateUIAllChat();
        startTimeUpdates();
    });

    gs.socket.on(
        "p-moved-board",
        (boardID: number, move: Move, newTime: number) => {
            const currentMatch = gs.room.game.matches[boardID];
            const rules = gs.room.game.getMoveRules();

            if (areClientClocksEnabled()) currentMatch.updateTime(newTime);

            if (
                rules.turnless &&
                currentMatch.queued.moves[0] &&
                movesEqual(currentMatch.queued.moves[0], move)
            )
                currentMatch.queued.moves.shift();
            else if (
                !rules.turnless &&
                currentMatch.queued.color === currentMatch.chess.turn
            )
                currentMatch.queued.moves.shift();

            rememberLastMove(boardID, move);
            gs.room.game.doMove(boardID, move, newTime);

            for (const match of gs.room.game.matches) {
                if (match.queued.moves.length === 0) continue;
                if (
                    !match.chess.isLegal(
                        match.queued.moves[0],
                        rules.turnless
                            ? false
                            : match.queued.color !== match.chess.turn,
                        rules,
                    )
                )
                    match.queued.moves.length = 0;
            }

            if (areClientClocksEnabled()) currentMatch.updateTime(Date.now());
            updateUITime();
            updateUIAllBoards();

            if (
                !rules.turnless &&
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

    gs.socket.on(
        "ended-room",
        (team: Team | undefined, reason: string, time: number) => {
            if (areClientClocksEnabled())
                for (const match of gs.room.game.matches)
                    match.updateTime(time);

            playEndRoomSound(team);
            if (team) rememberLatestWinners(team);
            gs.room.endRoom(team);
            clearLastMoves();
            resetLowTimeWarnings();
            endGameUI();
            stopTimeUpdates();
            updateUITime();
            updateUIPlayerList();
            updateUIPushChat({
                id: "server",
                message: team
                    ? `Team ${team} won! ${reason}`
                    : `Game ended. ${reason}`,
            });
        },
    );

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

function playEndRoomSound(team: Team | undefined): void {
    if (!team) {
        playSound("draw");
        return;
    }

    const localTeam = getLocalPlayerTeam();
    if (!localTeam) return;

    playSound(localTeam === team ? "victory" : "defeat");
}

function getLocalPlayerTeam(): Team | undefined {
    for (const match of gs.room.game.matches) {
        if (match.whitePlayer?.id === gs.player.id)
            return match.getTeam(Color.WHITE);
        if (match.blackPlayer?.id === gs.player.id)
            return match.getTeam(Color.BLACK);
    }
    return undefined;
}

function movesEqual(first: Move, second: Move): boolean {
    return (
        positionsEqual(first.from, second.from) &&
        positionsEqual(first.to, second.to) &&
        first.promotion === second.promotion
    );
}
