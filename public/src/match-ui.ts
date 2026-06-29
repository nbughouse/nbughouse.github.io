import { Color } from "@shared/chess";
import type { Player } from "@shared/player";
import type { Match } from "@shared/room";
import { RoomStatus, Team } from "@shared/room";
import {
    createBoardElement,
    createPocketElement,
    updateUIChess,
} from "./chess-ui";
import { gs } from "./session";
import { getAssetPath } from "./app-paths";

export let visualFlipped: boolean = false;
let intervalID: number;

// Visual Flip Control
export function setVisualFlipped(flipped: boolean): void {
    visualFlipped = flipped;
}

export function toggleVisualFlipped(): void {
    visualFlipped = !visualFlipped;
}

export function getMatchInstance(boardID: number): Match {
    return gs.room.game.matches[boardID];
}

export function getBoardFlipState(boardID: number): boolean {
    const match = gs.room.game.matches[boardID];
    const matchFlipped = match.flipped || false;
    // XOR: if both are flipped or both are not flipped, result is false (not flipped)
    // if one is flipped and the other is not, result is true (flipped)
    return matchFlipped !== visualFlipped;
}

function formatTime(time: number): string {
    const milliseconds = Math.max(time, 0);
    const totalSeconds = milliseconds / 1000;

    if (totalSeconds < 30) {
        // Show deciseconds (tenths of a second) for times under 30 seconds
        const seconds = Math.floor(totalSeconds);
        const deciseconds = Math.floor((totalSeconds % 1) * 10);
        return `${seconds}.${deciseconds}`;
    }

    // Standard MM:SS format for 30 seconds and above
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds) % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function createPocketRowElements(
    boardID: number,
    side: "top" | "bottom",
): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "pocket-row";

    const info = document.createElement("div");
    info.className = "player-info";
    info.id = `${side}-info-${boardID}`;

    const name = document.createElement("div");
    name.className = "player-name-display";

    const time = document.createElement("div");
    time.className = "player-time-display";

    info.append(name);
    info.append(time);

    const playerSlot = document.createElement("div");
    playerSlot.className = "player-slot";
    playerSlot.id = `${side}-player-slot-${boardID}`;

    const pocket = createPocketElement(boardID, side);

    row.append(playerSlot);
    row.append(info);
    row.append(pocket);

    return row;
}

// Match Element Creation
export function createMatchElements(boardID: number): void {
    const boardsArea = document.querySelector("#game-area");
    if (!boardsArea) return;

    const boardContainer = document.createElement("div");
    boardContainer.className = "match-container";
    boardContainer.dataset.boardID = boardID.toString();

    const topRow = createPocketRowElements(boardID, "top");
    boardContainer.append(topRow);

    const board = createBoardElement(boardID);
    boardContainer.append(board);

    const bottomRow = createPocketRowElements(boardID, "bottom");
    boardContainer.append(bottomRow);

    boardsArea.append(boardContainer);
}

// UI Update Functions - Players
export function updateUIAllPlayers(): void {
    for (let index = 0; index < gs.room.game.matches.length; index++)
        updateUIPlayers(index);
}

export function updateUIPlayers(boardID: number): void {
    const matchInstance = getMatchInstance(boardID);
    const isFlipped = getBoardFlipState(boardID);
    const { topPlayer, bottomPlayer, topColor, bottomColor } =
        getPlayerPositions(matchInstance, isFlipped);

    updateUIPlayerSlot(boardID, "top", topPlayer, topColor);
    updateUIPlayerSlot(boardID, "bottom", bottomPlayer, bottomColor);
}

function getPlayerPositions(matchInstance: Match, isFlipped: boolean) {
    return {
        topPlayer: isFlipped
            ? matchInstance.whitePlayer
            : matchInstance.blackPlayer,
        bottomPlayer: isFlipped
            ? matchInstance.blackPlayer
            : matchInstance.whitePlayer,
        topColor: isFlipped ? Color.WHITE : Color.BLACK,
        bottomColor: isFlipped ? Color.BLACK : Color.WHITE,
    };
}

function updateUIPlayerSlot(
    boardID: number,
    side: "top" | "bottom",
    player: Player | undefined,
    color: Color,
): void {
    const playerSlot = document.querySelector(
        `#${side}-player-slot-${boardID}`,
    ) as HTMLElement;
    const playerInfo = document.querySelector(
        `#${side}-info-${boardID}`,
    ) as HTMLElement;

    playerSlot.innerHTML = "";
    const slotContent = player
        ? createPlayerIcon(boardID, player, color)
        : createEmptySlot(boardID, color);
    playerSlot.append(slotContent);

    updatePlayerName(playerInfo, player);
}

