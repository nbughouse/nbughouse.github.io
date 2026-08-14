import { refreshDualBoardLayout } from "./game-ui";
import { stopPingUpdates } from "./sidebar-ui";
import { stopTimeUpdates } from "./match-ui";
import { roomExists } from "./room-api";
import { setStoredProfileValue, sn } from "./session";
import { sanitizePlayerName } from "@shared/player";
import { getBasePath } from "./app-paths";
import { applyAllChessSettings, applyPieceAnimationSpeed } from "./chess-ui";
import { initMenuBackground } from "./menu-background";
import { fetchSiteStats, type SiteStats } from "./stats-api";
import {
    boardThemes,
    pieceThemes,
    soundThemes,
    type MovementMode,
    type SoundTheme,
} from "./settings";
import {
    closeSettingsPickers,
    createHoverPreviewSelect,
    createSettingsSelect,
    populateSelect,
    preloadSettingsAssets,
    syncHoverPreviewSelect,
    titleCase,
} from "./settings-ui";

let pendingAction: (() => void) | undefined;
let currentMenuView: MenuView = "main";
let menuHistoryInitialized = false;
let menuErrorFadeTimeout: number | undefined;
let menuErrorClearTimeout: number | undefined;
const SERVER_CHECK_TIMEOUT_MS = 3500;

type MenuView = "main" | "join" | "name" | "help" | "stats" | "settings";

interface BughouseHistoryState {
    bughouseView?: "menu" | "game";
    menuView?: MenuView;
}

export function initMenuControls(): void {
    initMenuHistory();
    preloadSettingsAssets();
    initMenuBackground();
    applyAllChessSettings();

    const createGameButton = document.querySelector(
        "#create-game-btn",
    ) as HTMLButtonElement;
    const joinGameButton = document.querySelector(
        "#join-game-btn",
    ) as HTMLButtonElement;
    const settingsButton = document.querySelector(
        "#setting-btn",
    ) as HTMLButtonElement;
    const infoButton = document.querySelector("#info-btn") as HTMLButtonElement;
    const statsButton = document.querySelector("#stats-btn") as HTMLButtonElement;

    // Handle create game button
    createGameButton.addEventListener("click", async () => {
        if (!(await ensureServerReachable())) return;

        if (
            checkAndPromptForName(() => {
                sn.socket.emit("create-room");
            })
        )
            sn.socket.emit("create-room");
    });

    // Handle join game button
    joinGameButton.addEventListener("click", () => {
        showJoinView();
    });

    infoButton.addEventListener("click", () => {
        showHelpView();
    });

    statsButton.addEventListener("click", () => {
        showStatsView();
    });

    settingsButton.addEventListener("click", () => {
        showSettingsView();
    });

    setupNameInput("player-name-input");
    syncMenuNameInputs(sn.name);

    const readyButton = document.querySelector("#ready-btn");
    readyButton?.addEventListener("click", () => {
        sn.socket.emit("start-room");
    });

    const spectatorButton = document.querySelector("#spectator-btn");
    spectatorButton?.addEventListener("click", () => {
        sn.socket.emit("toggle-spectator");
    });

    const leaveRoomButton = document.querySelector("#leave-game-btn");
    leaveRoomButton?.addEventListener("click", () => {
        leaveRoom();
    });

    setupActionNameView();
    setupJoinView();
    setupHelpView();
    setupStatsView();
    setupSettingsView();
}

function initMenuHistory(): void {
    if (menuHistoryInitialized) return;
    menuHistoryInitialized = true;

    replaceMenuHistoryState("main", globalThis.location.href);

    globalThis.addEventListener("popstate", (event: PopStateEvent) => {
        const state = event.state as BughouseHistoryState | null;

        if (state?.bughouseView === "menu") {
            showMenuView(state.menuView || "main", false);
            return;
        }

        const gameScreen = document.querySelector("#game");
        if (gameScreen && !gameScreen.classList.contains("hidden")) {
            sn.socket.emit("leave-room");
            showMenuScreen(false);
        }
    });
}

