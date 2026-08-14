import { Color } from "@shared/chess";
import { RoomStatus } from "@shared/room";
import { getAssetPath } from "./app-paths";
import {
    clearLatestWinners,
    createMatchElements,
    setVisualFlipped,
    toggleVisualFlipped,
    updateUIAllGame,
} from "./match-ui";
import { soundThemes, type SoundName } from "./settings";
import {
    endSidebarGameUI,
    showSidebarRoomElements,
    startSidebarGameUI,
} from "./sidebar-ui";
import { gs } from "./session";

let gridMode = false;
let gridLayoutObserver: ResizeObserver | undefined;
let dualBoardPrimaryID: number | undefined;

export function initGameControls(): void {
    initGridLayoutObserver();

    document
        .querySelector("#grid-toggle-btn")
        ?.addEventListener("click", toggleGridMode);
    document.addEventListener("keydown", (event: Event) => {
        const keyEvent = event as KeyboardEvent;
        const target = keyEvent.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

        if (keyEvent.key === "x") {
            toggleVisualFlipped();
            updateUIAllGame();
        }
        if (keyEvent.key === "g" || keyEvent.key === "G") toggleGridMode();

        if (
            keyEvent.key === "ArrowLeft" ||
            keyEvent.key === "a" ||
            keyEvent.key === "A"
        ) {
            keyEvent.preventDefault();
            navigateBoards(-1);
        } else if (
            keyEvent.key === "ArrowRight" ||
            keyEvent.key === "d" ||
            keyEvent.key === "D"
        ) {
            keyEvent.preventDefault();
            navigateBoards(1);
        }
    });
}

export function playSound(source: SoundName): void {
    if (!gs.settings.sounds) return;

    const soundTheme =
        soundThemes.find((theme) => theme.id === gs.settings.soundTheme) ||
        soundThemes[0];
    const file = soundTheme.sounds[source] || soundTheme.sounds.move;
    if (!file) return;

    const sound = new Audio(getAssetPath(`sound/${soundTheme.id}/${file}`));
    console.log(`Playing sound: ${soundTheme.id}/${file}`);
    sound.play().catch((error) => console.error("Sound play failed:", error));
}

export function showRoomElements(): void {
    const gameScreen = document.querySelector("#game") as HTMLDivElement;
    for (const screen of document.querySelectorAll(".screen"))
        screen.classList.add("hidden");
    gameScreen.classList.remove("hidden");

    showSidebarRoomElements();
    rebuildRoomBoardElements();
}

export function rebuildRoomBoardElements(): void {
    const boardsArea = document.querySelector("#game-area") as HTMLDivElement;
    dualBoardPrimaryID = undefined;
    for (const container of boardsArea.querySelectorAll(".game-container"))
        container.remove();
    for (const container of boardsArea.querySelectorAll(".match-container"))
        container.remove();

    for (let index = 0; index < gs.room.game.matches.length; index++)
        createMatchElements(index);

    setGridMode(shouldForceGridMode(), true);
    updateBoardNavigationVisibility();

    const totalBoardsSpan = document.querySelector("#totalBoards");
    if (totalBoardsSpan)
        totalBoardsSpan.textContent = gs.room.game.matches.length.toString();

    initScrollControls();
}

// MARK: Scrolling UI

function getTotalBoards(): number {
    return gs.room.game.matches.length || 1;
}

function updateBoardNavigationVisibility(): void {
    const controls = document.querySelector(".scroll-controls") as HTMLElement;
    controls?.classList.toggle("hidden", getTotalBoards() < 3);
}