function createEmptySlot(boardID: number, color: Color): HTMLElement {
    if (gs.room.status === RoomStatus.LOBBY) {
        const slot = document.createElement("button");
        slot.className = "join-board-btn";
        slot.textContent = "[+]";
        slot.addEventListener("click", () => {
            const oppTeam =
                getMatchInstance(boardID).getTeam(color) === Team.RED
                    ? Team.BLUE
                    : Team.RED;
            for (const match of gs.room.game.matches)
                if (match.getPlayerTeam(oppTeam)?.id === gs.player.id) return;

            gs.socket.emit("join-board", boardID, color);
        });
        return slot;
    } else {
        const slot = document.createElement("img");
        slot.className = "player-icon";
        slot.src = getAssetPath("img/default-icon.png");
        return slot;
    }
}

function createPlayerIcon(
    boardID: number,
    player: Player,
    color: Color,
): HTMLElement {
    const iconContainer = document.createElement("div");
    iconContainer.style.position = "relative";
    iconContainer.style.display = "inline-block";

    const slot = document.createElement("img");
    slot.className = "player-icon";
    slot.src = getAssetPath("img/default-icon.png");
    iconContainer.append(slot);

    const shouldShowLeaveButton =
        gs.room.status === RoomStatus.LOBBY && player.id === gs.player.id;

    if (shouldShowLeaveButton) {
        const leaveButton = createLeaveButton(boardID, color);
        iconContainer.append(leaveButton);
    }

    return iconContainer;
}

function createLeaveButton(boardID: number, color: Color): HTMLButtonElement {
    const leaveButton = document.createElement("button");
    leaveButton.className = "leave-board-btn";
    leaveButton.textContent = "×";
    leaveButton.addEventListener("click", () => {
        gs.socket.emit("leave-board", boardID, color);
    });
    return leaveButton;
}

function updatePlayerName(
    playerInfo: HTMLElement,
    player: Player | undefined,
): void {
    const name = playerInfo.querySelector(
        ".player-name-display",
    ) as HTMLElement;
    name.textContent = player ? player.name : "";
    name.style.color =
        player && player.id === gs.player.id
            ? "var(--text)"
            : "var(--hidden-text)";
}

// UI Update Functions - Time
export function updateUITime(): void {
    for (let index = 0; index < gs.room.game.matches.length; index++) {
        const matchInstance = getMatchInstance(index);

        const isFlipped = getBoardFlipState(index);

        const whiteTime = formatTime(matchInstance.whiteTime);
        const blackTime = formatTime(matchInstance.blackTime);

        const topTime = isFlipped ? whiteTime : blackTime;
        const bottomTime = isFlipped ? blackTime : whiteTime;

        updateTimeDisplay(index, "top", topTime);
        updateTimeDisplay(index, "bottom", bottomTime);
    }
}

function updateTimeDisplay(
    boardID: number,
    position: "top" | "bottom",
    timeString: string,
): void {
    const playerInfo = document.querySelector(
        `#${position}-info-${boardID}`,
    ) as HTMLElement;

    const timeDisplay = playerInfo.querySelector(
        ".player-time-display",
    ) as HTMLElement;

    timeDisplay.textContent = timeString;

    const color =
        (position === "top") === getBoardFlipState(boardID)
            ? Color.BLACK
            : Color.WHITE;
    const playing =
        gs.room.status === RoomStatus.PLAYING &&
        color !== getMatchInstance(boardID).chess.turn;
    timeDisplay.style.color =
        playing || gs.room.status === RoomStatus.LOBBY
            ? "var(--text)"
            : "var(--hidden-text)";
    playerInfo.style.border = playing ? "3px solid var(--green)" : "none";
}

export function updateTimeLeft(currentTime: number = Date.now()): void {
    for (let index = 0; index < gs.room.game.matches.length; index++) {
        const matchInstance = getMatchInstance(index);
        matchInstance.updateTime(currentTime);
    }
}

export function startTimeUpdates(): void {
    stopTimeUpdates();

    intervalID = globalThis.setInterval(() => {
        updateTimeLeft();
        updateUITime();
    }, 100); // Update every 100ms for smooth display
}

export function stopTimeUpdates(): void {
    clearInterval(intervalID);
}

// Global Update Functions
export function updateUIAllBoards(): void {
    for (let index = 0; index < gs.room.game.matches.length; index++)
        updateUIChess(index);
}

export function updateUIAllGame(): void {
    updateUIAllBoards();
    updateUIAllPlayers();
    updateUITime();
}