// Export this function so it can be used in other files
export function checkAndPromptForName(action: () => void): boolean {
    const nameInput = document.querySelector(
        "#player-name-input",
    ) as HTMLInputElement;
    const currentName = nameInput.value.trim() || sn.name.trim();

    if (!currentName) {
        pendingAction = action;
        showActionNameView();
        return false;
    }

    if (!nameInput.value.trim()) nameInput.value = currentName;
    return true;
}

export async function ensureServerReachable(): Promise<boolean> {
    if (!(await waitForSocketConnection(SERVER_CHECK_TIMEOUT_MS))) {
        showError("menu-error", "Cannot reach game server. Try again in a moment.");
        return false;
    }

    if (!(await pingServer(SERVER_CHECK_TIMEOUT_MS))) {
        showError("menu-error", "Game server is not responding. Try again in a moment.");
        return false;
    }

    return true;
}

function setupActionNameView(): void {
    const backButton = document.querySelector(
        "#back-from-name-btn",
    ) as HTMLButtonElement;
    const submitButton = document.querySelector(
        "#submit-action-name-btn",
    ) as HTMLButtonElement;
    const nameInput = document.querySelector(
        "#action-player-name-input",
    ) as HTMLInputElement;

    backButton.addEventListener("click", () => {
        pendingAction = undefined;
        navigateBackToMainMenu();
    });

    submitButton.addEventListener("click", () => {
        const name = sanitizeNameInput(nameInput);
        if (name) {
            setPlayerName(name);
            syncMenuNameInputs(name);
            showMainMenuView(false);

            if (pendingAction) {
                pendingAction();
                pendingAction = undefined;
            }
        }
    });

    nameInput.addEventListener("keypress", (event: Event) => {
        const keyEvent = event as KeyboardEvent;
        if (keyEvent.key === "Enter") submitButton.click();
    });

    nameInput.addEventListener("input", () => {
        sanitizeNameInput(nameInput);
    });
    nameInput.addEventListener("blur", handleNameSubmit);
}

function setupJoinView(): void {
    const backButton = document.querySelector(
        "#back-to-menu-btn",
    ) as HTMLButtonElement;
    const submitButton = document.querySelector(
        "#submit-join-btn",
    ) as HTMLButtonElement;
    const codeInput = document.querySelector(
        "#join-room-code-input",
    ) as HTMLInputElement;
    const nameInput = document.querySelector(
        "#join-player-name-input",
    ) as HTMLInputElement;

    backButton.addEventListener("click", () => {
        navigateBackToMainMenu();
    });

    submitButton.addEventListener("click", submitJoinView);
    nameInput.addEventListener("input", () => {
        sanitizeNameInput(nameInput);
        updateJoinPlayingAs();
    });
    nameInput.addEventListener("blur", handleNameSubmit);

    for (const input of [codeInput, nameInput]) {
        input.addEventListener("keypress", (event: Event) => {
            const keyEvent = event as KeyboardEvent;
            if (keyEvent.key === "Enter") submitJoinView();
        });
    }
}

function setupHelpView(): void {
    const backButton = document.querySelector(
        "#back-from-help-btn",
    ) as HTMLButtonElement;

    backButton.addEventListener("click", () => {
        navigateBackToMainMenu();
    });
}

function setupStatsView(): void {
    const backButton = document.querySelector(
        "#back-from-stats-btn",
    ) as HTMLButtonElement;

    backButton.addEventListener("click", () => {
        navigateBackToMainMenu();
    });
}

