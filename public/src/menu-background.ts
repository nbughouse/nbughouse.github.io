import { Player } from "@shared/player";
import { Room } from "@shared/room";
import { endGameUI, rebuildRoomBoardElements } from "./game-ui";
import { updateUIAllChat } from "./chat-ui";
import { clearLastMoves } from "./chess-ui";
import { clearLatestWinners, resetLowTimeWarnings, setVisualFlipped } from "./match-ui";
import { resetSidebarUI } from "./sidebar-ui";
import { sn } from "./session";

export function initMenuBackground(reset = false): void {
    const game = document.querySelector<HTMLElement>("#game");
    if (game) game.inert = true;
    if (!reset && document.querySelector("#game-area .match-container")) return;

    // Render the initial empty lobby through the same renderer used after joining.
    // Keep this local state out of the connected session once rendering finishes.
    const room = sn.room;
    const player = sn.player;
    try {
        sn.room = new Room("");
        sn.player ??= new Player("", "");
        clearLastMoves();
        clearLatestWinners();
        resetLowTimeWarnings();
        setVisualFlipped(false);
        resetSidebarUI();
        rebuildRoomBoardElements();
        endGameUI();
        updateUIAllChat();
        const roomCode = document.querySelector("#game-room-code");
        if (roomCode) roomCode.textContent = "";
        const chatInput = document.querySelector<HTMLInputElement>("#chat-input");
        if (chatInput) chatInput.value = "";
    } finally {
        sn.room = room;
        sn.player = player;
    }
    game?.style.removeProperty("visibility");
}