function scrollBoards(
    gameArea: HTMLDivElement,
    direction: number,
    updateScrollButtons: () => void,
): void {
    const matches = Array.from(
        gameArea.querySelectorAll<HTMLElement>(".match-container"),
    );
    if (gridMode || matches.length === 0) return;

    const gameAreaRect = gameArea.getBoundingClientRect();
    const boardPositions = matches.map(
        (match) =>
            match.getBoundingClientRect().left -
            gameAreaRect.left +
            gameArea.scrollLeft,
    );
    const currentBoardIndex = boardPositions.reduce(
        (closestIndex, position, index) =>
            Math.abs(position - gameArea.scrollLeft) <
            Math.abs(boardPositions[closestIndex] - gameArea.scrollLeft)
                ? index
                : closestIndex,
        0,
    );
    const targetBoardIndex = Math.max(
        0,
        Math.min(matches.length - 1, currentBoardIndex + direction),
    );

    gameArea.scrollTo({
        left: boardPositions[targetBoardIndex],
        behavior: "smooth",
    });
    setTimeout(updateScrollButtons, 300);
}

function updateScrollButtons(): void {
    const gameArea = document.querySelector("#game-area") as HTMLDivElement;
    const leftButton = document.querySelector(
        "#scrollLeft",
    ) as HTMLButtonElement;
    const rightButton = document.querySelector(
        "#scrollRight",
    ) as HTMLButtonElement;

    const scrollLeft = gameArea.scrollLeft;
    const maxScroll = gameArea.scrollWidth - gameArea.clientWidth;
    leftButton.disabled = scrollLeft <= 1;
    rightButton.disabled = scrollLeft >= maxScroll - 1;

    const totalBoards = getTotalBoards();
    const gameAreaRect = gameArea.getBoundingClientRect();
    const visibleBoards = Array.from(
        gameArea.querySelectorAll<HTMLElement>(".match-container"),
    )
        .map((board, index) => ({ index, rect: board.getBoundingClientRect() }))
        .filter(
            ({ rect }) =>
                rect.right > gameAreaRect.left && rect.left < gameAreaRect.right,
        );

    const currentBoardSpan = document.querySelector(
        "#boardRange",
    ) as HTMLSpanElement;
    const totalBoardsSpan = document.querySelector(
        "#totalBoards",
    ) as HTMLSpanElement;

    if (gridMode) {
        currentBoardSpan.textContent = `[All]`;
    } else if (visibleBoards.length === 0) {
        currentBoardSpan.textContent = "_";
    } else {
        const leftBoard = visibleBoards[0].index + 1;
        const rightBoard = visibleBoards[visibleBoards.length - 1].index + 1;

        if (leftBoard === rightBoard)
            currentBoardSpan.textContent = `${leftBoard}`;
        else currentBoardSpan.textContent = `${leftBoard}-${rightBoard}`;
    }

    totalBoardsSpan.textContent = totalBoards.toString();
}

// Navigate boards with keyboard
function navigateBoards(direction: number): void {
    const gameArea = document.querySelector("#game-area") as HTMLDivElement;

    scrollBoards(gameArea, direction, updateScrollButtons);
}

export function initScrollControls(): void {
    const gameArea = document.querySelector("#game-area") as HTMLDivElement;
    const leftButton = document.querySelector(
        "#scrollLeft",
    ) as HTMLButtonElement;
    const rightButton = document.querySelector(
        "#scrollRight",
    ) as HTMLButtonElement;

    leftButton.onclick = () => scrollBoards(gameArea, -1, updateScrollButtons);
    rightButton.onclick = () => scrollBoards(gameArea, 1, updateScrollButtons);
    gameArea.onscroll = updateScrollButtons;

    updateScrollButtons();
}

// MARK: Grid Mode UI

export function toggleGridMode(): void {
    if (shouldForceGridMode()) {
        setGridMode(true);
        return;
    }

    setGridMode(!gridMode);
}

function shouldForceGridMode(): boolean {
    return getTotalBoards() === 2;
}

function setGridMode(enabled: boolean, forceLayout = false): void {
    if (gridMode === enabled && !forceLayout) return;

    gridMode = enabled;
    const gameArea = document.querySelector("#game-area") as HTMLDivElement;
    const gridToggleButton = document.querySelector(
        "#grid-toggle-btn",
    ) as HTMLButtonElement;

    if (gridMode) {
        gameArea.classList.add("grid-mode");
        replaceGridToggleIcon(gridToggleButton, "grid");

        updateGridLayout();
    } else {
        gameArea.classList.remove("grid-mode");
        replaceGridToggleIcon(gridToggleButton, "columns");

        resetToFlexLayout();
    }
    updateScrollButtons();
}

