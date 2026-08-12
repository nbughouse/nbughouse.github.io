import type { ChatMessage } from "@shared/chat";
import { Color } from "@shared/chess";
import type {
    DropAggression,
    PlayerAssignment,
    PocketShare,
    PromotionType,
    TimeType,
} from "@shared/config";
import { getPlayerDisplayName, PlayerStatus } from "@shared/player";
import { RoomStatus, type Team } from "@shared/room";
import {
    clearLatestWinners,
    createMatchElements,
    isLatestWinner,
    setVisualFlipped,
    toggleVisualFlipped,
    updateUIAllGame,
} from "./match-ui";
import { leaveRoom } from "./menu-ui";
import { gs } from "./session";
import { getAssetPath, getRoomPath } from "./app-paths";
import { soundThemes, type SoundName } from "./settings";
import { createSettingsSelect, syncHoverPreviewSelect } from "./settings-ui";

let gridMode = false;
let gridLayoutObserver: ResizeObserver | undefined;

let pingIntervalID: number;
let pingStartTime: number = 0;
let roomSettingsSaveTimeout: number | undefined;
const roomSettingsSaveDelay = 300;

export function initGameControls(): void {
    initSidebarTabs();
    initGridLayoutObserver();

    const leaveGameButton = document.querySelector("#leave-game-btn");
    leaveGameButton?.addEventListener("click", () => {
        leaveRoom();
    });

    const gameRoomCode = document.querySelector("#game-room-code");
    gameRoomCode?.addEventListener("click", () => {
        copyRoomLink();
    });

    const gridToggleButton = document.querySelector("#grid-toggle-btn");
    gridToggleButton?.addEventListener("click", () => {
        toggleGridMode();
    });

    const chatInput = document.querySelector("#chat-input");
    chatInput?.addEventListener("keypress", (event: Event) => {
        const keyEvent = event as KeyboardEvent;
        if (keyEvent.key === "Enter") sendChatMessage();
    });

    // Prevent chat input from triggering keyboard shortcuts
    chatInput?.addEventListener("keydown", (event: Event) => {
        event.stopPropagation();
    });

    // Add resign button event listener
    const resignButton = document.querySelector("#resign-btn");
    resignButton?.addEventListener("click", () => {
        handleResign();
    });

    document.addEventListener("keydown", (event: Event) => {
        const keyEvent = event as KeyboardEvent;

        // Check if user is typing in an input or textarea
        const target = keyEvent.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

        if (keyEvent.key === "x") {
            toggleVisualFlipped();
            updateUIAllGame();
        }

        if (keyEvent.key === "g" || keyEvent.key === "G") toggleGridMode();

        // Navigate boards with arrow keys or A/D
        if (
            keyEvent.key === "ArrowLeft" ||
            keyEvent.key === "a" ||
            keyEvent.key === "A"
        ) {
            keyEvent.preventDefault(); // Override default HTML behavior
            navigateBoards(-1);
        } else if (
            keyEvent.key === "ArrowRight" ||
            keyEvent.key === "d" ||
            keyEvent.key === "D"
        ) {
            keyEvent.preventDefault(); // Override default HTML behavior
            navigateBoards(1);
        }
    });
}