function setupSettingsView(): void {
    const backButton = document.querySelector(
        "#back-from-settings-btn",
    ) as HTMLButtonElement;
    const pieceSelect = document.querySelector(
        "#menu-setting-piece-theme",
    ) as HTMLSelectElement;
    const boardSelect = document.querySelector(
        "#menu-setting-board-theme",
    ) as HTMLSelectElement;
    const movementSelect = document.querySelector(
        "#menu-setting-movement-mode",
    ) as HTMLSelectElement;
    const soundSelect = document.querySelector(
        "#menu-setting-sound-theme",
    ) as HTMLSelectElement;
    const animationSpeedInput = document.querySelector(
        "#menu-setting-piece-animation-speed",
    ) as HTMLInputElement;

    backButton.addEventListener("click", () => {
        closeSettingsPickers();
        saveMenuSettings();
        navigateBackToMainMenu();
    });

    const pieceThemeOptions = getPieceThemeOptions();
    const boardThemeOptions = getBoardThemeOptions();
    const movementModeOptions = getMovementModeOptions();
    const soundThemeOptions = getSoundThemeOptions();

    populateSelect(pieceSelect, pieceThemeOptions, sn.settings.pieceTheme);
    populateSelect(boardSelect, boardThemeOptions, sn.settings.boardTheme);
    populateSelect(movementSelect, movementModeOptions, sn.settings.movementMode);
    populateSelect(soundSelect, soundThemeOptions, sn.settings.soundTheme);
    setSelectValue("#menu-setting-piece-theme", sn.settings.pieceTheme);
    setSelectValue("#menu-setting-board-theme", sn.settings.boardTheme);
    setSelectValue("#menu-setting-movement-mode", sn.settings.movementMode);
    setSelectValue("#menu-setting-sound-theme", sn.settings.soundTheme);
    animationSpeedInput.value = sn.settings.pieceAnimationSpeed.toString();

    createHoverPreviewSelect(pieceSelect, pieceThemeOptions, (value) => {
        sn.settings.pieceTheme = value;
        applyAllChessSettings();
    });
    createHoverPreviewSelect(boardSelect, boardThemeOptions, (value) => {
        sn.settings.boardTheme = value;
        applyAllChessSettings();
    });
    createSettingsSelect(movementSelect, movementModeOptions);
    createSettingsSelect(soundSelect, soundThemeOptions);

    pieceSelect.addEventListener("change", () => {
        sn.settings.pieceTheme = pieceSelect.value;
        saveMenuSettings();
    });

    boardSelect.addEventListener("change", () => {
        sn.settings.boardTheme = boardSelect.value;
        saveMenuSettings();
    });

    movementSelect.addEventListener("change", () => {
        sn.settings.movementMode = movementSelect.value as MovementMode;
        saveMenuSettings(false);
    });

    soundSelect.addEventListener("change", () => {
        sn.settings.soundTheme = soundSelect.value as SoundTheme;
        saveMenuSettings(false);
    });

    animationSpeedInput.addEventListener("input", () => {
        sn.settings.pieceAnimationSpeed = Number.parseFloat(
            animationSpeedInput.value,
        );
        saveMenuSettings(false);
        applyPieceAnimationSpeed();
    });

    bindMenuSettingCheckbox("#menu-setting-auto-queen", "autoQueen");
    bindMenuSettingCheckbox("#menu-setting-premoves", "premoves", false);
    bindMenuSettingCheckbox("#menu-setting-board-coords", "showBoardCoords");
    bindMenuSettingCheckbox(
        "#menu-setting-highlight-last-move",
        "highlightLastMove",
    );
    bindMenuSettingCheckbox("#menu-setting-sounds", "sounds", false);
    bindMenuSettingCheckbox("#menu-setting-legal-moves", "showLegalMoves");
    bindMenuSettingCheckbox("#menu-setting-message-grouping", "messageGrouping", false);
    bindMenuSettingCheckbox(
        "#menu-setting-dual-board-ui",
        "dualBoardUI",
        false,
        refreshDualBoardLayout,
    );
}

function getPieceThemeOptions(): { value: string; label: string }[] {
    return pieceThemes.map((theme) => ({ value: theme, label: titleCase(theme) }));
}

function getBoardThemeOptions(): { value: string; label: string }[] {
    return boardThemes.map((theme) => ({ value: theme.id, label: theme.name }));
}

function getMovementModeOptions(): { value: MovementMode; label: string }[] {
    return [
        { value: "both", label: "Drag + click" },
        { value: "drag", label: "Drag only" },
        { value: "click", label: "Click only" },
    ];
}