function replaceGridToggleIcon(
    button: HTMLButtonElement,
    mode: "grid" | "columns",
): void {
    button.replaceChildren(createGridToggleIcon(mode));
}

function createGridToggleIcon(mode: "grid" | "columns"): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("aria-hidden", "true");

    const rects =
        mode === "grid"
            ? [
                  [3, 3, 7, 7],
                  [14, 3, 7, 7],
                  [3, 14, 7, 7],
                  [14, 14, 7, 7],
              ]
            : [
                  [3, 3, 7, 18],
                  [14, 3, 7, 18],
              ];

    for (const [x, y, width, height] of rects) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", x.toString());
        rect.setAttribute("y", y.toString());
        rect.setAttribute("width", width.toString());
        rect.setAttribute("height", height.toString());
        svg.append(rect);
    }

    return svg;
}

function initGridLayoutObserver(): void {
    const gameArea = document.querySelector("#game-area") as HTMLDivElement;

    gridLayoutObserver?.disconnect();
    gridLayoutObserver = new ResizeObserver(() => updateGridLayout());
    gridLayoutObserver.observe(gameArea);
}

function readPixelValue(value: string): number {
    const pixels = Number.parseFloat(value);
    return Number.isFinite(pixels) ? pixels : 0;
}

function updateGridLayout(): void {
    if (!gridMode) return;

    const gameArea = document.querySelector("#game-area") as HTMLDivElement;
    const matches = gameArea.querySelectorAll(".match-container");
    const boardCount = matches.length;
    if (boardCount === 0) return;

    const style = getComputedStyle(gameArea);
    const availableWidth =
        gameArea.clientWidth -
        readPixelValue(style.paddingLeft) -
        readPixelValue(style.paddingRight);
    const availableHeight =
        gameArea.clientHeight -
        readPixelValue(style.paddingTop) -
        readPixelValue(style.paddingBottom);
    const columnGap = readPixelValue(style.columnGap);
    const rowGap = readPixelValue(style.rowGap);
    const plaqueHeightBoardRatio = readPixelValue(
        style.getPropertyValue("--plaque-height-board-ratio"),
    );

    // The match itself is 8 squares wide by 10 high. In grid mode, the two
    // externally positioned player plaques are also part of its visual height.
    const matchRatio = 8 / 10;
    const visualRatio = 8 / (10 + plaqueHeightBoardRatio * 16);

    let bestW = 0;
    let bestCols = 1;

    for (let cols = 1; cols <= boardCount; cols++) {
        const rows = Math.ceil(boardCount / cols);
        const horizontalGaps = columnGap * Math.max(0, cols - 1);
        const verticalGaps = rowGap * Math.max(0, rows - 1);
        let w = (availableWidth - horizontalGaps) / cols;
        const heightConstrainedWidth =
            ((availableHeight - verticalGaps) / rows) * visualRatio;
        w = Math.min(w, heightConstrainedWidth);

        if (w > bestW) {
            bestW = w;
            bestCols = cols;
        }
    }

    const useDualBoardUI = gs.settings.dualBoardUI && boardCount === 2;

    gameArea.classList.toggle("dual-board-ui", useDualBoardUI);

    if (useDualBoardUI) {
        const controlledBoardIDs = getControlledBoardIDs();
        const preferredPrimaryID = getPreferredPrimaryBoardID(
            controlledBoardIDs,
        );
        if (gs.room.status === RoomStatus.LOBBY) {
            if (preferredPrimaryID !== undefined)
                dualBoardPrimaryID = preferredPrimaryID;
            else dualBoardPrimaryID ??= 0;
        } else if (dualBoardPrimaryID === undefined) {
            dualBoardPrimaryID = preferredPrimaryID ?? 0;
        }

        // Only emphasize a board when this player controls exactly one of
        // them. Spectators control neither board, so both boards should get
        // the same amount of space.
        const secondaryScale = controlledBoardIDs.length === 1 ? 0.8 : 1;
        const normalWidth = Math.max(
            0,
            Math.min(
                (availableWidth - columnGap) / (1 + secondaryScale),
                availableHeight * visualRatio,
            ),
        );

        gameArea.style.gridTemplateColumns = "auto auto";
        for (const match of matches) {
            const element = match as HTMLElement;
            const isPrimary =
                Number(element.dataset.boardID) === dualBoardPrimaryID;
            const width = normalWidth * (isPrimary ? 1 : secondaryScale);
            element.style.order = isPrimary ? "0" : "1";
            element.style.width = `${width}px`;
            element.style.height = `${width * (1 / matchRatio)}px`;
            element.style.setProperty("--board-size", `${width}px`);
            element.style.setProperty("--square-size", `${width / 8}px`);
        }
        return;
    }

    gameArea.style.gridTemplateColumns = `repeat(${bestCols}, auto)`;

    for (const match of matches) {
        const m = match as HTMLElement;
        m.style.order = "";
        // Apply the calculated width, height follows aspect ratio
        m.style.width = `${bestW}px`;
        m.style.height = `${bestW * (1 / matchRatio)}px`;
        m.style.setProperty("--board-size", `${bestW}px`);
        m.style.setProperty("--square-size", `${bestW / 8}px`);
    }
}