function initSidebarTabs(): void {
    const sidebarTabs = document.querySelector("#sidebar-tabs");
    const playersTabButton = document.querySelector("#players-tab-btn");
    const settingsTabButton = document.querySelector("#settings-tab-btn");
    const playersPanel = document.querySelector("#players-tab-panel");
    const settingsPanel = document.querySelector("#settings-tab-panel");
    const chatSection = document.querySelector("#chat-section");
    const moreSettingsButton = document.querySelector("#more-room-settings-btn");

    playersTabButton?.addEventListener("click", () => {
        sidebarTabs?.classList.remove("settings-active");
        playersTabButton.classList.add("active");
        settingsTabButton?.classList.remove("active");
        playersPanel?.classList.remove("hidden");
        settingsPanel?.classList.add("hidden");
        setMoreRoomSettingsOpen(false);
        chatSection?.classList.remove("hidden");
    });

    settingsTabButton?.addEventListener("click", () => {
        sidebarTabs?.classList.add("settings-active");
        settingsTabButton.classList.add("active");
        playersTabButton?.classList.remove("active");
        settingsPanel?.classList.remove("hidden");
        playersPanel?.classList.add("hidden");
        setMoreRoomSettingsOpen(false);
        updateRoomSettingsUI();
    });

    moreSettingsButton?.addEventListener("click", () => {
        const moreSettings = document.querySelector("#more-room-settings");
        setMoreRoomSettingsOpen(moreSettings?.classList.contains("hidden") ?? true);
    });

    const timeBonusInput = document.querySelector("#setting-time-bonus");
    const timeSharedInput = document.querySelector("#setting-time-shared");
    const initialBoardModeSelect = document.querySelector(
        "#setting-initial-board-mode",
    ) as HTMLSelectElement | null;
    const initialBoardFenInput = document.querySelector(
        "#setting-initial-board-fen",
    ) as HTMLInputElement | null;
    for (const selector of [
        "#setting-match-num",
        "#setting-time-base",
        "#setting-time-bonus",
        "#setting-initial-board-fen",
        "#setting-pawn-drop-ranks",
    ])
        document
            .querySelector(selector)
            ?.addEventListener("input", queueRoomSettingsSave);

    for (const selector of [
        "#setting-match-num",
        "#setting-time-base",
        "#setting-time-bonus",
        "#setting-time-type",
        "#setting-time-shared",
        "#setting-player-assignment",
        "#setting-initial-board-mode",
        "#setting-initial-board-fen",
        "#setting-drop-aggression",
        "#setting-promotion-type",
        "#setting-pawn-drop-ranks",
        "#setting-pocket-share",
    ])
        document
            .querySelector(selector)
            ?.addEventListener("change", flushRoomSettingsSave);

    timeBonusInput?.addEventListener("keydown", stopSidebarInputShortcut);
    timeSharedInput?.addEventListener("keydown", stopSidebarInputShortcut);
    initialBoardFenInput?.addEventListener("keydown", stopSidebarInputShortcut);
    initialBoardModeSelect?.addEventListener("change", () => {
        syncInitialBoardFenVisibility(
            initialBoardModeSelect,
            initialBoardFenInput,
        );
    });

    createSettingsSelect(
        document.querySelector("#setting-player-assignment") as HTMLSelectElement,
        [
            { value: "random", label: "Random" },
            { value: "manual", label: "Manual" },
        ],
    );

    createSettingsSelect(
        document.querySelector("#setting-time-type") as HTMLSelectElement,
        [
            { value: "increment", label: "Increment" },
            { value: "delay", label: "Delay" },
        ],
    );

    createSettingsSelect(
        initialBoardModeSelect,
        [
            { value: "default", label: "Default" },
            { value: "960", label: "Chess960" },
            { value: "custom", label: "Custom FEN" },
        ],
    );
    syncInitialBoardFenVisibility(initialBoardModeSelect, initialBoardFenInput);

    createSettingsSelect(
        document.querySelector("#setting-drop-aggression") as HTMLSelectElement,
        [
            { value: "no-check", label: "No check" },
            { value: "no-mate", label: "No mate" },
            { value: "mate", label: "Allow Mate" },
        ],
    );

    createSettingsSelect(
        document.querySelector("#setting-promotion-type") as HTMLSelectElement,
        [
            { value: "upgrade", label: "Upgrade" },
            { value: "steal", label: "Steal" },
        ],
    );

    createSettingsSelect(
        document.querySelector("#setting-pocket-share") as HTMLSelectElement,
        [
            { value: "color", label: "Team colors" },
            { value: "shared", label: "Everyone" },
            { value: "none", label: "Independent" },
        ],
    );
}

function stopSidebarInputShortcut(event: Event): void {
    event.stopPropagation();
}

function setMoreRoomSettingsOpen(open: boolean): void {
    const settingsPanel = document.querySelector("#settings-tab-panel");
    const moreSettings = document.querySelector("#more-room-settings");
    const moreSettingsButton = document.querySelector("#more-room-settings-btn");
    const chatSection = document.querySelector("#chat-section");

    settingsPanel?.classList.toggle("more-settings-open", open);
    moreSettings?.classList.toggle("hidden", !open);
    chatSection?.classList.toggle("hidden", open);
    moreSettingsButton?.setAttribute("aria-expanded", open.toString());
    if (moreSettingsButton)
        moreSettingsButton.textContent = open ? "Less settings" : "More settings";
}

function queueRoomSettingsSave(): void {
    window.clearTimeout(roomSettingsSaveTimeout);
    roomSettingsSaveTimeout = window.setTimeout(
        saveRoomSettings,
        roomSettingsSaveDelay,
    );
}

