import { Color } from "@shared/chess";
import {
    getPlayerDisplayName,
    type Player,
    PlayerStatus,
} from "@shared/player";
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
let latestWinningPlayerIds = new Set<string>();

export function rememberLatestWinners(team: Team): void {
    latestWinningPlayerIds = new Set();

    for (const match of gs.room.game.matches) {
        const player = match.getPlayerTeam(team);
        if (player) latestWinningPlayerIds.add(player.id);
    }
}

export function clearLatestWinners(): void {
    latestWinningPlayerIds = new Set();
}

export function isLatestWinner(playerID: string): boolean {
    return latestWinningPlayerIds.has(playerID);
}

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
    const sign = time > 0 ? "+" : time < 0 ? "-" : "";
    return `${sign}${formatTime(Math.abs(time))}`;
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
    info.dataset.boardId = boardID.toString();

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

    const badges = document.createElement("span");
    badges.className = "player-plaque-badges";

    const nameText = document.createElement("span");
    nameText.className = "player-plaque-name";

    name.append(badges, nameText);

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

    for (const side of ["top", "bottom"] as const) {
        const dropZone = document.createElement("div");
        dropZone.className = `player-seat-drop-zone player-seat-drop-zone-${side}`;
        dropZone.setAttribute("aria-hidden", "true");
        boardContainer.append(dropZone);
    }

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
    playerInfo.dataset.color = color;
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
    const dropZone = playerInfo
        .closest(".match-container")
        ?.querySelector<HTMLElement>(`.player-seat-drop-zone-${side}`);
    if (dropZone) {
        dropZone.ondragover = null;
        dropZone.ondragleave = null;
        dropZone.ondrop = null;
    }

    const canHostAssign =
        gs.room.hostID === gs.player.id &&
        gs.room.status === RoomStatus.LOBBY;
    if (canHostAssign && dropZone) {
        dropZone.ondragover = (event) => {
            if (!event.dataTransfer?.types.includes("application/x-player-id"))
                return;
            event.preventDefault();
            dropZone.classList.add("player-seat-drop-target");
        };
        dropZone.ondragleave = () =>
            dropZone.classList.remove("player-seat-drop-target");
        dropZone.ondrop = (event) => {
            event.preventDefault();
            dropZone.classList.remove("player-seat-drop-target");
            const playerID = event.dataTransfer?.getData(
                "application/x-player-id",
            );
            if (playerID)
                gs.socket.emit("assign-player-board", playerID, boardID, color);
        };
    }

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
    const nameText = name.querySelector(".player-plaque-name");
    const badges = name.querySelector(".player-plaque-badges");
    if (!nameText || !badges) return;

    nameText.textContent = player ? getPlayerDisplayName(player) : "";
    badges.replaceChildren();

    if (player && isLatestWinner(player.id)) {
        const crown = document.createElement("img");
        crown.className = "player-plaque-badge player-plaque-crown";
        crown.src = getAssetPath("img/crown.svg");
        crown.alt = "Winner";
        crown.title = "Winner";
        badges.append(crown);
    }

    if (player?.status === PlayerStatus.DISCONNECTED) {
        const disconnected = document.createElement("span");
        disconnected.className =
            "player-plaque-badge player-plaque-disconnected";
        disconnected.setAttribute("role", "img");
        disconnected.setAttribute("aria-label", "Disconnected");
        disconnected.title = "Disconnected";
        disconnected.style.setProperty(
            "--player-plaque-disconnected-icon",
            `url("${getAssetPath("img/disconnected.svg")}")`,
        );
        badges.append(disconnected);
    }

    name.style.color = "var(--text)";
}

// UI Update Functions - Time
export function updateUITime(): void {
    for (let index = 0; index < gs.room.game.matches.length; index++) {
        const matchInstance = getMatchInstance(index);

        const isFlipped = getBoardFlipState(index);
        const whiteTime = getDisplayedTime(matchInstance, Color.WHITE);
        const blackTime = getDisplayedTime(matchInstance, Color.BLACK);

        updateTimeDisplay(
            index,
            "top",
            isFlipped ? whiteTime : blackTime,
            isFlipped ? Color.WHITE : Color.BLACK,
        );
        updateTimeDisplay(
            index,
            "bottom",
            isFlipped ? blackTime : whiteTime,
            isFlipped ? Color.BLACK : Color.WHITE,
        );
    }
}

function getDisplayedTime(match: Match, color: Color): number {
    if (!gs.room.game.config.timeShared)
        return color === Color.WHITE ? match.whiteTime : match.blackTime;

    return gs.room.game.getTeamTime(match.getTeam(color));
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

    if (gs.room.game.config.timeShared)
        return gs.room.game.getTeamTime(otherTeam);

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
