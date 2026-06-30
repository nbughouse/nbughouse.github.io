import { type Color, type Move } from "@shared/chess";
import { Player, type PlayerStatus } from "@shared/player";
import {
    Game,
    Room,
    RoomStatus,
    type SerializedGame,
    type SerializedRoom,
    type Team,
} from "@shared/room";
import {
    endGameUI,
    playAudio,
    showRoomElements,
    startGameUI,
    updateUIAllChat,
    updateUIPlayerList,
    updateUIPushChat,
} from "./game-ui";
import {
    startTimeUpdates,
    stopTimeUpdates,
    updateUIAllBoards,
    updateUIAllPlayers,
    updateUIPlayers,
    updateUITime,
} from "./match-ui";
import { gs } from "./session";
import { updateURL } from "./url";

export function initGameSocket(): void {
    gs.socket.on("sent-player", (name: string) => {
        gs.player.name = name;
        gs.name = name;
        sessionStorage.setItem("name", name);
    });

    gs.socket.on("joined-room", (raw: SerializedRoom) => {
        const room = Room.deserialize(raw);

        gs.room = room;
        gs.player = room.players.get(gs.player.id) ?? gs.player;

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

    gs.socket.on("p-joined-room", (id: string, name: string) => {
        if (id === gs.player.id) return;

        gs.room.addPlayer(new Player(id, name));
        updateUIPlayerList();
    });

    gs.socket.on("p-left-room", (id: string) => {
        gs.room.removePlayer(id);
        updateUIPlayerList();
    });

    gs.socket.on(
        "p-joined-board",
        (id: string, boardID: number, color: Color) => {
            const player = gs.room.getPlayer(id);

            if (!player) return;

            gs.room.game.matches[boardID].setPlayer(player, color);
            updateUIPlayers(boardID);
        },
    );

    gs.socket.on("p-left-board", (boardID: number, color: Color) => {
        gs.room.game.matches[boardID].removePlayer(color);
        updateUIPlayers(boardID);
    });

    gs.socket.on("p-set-status", (id: string, status: PlayerStatus) => {
        const player = gs.room.getPlayer(id);

        if (!player) return;

        player.status = status;
        updateUIPlayerList();
    });

    gs.socket.on("started-room", (raw: SerializedGame, timeStarted: number) => {
        gs.room.status = RoomStatus.PLAYING;
        gs.room.game = Game.deserialize(raw);
        gs.room.tryStartRoom(timeStarted);
        startGameUI();
        startTimeUpdates();

        playAudio("game-start.mp3");
    });

    gs.socket.on(
        "p-moved-board",
        (boardID: number, move: Move, newTime: number) => {
            const currentMatch = gs.room.game.matches[boardID];

            currentMatch.updateTime(newTime);

            if (currentMatch.queued.color === currentMatch.chess.turn)
                currentMatch.queued.moves.shift();

            gs.room.game.doMove(boardID, move);

            for (const match of gs.room.game.matches) {
                if (match.queued.moves.length === 0) continue;
                if (
                    !match.chess.isLegal(
                        match.queued.moves[0],
                        match.queued.color !== match.chess.turn,
                    )
                )
                    match.queued.moves.length = 0;
            }

            currentMatch.updateTime(Date.now());
            updateUITime();
            updateUIAllBoards();

            if (
                currentMatch.queued.moves[0] &&
                currentMatch.chess.isLegal(currentMatch.queued.moves[0])
            ) {
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

        gs.room.endRoom(team);
        endGameUI();
        stopTimeUpdates();
        updateUIPushChat({
            id: "server",
            message: `Team ${team} won! ${reason}`,
        });

        playAudio("game-end.mp3");
    });

    gs.socket.on("p-sent-chat", (id: string, message: string) => {
        gs.room.chat.push(id, message);
        updateUIPushChat({ id, message });
    });
}