function flushRoomSettingsSave(): void {
    window.clearTimeout(roomSettingsSaveTimeout);
    roomSettingsSaveTimeout = undefined;
    saveRoomSettings();
}

function saveRoomSettings(): void {
    if (!canEditRoomSettings()) return;

    const matchInput = document.querySelector(
        "#setting-match-num",
    ) as HTMLInputElement;
    const timeInput = document.querySelector(
        "#setting-time-base",
    ) as HTMLInputElement;
    const timeBonusInput = document.querySelector(
        "#setting-time-bonus",
    ) as HTMLInputElement;
    const timeTypeSelect = document.querySelector(
        "#setting-time-type",
    ) as HTMLSelectElement;
    const timeSharedInput = document.querySelector(
        "#setting-time-shared",
    ) as HTMLInputElement;
    const playerAssignmentSelect = document.querySelector(
        "#setting-player-assignment",
    ) as HTMLSelectElement;
    const initialBoardModeSelect = document.querySelector(
        "#setting-initial-board-mode",
    ) as HTMLSelectElement;
    const initialBoardFenInput = document.querySelector(
        "#setting-initial-board-fen",
    ) as HTMLInputElement;
    const dropAggressionSelect = document.querySelector(
        "#setting-drop-aggression",
    ) as HTMLSelectElement;
    const promotionTypeSelect = document.querySelector(
        "#setting-promotion-type",
    ) as HTMLSelectElement;
    const pawnDropRanksInput = document.querySelector(
        "#setting-pawn-drop-ranks",
    ) as HTMLInputElement;
    const pocketShareSelect = document.querySelector(
        "#setting-pocket-share",
    ) as HTMLSelectElement;
    const matchNum = readNumberSetting(matchInput);
    const timeBase = readNumberSetting(timeInput);
    const timeBonus = readNumberSetting(timeBonusInput);
    if (matchNum === undefined || timeBase === undefined || timeBonus === undefined)
        return;

    gs.socket.emit("update-room-settings", {
        matchNum,
        timeBase,
        timeBonus,
        timeType: timeTypeSelect.value as TimeType,
        timeShared: timeSharedInput.checked,
        playerAssignment: playerAssignmentSelect.value as PlayerAssignment,
        initialBoard: getInitialBoardSetting(
            initialBoardModeSelect,
            initialBoardFenInput,
        ),
        dropAggression: dropAggressionSelect.value as DropAggression,
        promotionType: promotionTypeSelect.value as PromotionType,
        pawnDropRanks: pawnDropRanksInput.value.trim(),
        pocketShare: pocketShareSelect.value as PocketShare,
    });
}

function readNumberSetting(input: HTMLInputElement): number | undefined {
    if (input.value.trim() === "") return undefined;

    const value = Number(input.value);
    return Number.isFinite(value) ? value : undefined;
}

function getInitialBoardSetting(
    modeSelect: HTMLSelectElement,
    fenInput: HTMLInputElement,
): string {
    if (modeSelect.value === "custom") return fenInput.value.trim();
    return modeSelect.value;
}

// MARK: Resign Functionality

function handleResign(): void {
    gs.socket.emit("resign-room");
}

function isPlayerInGame(): boolean {
    // Check if current player is playing in any match
    for (const match of gs.room.game.matches) {
        const whitePlayer = match.getPlayer(Color.WHITE);
        const blackPlayer = match.getPlayer(Color.BLACK);

        if (
            whitePlayer?.id === gs.player.id ||
            blackPlayer?.id === gs.player.id
        )
            return true;
    }
    return false;
}

// MARK: Ping Indicator

function initPingIndicator(): void {
    gs.socket.on("pong", () => {
        const pingTime = Date.now() - pingStartTime;
        updatePingDisplay(pingTime);
    });

    startPingUpdates();
}