function resetToFlexLayout(): void {
    const gameArea = document.querySelector("#game-area") as HTMLDivElement;
    const matches = gameArea.querySelectorAll(".match-container");

    gameArea.style.gridTemplateColumns = "";
    gameArea.classList.remove("dual-board-ui");
    for (const match of matches) {
        const m = match as HTMLElement;
        m.style.order = "";
        m.style.width = "";
        m.style.height = "";
        m.style.removeProperty("--board-size");
        m.style.removeProperty("--square-size");
    }
}

function getControlledBoardIDs(): number[] {
    if (!gs.room || !gs.player) return [];

    return gs.room.game.matches
        .map((match, boardID) =>
            match.whitePlayer?.id === gs.player.id ||
            match.blackPlayer?.id === gs.player.id
                ? boardID
                : undefined,
        )
        .filter((boardID): boardID is number => boardID !== undefined);
}

function getPreferredPrimaryBoardID(
    controlledBoardIDs: number[],
): number | undefined {
    if (controlledBoardIDs.length === 1) return controlledBoardIDs[0];
    if (controlledBoardIDs.length < 2 || !gs.player) return undefined;

    const whiteBoardID = gs.room.game.matches.findIndex(
        (match) => match.whitePlayer?.id === gs.player.id,
    );
    return whiteBoardID >= 0 ? whiteBoardID : controlledBoardIDs[0];
}

export function refreshDualBoardLayout(): void {
    if (gridMode) updateGridLayout();
}

function lockDualBoardOrderForGame(): void {
    const controlledBoardIDs = getControlledBoardIDs();
    const preferredPrimaryID = getPreferredPrimaryBoardID(controlledBoardIDs);
    if (preferredPrimaryID !== undefined)
        dualBoardPrimaryID = preferredPrimaryID;
}

// MARK: Start/End Game UI

export function startGameUI(): void {
    clearLatestWinners();
    lockDualBoardOrderForGame();
    startSidebarGameUI();

    let topBottomDelta = 0;
    for (const match of gs.room.game.matches) {
        const playerIsTop =
            match.getPlayer(match.flipped ? Color.WHITE : Color.BLACK)?.id ===
            gs.player.id;
        const playerIsBottom =
            match.getPlayer(match.flipped ? Color.BLACK : Color.WHITE)?.id ===
            gs.player.id;
        topBottomDelta += (playerIsTop ? 1 : 0) - (playerIsBottom ? 1 : 0);
    }

    setVisualFlipped(topBottomDelta > 0);
    updateUIAllGame();
    refreshDualBoardLayout();
    initScrollControls();
}

export function endGameUI(): void {
    endSidebarGameUI();
    updateUIAllGame();
    refreshDualBoardLayout();
}