function getSoundThemeOptions(): { value: SoundTheme; label: string }[] {
    return soundThemes.map((theme) => ({ value: theme.id, label: theme.name }));
}

function bindMenuSettingCheckbox(
    selector: string,
    key:
        | "autoQueen"
        | "premoves"
        | "showBoardCoords"
        | "highlightLastMove"
        | "sounds"
        | "showLegalMoves"
        | "messageGrouping"
        | "dualBoardUI",
    redraw = true,
    afterChange?: () => void,
): void {
    const checkbox = document.querySelector(selector) as HTMLInputElement;
    checkbox.addEventListener("change", () => {
        sn.settings[key] = checkbox.checked;
        saveMenuSettings(redraw);
        afterChange?.();
    });
}

function saveMenuSettings(redraw = true): void {
    sn.settings.save();
    if (redraw) applyAllChessSettings();
}

function updateMenuSettingsUI(): void {
    const settings = sn.settings;
    setSelectValue("#menu-setting-piece-theme", settings.pieceTheme);
    setSelectValue("#menu-setting-board-theme", settings.boardTheme);
    setSelectValue("#menu-setting-movement-mode", settings.movementMode);
    setSelectValue("#menu-setting-sound-theme", settings.soundTheme);
    syncHoverPreviewSelect(
        document.querySelector("#menu-setting-piece-theme") as HTMLSelectElement,
    );
    syncHoverPreviewSelect(
        document.querySelector("#menu-setting-board-theme") as HTMLSelectElement,
    );
    syncHoverPreviewSelect(
        document.querySelector("#menu-setting-movement-mode") as HTMLSelectElement,
    );
    syncHoverPreviewSelect(
        document.querySelector("#menu-setting-sound-theme") as HTMLSelectElement,
    );
    setCheckbox("#menu-setting-auto-queen", settings.autoQueen);
    setCheckbox("#menu-setting-premoves", settings.premoves);
    setCheckbox("#menu-setting-board-coords", settings.showBoardCoords);
    setCheckbox(
        "#menu-setting-highlight-last-move",
        settings.highlightLastMove,
    );
    setCheckbox("#menu-setting-sounds", settings.sounds);
    setCheckbox("#menu-setting-legal-moves", settings.showLegalMoves);
    setCheckbox("#menu-setting-message-grouping", settings.messageGrouping);
    setCheckbox("#menu-setting-dual-board-ui", settings.dualBoardUI);
    const animationSpeedInput = document.querySelector(
        "#menu-setting-piece-animation-speed",
    ) as HTMLInputElement | null;
    if (animationSpeedInput)
        animationSpeedInput.value = settings.pieceAnimationSpeed.toString();
}

function setSelectValue(selector: string, value: string): void {
    const select = document.querySelector(selector) as HTMLSelectElement | null;
    if (select) select.value = value;
}

function setCheckbox(selector: string, checked: boolean): void {
    const checkbox = document.querySelector(selector) as HTMLInputElement | null;
    if (checkbox) checkbox.checked = checked;
}

async function submitJoinView(): Promise<void> {
    const codeInput = document.querySelector(
        "#join-room-code-input",
    ) as HTMLInputElement;
    const nameInput = document.querySelector(
        "#join-player-name-input",
    ) as HTMLInputElement;
    const roomCode = codeInput.value.trim().toUpperCase();
    const name = sanitizeNameInput(nameInput);

    if (roomCode.length !== 4) {
        showError("menu-error", "Enter a 4-character match ID");
        return;
    }

    const exists = await roomExists(roomCode);
    if (exists === undefined) {
        showError("menu-error", "Cannot reach game server. Try again in a moment.");
        return;
    }

    if (!exists) {
        showError("menu-error", `Room ${roomCode} does not exist`);
        return;
    }

    if (!(await ensureServerReachable())) return;

    if (name) {
        setPlayerName(name);
        syncMenuNameInputs(name);
    }

    sn.socket.emit("join-room", roomCode);
}