function updatePingDisplay(ping: number): void {
    const pingIndicator = document.querySelector("#ping-indicator") as HTMLElement;
    const pingLabel = `Ping: ${Math.round(ping)} ms`;
    pingIndicator.title = pingLabel;
    pingIndicator.setAttribute("aria-label", pingLabel);

    const ranges = [
        { max: 50, bars: 4, color: "var(--green)" },
        { max: 100, bars: 3, color: "var(--green-yellow)" },
        { max: 150, bars: 2, color: "var(--yellow)" },
        { max: 250, bars: 1, color: "var(--yellow-red)" },
        { max: Infinity, bars: 1, color: "var(--red)" },
    ];

    const foundRange = ranges.find((r) => ping < r.max);
    if (!foundRange) return;

    const { bars: activeBars, color } = foundRange;

    // Update bar colors
    const bars = document.querySelectorAll(".ping-bar");
    for (const [index, bar] of bars.entries()) {
        const barElement = bar as HTMLElement;
        // We check from the bottom up (index < activeBars)
        if (index < activeBars) {
            barElement.style.backgroundColor = color;
            barElement.style.opacity = "1";
        } else {
            barElement.style.backgroundColor = "var(--background)";
            barElement.style.opacity = "0.3";
        }
    }
}

function sendPing(): void {
    pingStartTime = Date.now();
    gs.socket.emit("ping");
}

export function startPingUpdates(): void {
    stopPingUpdates();
    sendPing();
    pingIntervalID = globalThis.setInterval(() => {
        sendPing();
    }, 5000);
}

export function stopPingUpdates(): void {
    clearInterval(pingIntervalID);
}

// MARK: Sound

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

// MARK: Sidebar UI

export function showRoomElements(): void {
    const gameScreen = document.querySelector("#game") as HTMLDivElement;
    for (const screen of document.querySelectorAll(".screen"))
        screen.classList.add("hidden");

    gameScreen.classList.remove("hidden");

    const gameRoomCode = document.querySelector(
        "#game-room-code",
    ) as HTMLButtonElement;
    gameRoomCode.textContent = gs.room.code || "";

    showPlayersTab();
    rebuildRoomBoardElements();
    updateRoomSettingsUI();
    initPingIndicator();

    // Reset buttons to initial lobby state.
    resetGameButtons();
}

function copyRoomLink(): void {
    if (!gs.room?.code) return;

    const roomURL = new URL(
        getRoomPath(gs.room.code),
        globalThis.location.origin,
    ).href;

    if (globalThis.navigator.clipboard) {
        void globalThis.navigator.clipboard.writeText(roomURL);
        return;
    }

    const input = document.createElement("input");
    input.value = roomURL;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
}

function showPlayersTab(): void {
    const sidebarTabs = document.querySelector("#sidebar-tabs");
    const playersTabButton = document.querySelector("#players-tab-btn");
    const settingsTabButton = document.querySelector("#settings-tab-btn");
    const playersPanel = document.querySelector("#players-tab-panel");
    const settingsPanel = document.querySelector("#settings-tab-panel");
    const chatSection = document.querySelector("#chat-section");

    sidebarTabs?.classList.remove("settings-active");
    playersTabButton?.classList.add("active");
    settingsTabButton?.classList.remove("active");
    playersPanel?.classList.remove("hidden");
    settingsPanel?.classList.add("hidden");
    setMoreRoomSettingsOpen(false);
    chatSection?.classList.remove("hidden");
}

