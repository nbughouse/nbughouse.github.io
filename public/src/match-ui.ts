import { Color } from "@shared/chess";
import { getPlayerDisplayName, type Player } from "@shared/player";
import type { Match } from "@shared/room";
import { RoomStatus, Team } from "@shared/room";
import {
    createBoardElement,
    createPocketElement,
    updateUIChess,
} from "./chess-ui";
import { gs } from "./session";

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

function formatTimeDifference(time: number): string {
    const sign = time >= 0 ? "+" : "-";
    const milliseconds = Math.abs(time);
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${sign}${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function createPocketRowElements(
    boardID: number,
    side: "top" | "bottom",
): HTMLDivElement {
    const row = document.createElement("div");
    row.className = `pocket-row pocket-row-${side}`;

    const info = document.createElement("div");
    info.className = "player-info";
    info.id = `${side}-info-${boardID}`;

    const timeDifference = document.createElement("div");
    timeDifference.className = "player-time-difference";

    const time = document.createElement("div");
    time.className = "player-time-display";
    time.append(createClockValue());

    info.append(timeDifference);
    info.append(time);

    const pocket = createPocketElement(boardID, side);
    const pocketArea = document.createElement("div");
    pocketArea.className = "pocket-area";

    const name = document.createElement("div");
    name.className = "player-name-plaque";
    name.id = `${side}-name-${boardID}`;
    name.hidden = true;

    pocketArea.append(pocket);
    row.append(pocketArea, info, name);

    return row;
}

function createClockValue(): HTMLSpanElement {
    const value = document.createElement("span");
    value.className = "clock-value";
    return value;
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
    const playerInfo = document.querySelector(
        `#${side}-info-${boardID}`,
    ) as HTMLElement;

    playerInfo.classList.toggle(
        "open-player-seat",
        !player && gs.room.status === RoomStatus.LOBBY,
    );
    playerInfo.classList.toggle(
        "own-player-seat",
        Boolean(
            player &&
                player.id === gs.player.id &&
                gs.room.status === RoomStatus.LOBBY,
        ),
    );

    playerInfo.onclick = null;
    playerInfo.onkeydown = null;
    playerInfo.removeAttribute("role");
    playerInfo.removeAttribute("tabindex");

    if (
        player?.id === gs.player.id &&
        gs.room.status === RoomStatus.LOBBY
    ) {
        playerInfo.onclick = () => {
            gs.socket.emit("leave-board", boardID, color);
        };
        playerInfo.onkeydown = (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                gs.socket.emit("leave-board", boardID, color);
            }
        };
        playerInfo.setAttribute("role", "button");
        playerInfo.setAttribute("tabindex", "0");
    }

    updatePlayerName(boardID, side, player);
}

function updatePlayerName(
    boardID: number,
    side: "top" | "bottom",
    player: Player | undefined,
): void {
    const name = document.querySelector(`#${side}-name-${boardID}`) as
        | HTMLElement
        | null;
    if (!name) return;

    name.hidden = !player;
    name.textContent = player ? getPlayerDisplayName(player) : "";
    name.style.color = "var(--text)";
}

// UI Update Functions - Time
export function updateUITime(): void {
    for (let index = 0; index < gs.room.game.matches.length; index++) {
        const matchInstance = getMatchInstance(index);

        const isFlipped = getBoardFlipState(index);

        updateTimeDisplay(
            index,
            "top",
            isFlipped ? matchInstance.whiteTime : matchInstance.blackTime,
            isFlipped ? Color.WHITE : Color.BLACK,
        );
        updateTimeDisplay(
            index,
            "bottom",
            isFlipped ? matchInstance.blackTime : matchInstance.whiteTime,
            isFlipped ? Color.BLACK : Color.WHITE,
        );
    }
}

function updateTimeDisplay(
    boardID: number,
    position: "top" | "bottom",
    time: number,
    color: Color,
): void {
    const playerInfo = document.querySelector(
        `#${position}-info-${boardID}`,
    ) as HTMLElement;

    const timeDisplay = playerInfo.querySelector(
        ".player-time-display",
    ) as HTMLElement;
    const timeValue = timeDisplay.querySelector(".clock-value") as HTMLElement;
    const timeDifference = playerInfo.querySelector(
        ".player-time-difference",
    ) as HTMLElement;

    timeValue.textContent = formatTime(time);
    timeDifference.textContent = formatTeamTimeDifference(boardID, color, time);
    timeDisplay.classList.toggle("white-clock", color === Color.WHITE);
    timeDisplay.classList.toggle("black-clock", color === Color.BLACK);

    const playing =
        gs.room.status === RoomStatus.PLAYING &&
        color === getMatchInstance(boardID).chess.turn;
    timeDisplay.classList.toggle("active-clock", playing);
    playerInfo.classList.toggle("active-player", playing);
}

function formatTeamTimeDifference(
    boardID: number,
    color: Color,
    time: number,
): string {
    const otherTeamMinimum = getOtherTeamMinimumTime(boardID, color);
    return otherTeamMinimum === undefined
        ? ""
        : formatTimeDifference(time - otherTeamMinimum);
}

function getOtherTeamMinimumTime(
    boardID: number,
    color: Color,
): number | undefined {
    const match = getMatchInstance(boardID);
    const otherTeam = match.getTeam(color) === Team.RED ? Team.BLUE : Team.RED;
    let minimum: number | undefined;

    for (let index = 0; index < gs.room.game.matches.length; index++) {
        if (index === boardID) continue;

        const candidate = getTeamTime(gs.room.game.matches[index], otherTeam);
        if (minimum === undefined || candidate < minimum) minimum = candidate;
    }

    return minimum;
}

function getTeamTime(match: Match, team: Team): number {
    const color =
        (team === Team.BLUE) === match.flipped ? Color.WHITE : Color.BLACK;
    return color === Color.WHITE ? match.whiteTime : match.blackTime;
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