function showJoinView(updateHistory = true): void {
    const menuShell = document.querySelector("#menu-shell");
    const mainSection = document.querySelector("#section");
    const joinSection = document.querySelector("#join-section");
    const nameSection = document.querySelector("#name-section");
    const helpSection = document.querySelector("#help-section");
    const statsSection = document.querySelector("#stats-section");
    const settingsSection = document.querySelector("#menu-settings-section");
    const codeInput = document.querySelector(
        "#join-room-code-input",
    ) as HTMLInputElement;
    const nameInput = document.querySelector(
        "#join-player-name-input",
    ) as HTMLInputElement;

    menuShell?.classList.add("join-mode");
    menuShell?.classList.remove("name-mode");
    menuShell?.classList.remove("help-mode");
    menuShell?.classList.remove("stats-mode");
    menuShell?.classList.remove("settings-mode");
    mainSection?.classList.add("hidden");
    nameSection?.classList.add("hidden");
    helpSection?.classList.add("hidden");
    statsSection?.classList.add("hidden");
    settingsSection?.classList.add("hidden");
    joinSection?.classList.remove("hidden");

    setMenuView("join", updateHistory);
    nameInput.value = getCurrentPlayerName();
    updateJoinPlayingAs();
    clearErrors();
    codeInput.focus();
}

function showActionNameView(updateHistory = true): void {
    const menuShell = document.querySelector("#menu-shell");
    const mainSection = document.querySelector("#section");
    const joinSection = document.querySelector("#join-section");
    const nameSection = document.querySelector("#name-section");
    const helpSection = document.querySelector("#help-section");
    const statsSection = document.querySelector("#stats-section");
    const settingsSection = document.querySelector("#menu-settings-section");
    const nameInput = document.querySelector(
        "#action-player-name-input",
    ) as HTMLInputElement;

    menuShell?.classList.add("name-mode");
    menuShell?.classList.remove("join-mode");
    menuShell?.classList.remove("help-mode");
    menuShell?.classList.remove("stats-mode");
    menuShell?.classList.remove("settings-mode");
    mainSection?.classList.add("hidden");
    joinSection?.classList.add("hidden");
    helpSection?.classList.add("hidden");
    statsSection?.classList.add("hidden");
    settingsSection?.classList.add("hidden");
    nameSection?.classList.remove("hidden");

    setMenuView("name", updateHistory);
    nameInput.value = getCurrentPlayerName();
    clearErrors();
    nameInput.focus();
}

function showHelpView(updateHistory = true): void {
    const menuShell = document.querySelector("#menu-shell");
    const mainSection = document.querySelector("#section");
    const joinSection = document.querySelector("#join-section");
    const nameSection = document.querySelector("#name-section");
    const helpSection = document.querySelector("#help-section");
    const statsSection = document.querySelector("#stats-section");
    const settingsSection = document.querySelector("#menu-settings-section");

    menuShell?.classList.add("help-mode");
    menuShell?.classList.remove("join-mode");
    menuShell?.classList.remove("name-mode");
    menuShell?.classList.remove("stats-mode");
    menuShell?.classList.remove("settings-mode");
    mainSection?.classList.add("hidden");
    joinSection?.classList.add("hidden");
    nameSection?.classList.add("hidden");
    statsSection?.classList.add("hidden");
    settingsSection?.classList.add("hidden");
    helpSection?.classList.remove("hidden");
    setMenuView("help", updateHistory);
    clearErrors();
}

function showStatsView(updateHistory = true): void {
    const menuShell = document.querySelector("#menu-shell");
    const mainSection = document.querySelector("#section");
    const joinSection = document.querySelector("#join-section");
    const nameSection = document.querySelector("#name-section");
    const helpSection = document.querySelector("#help-section");
    const statsSection = document.querySelector("#stats-section");
    const settingsSection = document.querySelector("#menu-settings-section");

    menuShell?.classList.add("stats-mode");
    menuShell?.classList.remove("join-mode");
    menuShell?.classList.remove("name-mode");
    menuShell?.classList.remove("help-mode");
    menuShell?.classList.remove("settings-mode");
    mainSection?.classList.add("hidden");
    joinSection?.classList.add("hidden");
    nameSection?.classList.add("hidden");
    helpSection?.classList.add("hidden");
    settingsSection?.classList.add("hidden");
    statsSection?.classList.remove("hidden");
    setMenuView("stats", updateHistory);
    void updateStatsView();
    clearErrors();
}