export function rebuildRoomBoardElements(): void {
    const boardsArea = document.querySelector("#game-area") as HTMLDivElement;
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

export function updateRoomSettingsUI(): void {
    if (!gs.room) return;

    const matchInput = document.querySelector(
        "#setting-match-num",
    ) as HTMLInputElement;
    const timeInput = document.querySelector(
        "#setting-time-base",
    ) as HTMLInputElement;
    const timeBonusInput = document.querySelector(
        "#setting-time-bonus",
    ) as HTMLInputElement;
    const timeTypeSelect = document.querySelector(
        "#setting-time-type",
    ) as HTMLSelectElement;
    const timeSharedInput = document.querySelector(
        "#setting-time-shared",
    ) as HTMLInputElement;
    const playerAssignmentSelect = document.querySelector(
        "#setting-player-assignment",
    ) as HTMLSelectElement;
    const initialBoardModeSelect = document.querySelector(
        "#setting-initial-board-mode",
    ) as HTMLSelectElement;
    const initialBoardFenInput = document.querySelector(
        "#setting-initial-board-fen",
    ) as HTMLInputElement;
    const dropAggressionSelect = document.querySelector(
        "#setting-drop-aggression",
    ) as HTMLSelectElement;
    const promotionTypeSelect = document.querySelector(
        "#setting-promotion-type",
    ) as HTMLSelectElement;
    const pawnDropRanksInput = document.querySelector(
        "#setting-pawn-drop-ranks",
    ) as HTMLInputElement;
    const pocketShareSelect = document.querySelector(
        "#setting-pocket-share",
    ) as HTMLSelectElement;
    const note = document.querySelector("#room-settings-note") as HTMLElement;

    matchInput.value = gs.room.game.config.matchNum.toString();
    timeInput.value = gs.room.game.config.timeBase.toString();
    timeBonusInput.value = gs.room.game.config.timeBonus.toString();
    timeTypeSelect.value = gs.room.game.config.timeType;
    timeSharedInput.checked = gs.room.game.config.timeShared;
    playerAssignmentSelect.value = gs.room.game.config.playerAssignment;
    setInitialBoardUI(
        initialBoardModeSelect,
        initialBoardFenInput,
        gs.room.game.config.initialBoard,
    );
    dropAggressionSelect.value = gs.room.game.config.dropAggression;
    promotionTypeSelect.value = gs.room.game.config.promotionType;
    pawnDropRanksInput.value = gs.room.game.config.pawnDropRanks;
    pocketShareSelect.value = gs.room.game.config.pocketShare;
    syncHoverPreviewSelect(timeTypeSelect);
    syncHoverPreviewSelect(playerAssignmentSelect);
    syncHoverPreviewSelect(initialBoardModeSelect);
    syncHoverPreviewSelect(dropAggressionSelect);
    syncHoverPreviewSelect(promotionTypeSelect);
    syncHoverPreviewSelect(pocketShareSelect);

    const editable = canEditRoomSettings();
    for (const element of [
        matchInput,
        timeInput,
        timeBonusInput,
        timeSharedInput,
        initialBoardFenInput,
        pawnDropRanksInput,
    ])
        element.disabled = !editable;
    for (const select of [
        timeTypeSelect,
        playerAssignmentSelect,
        initialBoardModeSelect,
        dropAggressionSelect,
        promotionTypeSelect,
        pocketShareSelect,
    ]) {
        select.disabled = !editable;
        select
            .nextElementSibling?.querySelector("button")
            ?.toggleAttribute("disabled", !editable);
    }
    note.textContent =
        gs.room.status !== RoomStatus.LOBBY
            ? "Settings are locked while a game is playing."
            : editable
              ? ""
              : "Only the host can change lobby settings.";
}

function setInitialBoardUI(
    modeSelect: HTMLSelectElement,
    fenInput: HTMLInputElement,
    initialBoard: string,
): void {
    if (
        initialBoard === "default" ||
        initialBoard === "960" ||
        initialBoard === "random"
    ) {
        modeSelect.value = initialBoard === "random" ? "960" : initialBoard;
        fenInput.value = "";
        syncInitialBoardFenVisibility(modeSelect, fenInput);
        return;
    }

    modeSelect.value = "custom";
    fenInput.value = initialBoard;
    syncInitialBoardFenVisibility(modeSelect, fenInput);
}

function syncInitialBoardFenVisibility(
    modeSelect: HTMLSelectElement | null,
    fenInput: HTMLInputElement | null,
): void {
    fenInput?.closest(".settings-field")?.classList.toggle(
        "hidden",
        modeSelect?.value !== "custom",
    );
}

function canEditRoomSettings(): boolean {
    return (
        gs.room?.status === RoomStatus.LOBBY && gs.room.hostID === gs.player.id
    );
}

export function updateStartButton(): void {
    const readyButton = document.querySelector(
        "#ready-btn",
    ) as HTMLButtonElement;
    const spectatorButton = document.querySelector(
        "#spectator-btn",
    ) as HTMLButtonElement;
    const spectatorButtonIcon = document.querySelector(
        "#spectator-btn-icon",
    ) as HTMLImageElement;

    const isHost =
        gs.room?.status === RoomStatus.LOBBY && gs.room.hostID === gs.player.id;
    const isLobby = gs.room?.status === RoomStatus.LOBBY;
    const isSpectating =
        gs.room?.getPlayer(gs.player.id)?.status === PlayerStatus.SPECTATING;
    const playerCount = [...(gs.room?.players.values() ?? [])].filter(
        (player) => player.status === PlayerStatus.CONNECTED,
    ).length;
    const isWaitingForPlayers = playerCount <= 1;

    if (isHost && isWaitingForPlayers) {
        readyButton.textContent = "Waiting for people...";
        readyButton.disabled = true;
        readyButton.classList.add("waiting");
    } else if (isHost) {
        readyButton.textContent = "Start";
        readyButton.disabled = false;
        readyButton.classList.remove("waiting");
    } else {
        readyButton.textContent = "Waiting for host...";
        readyButton.disabled = true;
        readyButton.classList.add("waiting");
    }

    spectatorButton.hidden = !isLobby;
    spectatorButton.setAttribute(
        "aria-label",
        isSpectating ? "Return to game" : "Spectate",
    );
    spectatorButton.title = isSpectating ? "Return to game" : "Spectate";
    spectatorButton.classList.toggle("is-spectating", isSpectating);
    spectatorButtonIcon.src = getAssetPath(
        isSpectating ? "img/pawn.svg" : "img/eye.svg",
    );

    updateRoomSettingsUI();
}

function resetGameButtons(): void {
    const lobbyActionRow = document.querySelector(
        "#lobby-action-row",
    ) as HTMLElement;

    lobbyActionRow.style.display = "flex";
    const resignButton = document.querySelector(
        "#resign-btn",
    ) as HTMLButtonElement;

    resignButton.style.display = "none";
    updateStartButton();
}

export function updateUIPlayerList(): void {
    const playerList = document.querySelector("#player-list");
    if (playerList) {
        playerList.innerHTML = "";
        for (const [id, player] of gs.room.players) {
            const playerDiv = document.createElement("div");
            const nameDiv = document.createElement("div");
            const statsDiv = document.createElement("div");
            const scoreText = document.createElement("span");
            const isSpectating =
                player.status === PlayerStatus.SPECTATING;
            const statusClass =
                player.status === PlayerStatus.DISCONNECTED
                    ? "status-disconnected"
                    : isSpectating
                      ? "status-spectating"
                    : "";

            const isCurrentPlayer = id === gs.player.id;

            playerDiv.className = `player-item ${statusClass}`;
            nameDiv.className = "player-name";
            nameDiv.textContent = getPlayerDisplayName(player);
            if (isCurrentPlayer)
                nameDiv.style.fontWeight = "var(--font-weight-bold)";
            statsDiv.className = "player-stats";
            if (isLatestWinner(id)) {
                const crown = document.createElement("img");
                crown.className = "winner-crown";
                crown.src = getAssetPath("img/crown.svg");
                crown.alt = "Winner";
                statsDiv.append(crown);
            }
            scoreText.textContent = `${player.wins}/${player.total}`;
            statsDiv.append(scoreText);

            if (isSpectating) {
                const spectatingIcon = document.createElement("img");
                spectatingIcon.className = "spectating-icon";
                spectatingIcon.src = getAssetPath("img/eye.svg");
                spectatingIcon.alt = "";
                spectatingIcon.setAttribute("aria-hidden", "true");
                playerDiv.append(spectatingIcon);
            }
            if (player.status === PlayerStatus.DISCONNECTED) {
                const disconnectedIcon = document.createElement("span");
                disconnectedIcon.className = "disconnected-icon";
                disconnectedIcon.setAttribute("aria-hidden", "true");
                playerDiv.append(disconnectedIcon);
            }
            playerDiv.append(nameDiv);
            playerDiv.append(statsDiv);
            playerList.append(playerDiv);
        }
    }
    updateStartButton();
}

// MARK: Chat UI

export function updateUIAllChat(): void {
    const chatMessageList = document.querySelector("#chat-message-list");
    if (!chatMessageList) return;

    chatMessageList.innerHTML = "";
    for (const message of gs.room.chat.messages) updateUIPushChat(message);
}

export function updateUIPushChat(message: ChatMessage): void {
    const chatMessagesDiv = document.querySelector("#chat-messages");
    const chatMessageList = document.querySelector("#chat-message-list");
    if (!chatMessagesDiv || !chatMessageList) return;

    const getSenderName = () => {
        if (message.id === gs.player.id) return "You";
        if (message.id === "server") return "Server";
        const player = gs.room.players.get(message.id);
        return player ? getPlayerDisplayName(player) : "Unknown";
    };

    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-message ${
        message.id === gs.player.id ? "own" : ""
    } ${message.id === "server" ? "server" : ""}`.trim();

    const senderName = getSenderName();
    const previousMessage = chatMessageList.lastElementChild as HTMLElement | null;

    if (previousMessage?.dataset.senderId === message.id) {
        const text = previousMessage.querySelector(".chat-text");
        if (text)
            text.textContent = text.textContent
                ? `${text.textContent}\n${message.message}`
                : message.message;
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
        return;
    }

    messageDiv.dataset.senderId = message.id;

    const senderDiv = document.createElement("div");
    senderDiv.className = "chat-sender";
    senderDiv.textContent = senderName;

    const textDiv = document.createElement("div");
    textDiv.className = "chat-text";
    textDiv.textContent = message.message;

    messageDiv.append(senderDiv, textDiv);
    chatMessageList.append(messageDiv);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

export function sendChatMessage(): void {
    const chatInput = document.querySelector("#chat-input") as HTMLInputElement;

    const message = chatInput.value.trim();
    if (message.length > 0) {
        gs.socket.emit("send-chat", message);
        chatInput.value = "";
    }
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
        gridToggleButton.innerHTML = `
         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
         </svg>
        `;

        updateGridLayout();
    } else {
        gameArea.classList.remove("grid-mode");
        gridToggleButton.innerHTML = `
         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="18"></rect>
            <rect x="14" y="3" width="7" height="18"></rect>
         </svg>
        `;

        resetToFlexLayout();
    }
    updateScrollButtons();
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

    // Match Aspect Ratio: Width (8 squares) / Height (10 squares) = 0.8
    const ratio = 0.8;

    let bestW = 0;
    let bestCols = 1;

    for (let cols = 1; cols <= boardCount; cols++) {
        const rows = Math.ceil(boardCount / cols);
        const horizontalGaps = columnGap * Math.max(0, cols - 1);
        const verticalGaps = rowGap * Math.max(0, rows - 1);
        let w = (availableWidth - horizontalGaps) / cols;
        const heightConstrainedWidth =
            ((availableHeight - verticalGaps) / rows) * ratio;
        w = Math.min(w, heightConstrainedWidth);

        if (w > bestW) {
            bestW = w;
            bestCols = cols;
        }
    }

    gameArea.style.gridTemplateColumns = `repeat(${bestCols}, auto)`;

    for (const match of matches) {
        const m = match as HTMLElement;
        // Apply the calculated width, height follows aspect ratio
        m.style.width = `${bestW}px`;
        m.style.height = `${bestW * (1 / ratio)}px`;
        m.style.setProperty("--square-size", `${bestW / 8}px`);
    }
}

function resetToFlexLayout(): void {
    const gameArea = document.querySelector("#game-area") as HTMLDivElement;
    const matches = gameArea.querySelectorAll(".match-container");

    gameArea.style.gridTemplateColumns = "";
    for (const match of matches) {
        const m = match as HTMLElement;
        m.style.width = "";
        m.style.height = "";
        m.style.removeProperty("--square-size");
    }
}

// MARK: Start/End Game UI

export function startGameUI(): void {
    const lobbyActionRow = document.querySelector(
        "#lobby-action-row",
    ) as HTMLElement;
    const resignButton = document.querySelector(
        "#resign-btn",
    ) as HTMLButtonElement;

    clearLatestWinners();

    // Show resign button only if player is in the game
    if (isPlayerInGame()) {
        lobbyActionRow.style.display = "none";
        resignButton.style.display = "block";
    } else {
        lobbyActionRow.style.display = "none";
        resignButton.style.display = "none";
    }

    // Put current player on bottom
    let topBottomDelta = 0; // # of this player on top - # on bottom
    for (const match of gs.room.game.matches) {
        const playerIsTop =
            match.getPlayer(match.flipped ? Color.WHITE : Color.BLACK)?.id ===
            gs.player.id;
        const playerIsBottom =
            match.getPlayer(match.flipped ? Color.BLACK : Color.WHITE)?.id ===
            gs.player.id;

        topBottomDelta += (playerIsTop ? 1 : 0) - (playerIsBottom ? 1 : 0);
    }

    // If more boards have this player on top than bottom, flip all boards
    setVisualFlipped(topBottomDelta > 0);
    updateUIAllGame();
    initScrollControls();
}

export function endGameUI(): void {
    const lobbyActionRow = document.querySelector(
        "#lobby-action-row",
    ) as HTMLElement;
    const resignButton = document.querySelector(
        "#resign-btn",
    ) as HTMLButtonElement;

    lobbyActionRow.style.display = "flex";
    resignButton.style.display = "none";
    updateStartButton();

    updateUIAllGame();
    updateUIPlayerList();
    updateRoomSettingsUI();
}