async function updateStatsView(): Promise<void> {
    const stats = await fetchSiteStats();
    if (!stats) return;

    setStatsText("#stats-unique-players", stats.uniquePlayers);
    setStatsText("#stats-completed-games", stats.completedGames);
    updateStatsUpdatedAt(stats);
}

function setStatsText(selector: string, value: number | undefined): void {
    const element = document.querySelector(selector);
    if (element && Number.isFinite(value)) {
        element.textContent = formatRoundedCount(value);
    }
}

function updateStatsUpdatedAt(stats: SiteStats): void {
    if (!stats.updatedAt) return;

    const element = document.querySelector("#stats-updated-at");
    if (!element) return;

    element.textContent = `Last recorded event: ${formatStatsTimestamp(stats.updatedAt)}`;
}

function formatStatsTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;

    const datePart = new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    }).format(date);
    const timePart = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
    }).format(date);

    return `${datePart}, ${timePart} UTC`;
}

function formatRoundedCount(value: number | undefined): string {
    if (!Number.isFinite(value)) return "";

    const count = Math.max(0, Math.floor(value));
    const rounded =
        count >= 1000 ? Math.floor(count / 100) * 100 : Math.floor(count / 10) * 10;

    return `${rounded.toLocaleString()}+`;
}

function showSettingsView(updateHistory = true): void {
    const menuShell = document.querySelector("#menu-shell");
    const mainSection = document.querySelector("#section");
    const joinSection = document.querySelector("#join-section");
    const nameSection = document.querySelector("#name-section");
    const helpSection = document.querySelector("#help-section");
    const statsSection = document.querySelector("#stats-section");
    const settingsSection = document.querySelector("#menu-settings-section");

    menuShell?.classList.add("settings-mode");
    menuShell?.classList.remove("join-mode");
    menuShell?.classList.remove("name-mode");
    menuShell?.classList.remove("help-mode");
    menuShell?.classList.remove("stats-mode");
    mainSection?.classList.add("hidden");
    joinSection?.classList.add("hidden");
    nameSection?.classList.add("hidden");
    helpSection?.classList.add("hidden");
    statsSection?.classList.add("hidden");
    settingsSection?.classList.remove("hidden");
    setMenuView("settings", updateHistory);
    updateMenuSettingsUI();
    clearErrors();
}

function showMainMenuView(updateHistory = true): void {
    const menuShell = document.querySelector("#menu-shell");
    const mainSection = document.querySelector("#section");
    const joinSection = document.querySelector("#join-section");
    const nameSection = document.querySelector("#name-section");
    const helpSection = document.querySelector("#help-section");
    const statsSection = document.querySelector("#stats-section");
    const settingsSection = document.querySelector("#menu-settings-section");
    const codeInput = document.querySelector(
        "#join-room-code-input",
    ) as HTMLInputElement;

    menuShell?.classList.remove("join-mode");
    menuShell?.classList.remove("name-mode");
    menuShell?.classList.remove("help-mode");
    menuShell?.classList.remove("stats-mode");
    menuShell?.classList.remove("settings-mode");
    joinSection?.classList.add("hidden");
    nameSection?.classList.add("hidden");
    helpSection?.classList.add("hidden");
    statsSection?.classList.add("hidden");
    settingsSection?.classList.add("hidden");
    mainSection?.classList.remove("hidden");
    codeInput.value = "";
    setMenuView("main", updateHistory);
    clearErrors();
}

function showMenuView(view: MenuView, updateHistory = true): void {
    if (view === "join") {
        showJoinView(updateHistory);
        return;
    }

    if (view === "name") {
        showActionNameView(updateHistory);
        return;
    }

    if (view === "help") {
        showHelpView(updateHistory);
        return;
    }

    if (view === "stats") {
        showStatsView(updateHistory);
        return;
    }

    if (view === "settings") {
        showSettingsView(updateHistory);
        return;
    }

    showMainMenuView(updateHistory);
}

function navigateBackToMainMenu(): void {
    if (currentMenuView === "main") return;

    const state = globalThis.history.state as BughouseHistoryState | null;
    if (state?.bughouseView === "menu" && state.menuView === currentMenuView) {
        globalThis.history.back();
        return;
    }

    showMainMenuView();
}

function setMenuView(view: MenuView, updateHistory: boolean): void {
    if (currentMenuView === view && updateHistory) return;

    currentMenuView = view;
    if (!updateHistory) return;

    if (view === "main") replaceMenuHistoryState(view);
    else pushMenuHistoryState(view);
}

function pushMenuHistoryState(view: MenuView): void {
    globalThis.history.pushState(createMenuHistoryState(view), "", getBasePath());
}

function replaceMenuHistoryState(view: MenuView, url = getBasePath()): void {
    globalThis.history.replaceState(createMenuHistoryState(view), "", url);
}

function createMenuHistoryState(view: MenuView): BughouseHistoryState {
    return { bughouseView: "menu", menuView: view };
}

function updateJoinPlayingAs(): void {
    const label = document.querySelector("#join-playing-name");
    if (label) label.textContent = getCurrentPlayerName() || "Guest";
}

function getCurrentPlayerName(): string {
    const mainInput = document.querySelector(
        "#player-name-input",
    ) as HTMLInputElement | null;
    const joinInput = document.querySelector(
        "#join-player-name-input",
    ) as HTMLInputElement | null;
    const actionInput = document.querySelector(
        "#action-player-name-input",
    ) as HTMLInputElement | null;

    return (
        sanitizePlayerName(actionInput?.value || "") ||
        sanitizePlayerName(joinInput?.value || "") ||
        sanitizePlayerName(mainInput?.value || "") ||
        sanitizePlayerName(sn.name)
    );
}

function syncMenuNameInputs(name: string): void {
    const mainInput = document.querySelector(
        "#player-name-input",
    ) as HTMLInputElement | null;
    const joinInput = document.querySelector(
        "#join-player-name-input",
    ) as HTMLInputElement | null;
    const actionInput = document.querySelector(
        "#action-player-name-input",
    ) as HTMLInputElement | null;

    if (mainInput) mainInput.value = name;
    if (joinInput) joinInput.value = name;
    if (actionInput) actionInput.value = name;
    updateJoinPlayingAs();
}

export function applyAuthenticatedPlayerName(name: string): void {
    name = sanitizePlayerName(name);
    sn.name = name;
    if (sn.player) sn.player.name = name;
    setStoredProfileValue("name", name);
    syncMenuNameInputs(name);
}

function handleNameSubmit(event: Event): void {
    const target = event.target as HTMLInputElement;
    const name = sanitizeNameInput(target);
    if (name) {
        setPlayerName(name);
        syncMenuNameInputs(name);
    }
}

function setPlayerName(name: string): void {
    name = sanitizePlayerName(name);
    sn.name = name;
    if (sn.player) sn.player.name = name;
    setStoredProfileValue("name", name);
    sn.socket.emit("set-name", name);
}

function setupNameInput(elementId: string) {
    const input = document.querySelector(`#${elementId}`) as
        | HTMLInputElement
        | null;

    input?.addEventListener("input", () => {
        sanitizeNameInput(input);
    });

    input?.addEventListener("keypress", (event: Event) => {
        const keyEvent = event as KeyboardEvent;
        if (keyEvent.key === "Enter") handleNameSubmit(event);
    });

    input?.addEventListener("blur", handleNameSubmit);
}

function sanitizeNameInput(input: HTMLInputElement): string {
    const sanitizedName = sanitizePlayerName(input.value);
    if (input.value !== sanitizedName) input.value = sanitizedName;
    return sanitizedName;
}

function waitForSocketConnection(timeoutMs: number): Promise<boolean> {
    if (sn.socket.connected) return Promise.resolve(true);

    return new Promise((resolve) => {
        let settled = false;
        const timeout = globalThis.window.setTimeout(() => finish(false), timeoutMs);

        function finish(connected: boolean): void {
            if (settled) return;
            settled = true;
            globalThis.window.clearTimeout(timeout);
            sn.socket.off("connect", handleConnect);
            sn.socket.off("connect_error", handleConnectionError);
            sn.socket.off("disconnect", handleDisconnect);
            resolve(connected);
        }

        function handleConnect(): void {
            finish(true);
        }

        function handleConnectionError(): void {
            finish(false);
        }

        function handleDisconnect(): void {
            finish(false);
        }

        sn.socket.once("connect", handleConnect);
        sn.socket.once("connect_error", handleConnectionError);
        sn.socket.once("disconnect", handleDisconnect);
        sn.socket.connect();
    });
}

function pingServer(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        let settled = false;
        const timeout = globalThis.window.setTimeout(() => finish(false), timeoutMs);

        function finish(responded: boolean): void {
            if (settled) return;
            settled = true;
            globalThis.window.clearTimeout(timeout);
            sn.socket.off("pong", handlePong);
            sn.socket.off("disconnect", handleDisconnect);
            resolve(responded);
        }

        function handlePong(): void {
            finish(true);
        }

        function handleDisconnect(): void {
            finish(false);
        }

        sn.socket.once("pong", handlePong);
        sn.socket.once("disconnect", handleDisconnect);
        sn.socket.emit("ping");
    });
}

export function leaveRoom(): void {
    globalThis.history.replaceState(createMenuHistoryState("main"), "", getBasePath());
    sn.socket.emit("leave-room");
    showMenuScreen();
}

export function showScreen(screenId: string): void {
    for (const screen of document.querySelectorAll(".screen"))
        screen.classList.add("hidden");

    const targetScreen = document.querySelector(`#${screenId}`);
    targetScreen?.classList.remove("hidden");
}

export function showMenuScreen(updateHistory = true): void {
    showScreen("menu");
    showMainMenuView(updateHistory);
    clearErrors();
    const gameArea = document.querySelector("#game-area");
    if (gameArea) gameArea.innerHTML = "";

    stopPingUpdates();
    stopTimeUpdates();
}

export function showError(elementId: string, message: string): void {
    const errorElement = document.querySelector(`#${elementId}`);
    if (errorElement) {
        if (elementId === "menu-error") clearMenuErrorTimers();

        errorElement.textContent = message;
        errorElement.classList.remove("fading");
        errorElement.classList.add("visible");

        if (elementId !== "menu-error") {
            setTimeout(() => {
                errorElement.textContent = "";
            }, 5000);
            return;
        }

        menuErrorFadeTimeout = globalThis.window.setTimeout(() => {
            errorElement.classList.add("fading");
            errorElement.classList.remove("visible");
        }, 3500);
        menuErrorClearTimeout = globalThis.window.setTimeout(() => {
            errorElement.textContent = "";
            errorElement.classList.remove("fading");
        }, 4300);
    }
}

export function clearErrors(): void {
    for (const error of document.querySelectorAll(".error"))
        error.textContent = "";

    const menuError = document.querySelector("#menu-error");
    if (menuError) {
        clearMenuErrorTimers();
        menuError.textContent = "";
        menuError.classList.remove("visible");
        menuError.classList.remove("fading");
    }
}

function clearMenuErrorTimers(): void {
    if (menuErrorFadeTimeout !== undefined)
        globalThis.window.clearTimeout(menuErrorFadeTimeout);
    if (menuErrorClearTimeout !== undefined)
        globalThis.window.clearTimeout(menuErrorClearTimeout);

    menuErrorFadeTimeout = undefined;
    menuErrorClearTimeout = undefined;
}
