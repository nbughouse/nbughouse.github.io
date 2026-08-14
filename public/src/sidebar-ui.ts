// Sidebar UI is intentionally isolated from board layout and rendering.
import { sanitizeChatMessage, type ChatBadge, type ChatMessage } from "@shared/chat";
import { Color } from "@shared/chess";
import type {
    DropAggression,
    PocketShare,
    PromotionType,
    TimeType,
} from "@shared/config";
import {
    getPlayerDisplayName,
    type Player,
    PlayerStatus,
} from "@shared/player";
import { RoomStatus, Team } from "@shared/room";
import { getAssetPath, getRoomPath } from "./app-paths";
import { isLatestWinner } from "./match-ui";
import { leaveRoom } from "./menu-ui";
import { gs } from "./session";
import { createSettingsSelect, syncHoverPreviewSelect } from "./settings-ui";

let pingIntervalID: number;
let pingStartTime = 0;
let roomSettingsSaveTimeout: number | undefined;
const roomSettingsSaveDelay = 300;

export function initSidebarControls(): void {
    initSidebarTabs();

    document
        .querySelector("#leave-game-btn")
        ?.addEventListener("click", leaveRoom);
    document
        .querySelector("#game-room-code")
        ?.addEventListener("click", copyRoomLink);
    document
        .querySelector("#resign-btn")
        ?.addEventListener("click", handleResign);

    const chatInput = document.querySelector("#chat-input");
    chatInput?.addEventListener("keypress", (event: Event) => {
        if ((event as KeyboardEvent).key === "Enter") sendChatMessage();
    });
    chatInput?.addEventListener("keydown", (event: Event) =>
        event.stopPropagation(),
    );
}

function initSidebarTabs(): void {
    const sidebarTabs = document.querySelector("#sidebar-tabs");
    const playersTabButton = document.querySelector("#players-tab-btn");
    const settingsTabButton = document.querySelector("#settings-tab-btn");
    const playersPanel = document.querySelector("#players-tab-panel");
    const settingsPanel = document.querySelector("#settings-tab-panel");
    const chatSection = document.querySelector("#chat-section");
    const moreSettingsButton = document.querySelector("#more-room-settings-btn");
    const variantsButton = document.querySelector("#room-variants-btn");
    const variantButtons = document.querySelectorAll<HTMLButtonElement>(
        ".room-variant-button",
    );

    playersTabButton?.addEventListener("click", () => {
        sidebarTabs?.classList.remove("settings-active");
        playersTabButton.classList.add("active");
        settingsTabButton?.classList.remove("active");
        playersPanel?.classList.remove("hidden");
        settingsPanel?.classList.add("hidden");
        setMoreRoomSettingsOpen(false);
        setRoomVariantsOpen(false);
        chatSection?.classList.remove("hidden");
    });

    settingsTabButton?.addEventListener("click", () => {
        sidebarTabs?.classList.add("settings-active");
        settingsTabButton.classList.add("active");
        playersTabButton?.classList.remove("active");
        settingsPanel?.classList.remove("hidden");
        playersPanel?.classList.add("hidden");
        setMoreRoomSettingsOpen(false);
        setRoomVariantsOpen(false);
        updateRoomSettingsUI();
    });

    moreSettingsButton?.addEventListener("click", () => {
        const moreSettings = document.querySelector("#more-room-settings");
        const open = moreSettings?.classList.contains("hidden") ?? true;
        if (open) setRoomVariantsOpen(false);
        setMoreRoomSettingsOpen(open);
    });
    variantsButton?.addEventListener("click", () => {
        const variantButtonsPanel = document.querySelector("#room-variant-buttons");
        const open = variantButtonsPanel?.classList.contains("hidden") ?? true;

        setMoreRoomSettingsOpen(false);
        setRoomVariantsOpen(open);
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
        syncRoomVariantButtons(initialBoardModeSelect);
    });
    for (const variantButton of variantButtons) {
        variantButton.addEventListener("click", () => {
            const variant = variantButton.dataset.initialBoard;
            if (!variant) return;

            if (
                !initialBoardModeSelect ||
                !initialBoardFenInput ||
                !canEditRoomSettings()
            )
                return;

            initialBoardModeSelect.value = toggleInitialBoardVariant(
                initialBoardModeSelect.value,
                variant,
            );
            syncInitialBoardFenVisibility(
                initialBoardModeSelect,
                initialBoardFenInput,
            );
            syncHoverPreviewSelect(initialBoardModeSelect);
            syncRoomVariantButtons(initialBoardModeSelect);
            flushRoomSettingsSave();
        });
    }

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
            { value: "koedem", label: "Koedem" },
            { value: "accolade", label: "Accolade" },
            { value: "960+koedem", label: "Chess960 + Koedem" },
            { value: "960+accolade", label: "Chess960 + Accolade" },
            { value: "koedem+accolade", label: "Koedem + Accolade" },
            {
                value: "960+koedem+accolade",
                label: "Chess960 + Koedem + Accolade",
            },
            { value: "custom", label: "Custom FEN" },
        ],
    );
    syncInitialBoardFenVisibility(initialBoardModeSelect, initialBoardFenInput);
    syncRoomVariantButtons(initialBoardModeSelect);

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

function setRoomVariantsOpen(open: boolean): void {
    const variantsButton = document.querySelector(
        "#room-variants-btn",
    ) as HTMLButtonElement | null;
    const variantButtonsPanel = document.querySelector("#room-variant-buttons");
    const chatMessages = document.querySelector("#chat-messages");
    const chatSection = document.querySelector("#chat-section");

    variantButtonsPanel?.classList.toggle("hidden", !open);
    chatMessages?.classList.toggle("hidden", open);
    chatSection?.classList.toggle("variants-open", open);
    variantsButton?.setAttribute("aria-expanded", open.toString());
    if (variantsButton) {
        const label = open ? "Hide Variants" : "Show Variants";
        variantsButton.textContent = label;
        variantsButton.setAttribute("aria-label", label);
        variantsButton.title = label;
    }
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
        playerAssignment: "random",
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

export function showSidebarRoomElements(): void {
    const gameRoomCode = document.querySelector("#game-room-code") as HTMLButtonElement;
    gameRoomCode.textContent = gs.room.code || "";

    showPlayersTab();
    updateRoomSettingsUI();
    initPingIndicator();
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
    const variantsButton = document.querySelector(
        "#room-variants-btn",
    ) as HTMLButtonElement;
    const variantButtons = document.querySelectorAll<HTMLButtonElement>(
        ".room-variant-button",
    );
    const note = document.querySelector("#room-settings-note") as HTMLElement;

    matchInput.value = gs.room.game.config.matchNum.toString();
    timeInput.value = gs.room.game.config.timeBase.toString();
    timeBonusInput.value = gs.room.game.config.timeBonus.toString();
    timeTypeSelect.value = gs.room.game.config.timeType;
    timeSharedInput.checked = gs.room.game.config.timeShared;
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
    syncHoverPreviewSelect(initialBoardModeSelect);
    syncRoomVariantButtons(initialBoardModeSelect);
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
        variantsButton,
        ...variantButtons,
    ])
        element.disabled = !editable;
    for (const select of [
        timeTypeSelect,
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

function syncRoomVariantButtons(
    initialBoardModeSelect: HTMLSelectElement | null,
): void {
    const activeVariants = parseInitialBoardVariants(
        initialBoardModeSelect?.value ?? "default",
    );

    for (const variantButton of document.querySelectorAll<HTMLButtonElement>(
        ".room-variant-button",
    )) {
        variantButton.setAttribute(
            "aria-pressed",
            activeVariants.has(variantButton.dataset.initialBoard ?? "").toString(),
        );
    }
}

function toggleInitialBoardVariant(
    initialBoard: string,
    variant: string,
): string {
    const variants = parseInitialBoardVariants(initialBoard);

    if (variants.has(variant)) variants.delete(variant);
    else variants.add(variant);

    return serializeInitialBoardVariants(variants);
}

function parseInitialBoardVariants(initialBoard: string): Set<string> {
    const normalized = initialBoard === "random" ? "960" : initialBoard;
    return new Set(
        normalized
            .split("+")
            .filter(
                (current) =>
                    current === "960" ||
                    current === "koedem" ||
                    current === "accolade",
            ),
    );
}

function serializeInitialBoardVariants(variants: Set<string>): string {
    const orderedVariants = ["960", "koedem", "accolade"].filter((variant) =>
        variants.has(variant),
    );
    return orderedVariants.length ? orderedVariants.join("+") : "default";
}

function setInitialBoardUI(
    modeSelect: HTMLSelectElement,
    fenInput: HTMLInputElement,
    initialBoard: string,
): void {
    const normalized = initialBoard === "random" ? "960" : initialBoard;
    const variants = parseInitialBoardVariants(normalized);
    if (
        normalized === "default" ||
        serializeInitialBoardVariants(variants) === normalized
    ) {
        modeSelect.value = normalized;
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

    const isPlaying = gs.room?.status === RoomStatus.PLAYING;
    const isCurrentPlayerPlaying = isPlayerInGame();
    const isHost =
        gs.room?.status === RoomStatus.LOBBY && gs.room.hostID === gs.player.id;
    const isLobby = gs.room?.status === RoomStatus.LOBBY;
    const isSpectating =
        gs.room?.getPlayer(gs.player.id)?.status === PlayerStatus.SPECTATING;
    const playerCount = [...(gs.room?.players.values() ?? [])].filter(
        (player) => player.status === PlayerStatus.CONNECTED,
    ).length;
    const isWaitingForPlayers = playerCount <= 1;

    if (isPlaying) {
        readyButton.textContent = "Waiting for next round...";
        readyButton.disabled = true;
        readyButton.classList.add("waiting");
    } else if (isHost && isWaitingForPlayers) {
        readyButton.textContent = "Waiting for people...";
        readyButton.disabled = true;
        readyButton.classList.add("waiting");
    } else if (isHost) {
        readyButton.textContent = "Start";
        readyButton.disabled = false;
        readyButton.classList.remove("waiting");
    } else {
        readyButton.textContent = "Waiting for start...";
        readyButton.disabled = true;
        readyButton.classList.add("waiting");
    }

    spectatorButton.hidden = !isLobby && !(isPlaying && !isCurrentPlayerPlaying);
    const spectatorLabel = isPlaying
        ? isSpectating
            ? "Play next round"
            : "Spectate next round"
        : isSpectating
          ? "Return to game"
          : "Spectate";
    spectatorButton.setAttribute("aria-label", spectatorLabel);
    spectatorButton.title = spectatorLabel;
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
        const previousPlayerTops = new Map(
            [...playerList.querySelectorAll<HTMLElement>(".player-item")].map(
                (playerItem) => [
                    playerItem.dataset.playerId,
                    playerItem.getBoundingClientRect().top,
                ],
            ),
        );
        playerList.innerHTML = "";
        const playersByScore = [...gs.room.players].sort(
            ([, playerA], [, playerB]) =>
                comparePlayersByScore(playerA, playerB),
        );
        for (const [id, player] of playersByScore) {
            const playerDiv = document.createElement("div");
            const nameDiv = document.createElement("div");
            const statsDiv = document.createElement("div");
            const scoreText = document.createElement("span");
            const isDisplayedAsSpectator = isPlayerDisplayedAsInactive(
                id,
                player,
            );
            const isTrueSpectator = isPlayerDisplayedAsSpectator(id, player);
            const statusClasses = [
                player.status === PlayerStatus.DISCONNECTED
                    ? "status-disconnected"
                    : "",
                isDisplayedAsSpectator ? "status-spectating" : "",
            ].filter(Boolean);

            const isCurrentPlayer = id === gs.player.id;

            const relationshipClass = isCurrentPlayer
                ? "own"
                : getPlayerRelationshipClass(id);
            playerDiv.className =
                `player-item ${statusClasses.join(" ")} ${relationshipClass}`.trim();
            playerDiv.dataset.playerId = id;
            nameDiv.className = "player-name";
            nameDiv.textContent = getPlayerDisplayName(player);
            if (id === gs.room.hostID) {
                const hostBadge = document.createElement("span");
                hostBadge.className = "host-badge";
                hostBadge.textContent = " (Host)";
                nameDiv.append(hostBadge);
            }
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

            if (isTrueSpectator) {
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

        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            for (const playerItem of playerList.querySelectorAll<HTMLElement>(
                ".player-item",
            )) {
                const previousTop = previousPlayerTops.get(
                    playerItem.dataset.playerId,
                );
                if (previousTop === undefined) continue;

                const offset = previousTop - playerItem.getBoundingClientRect().top;
                if (Math.abs(offset) < 1) continue;

                playerItem.animate(
                    [
                        { transform: `translateY(${offset}px)` },
                        { transform: "translateY(0)" },
                    ],
                    { duration: 250, easing: "ease-out" },
                );
            }
        }
    }
    updateStartButton();
}

function comparePlayersByScore(
    playerA: Pick<Player, "wins" | "total">,
    playerB: Pick<Player, "wins" | "total">,
): number {
    const winRateA = playerA.total > 0 ? playerA.wins / playerA.total : 0;
    const winRateB = playerB.total > 0 ? playerB.wins / playerB.total : 0;

    return winRateB - winRateA || playerB.total - playerA.total;
}

// MARK: Chat UI

export function updateUIAllChat(): void {
    const chatMessageList = document.querySelector("#chat-message-list");
    if (!chatMessageList) return;

    chatMessageList.innerHTML = "";
    for (const message of gs.room.chat.messages) updateUIPushChat(message);
}

export function updateUIPushChat(message: ChatMessage): void {
    const chatMessageList = document.querySelector("#chat-message-list");
    if (!chatMessageList) return;

    const getSenderName = () => {
        if (message.id === gs.player.id) return "You";
        if (message.id === "server") return "Server";
        const player = gs.room.players.get(message.id);
        return player ? getPlayerDisplayName(player) : "Unknown";
    };

    const messageDiv = document.createElement("div");
    const appearance = getStoredChatAppearance(message);
    const isGameLifecycleMessage =
        message.id === "server" &&
        (message.message === "The game started." ||
            /^Team (?:red|blue) won!/.test(message.message));
    messageDiv.className = `chat-message ${
        message.id === gs.player.id ? "own" : ""
    } ${message.id === "server" ? "server" : ""} ${
        getPlayerRelationshipClass(message.id)
    }`.trim();
    messageDiv.classList.toggle("game-lifecycle", isGameLifecycleMessage);
    if (message.id !== "server") {
        messageDiv.style.backgroundColor = appearance.color;
        messageDiv.style.opacity = appearance.opacity.toString();
    }

    const senderName = getSenderName();
    const showAllChatLabel = shouldShowAllChatLabel(message);
    const previousMessage = chatMessageList.lastElementChild as HTMLElement | null;

    if (
        gs.settings.messageGrouping &&
        !isGameLifecycleMessage &&
        previousMessage?.dataset.gameLifecycle !== "true" &&
        previousMessage?.dataset.senderId === message.id &&
        previousMessage.dataset.color === appearance.color &&
        previousMessage.dataset.opacity === appearance.opacity.toString() &&
        previousMessage.dataset.badges === appearance.badges.join(",") &&
        previousMessage.dataset.allChat === showAllChatLabel.toString()
    ) {
        previousMessage.classList.add("grouped");
        const text = previousMessage.querySelector(".chat-text");
        if (text)
            text.textContent = text.textContent
                ? `${text.textContent}\n${message.message}`
                : message.message;
        chatMessageList.scrollTop = chatMessageList.scrollHeight;
        return;
    }

    messageDiv.dataset.senderId = message.id;
    messageDiv.dataset.color = appearance.color;
    messageDiv.dataset.opacity = appearance.opacity.toString();
    messageDiv.dataset.badges = appearance.badges.join(",");
    messageDiv.dataset.allChat = showAllChatLabel.toString();
    messageDiv.dataset.gameLifecycle = isGameLifecycleMessage.toString();

    const senderDiv = document.createElement("div");
    senderDiv.className = "chat-sender";

    const senderNameSpan = document.createElement("span");
    senderNameSpan.textContent = senderName;
    senderDiv.append(senderNameSpan);

    if (showAllChatLabel) {
        const allChatLabel = document.createElement("span");
        allChatLabel.className = "chat-all-label";
        allChatLabel.textContent = "(all)";
        senderDiv.append(allChatLabel);
    }

    for (const badge of appearance.badges)
        senderDiv.append(createChatBadge(badge));

    const textDiv = document.createElement("div");
    textDiv.className = "chat-text";
    textDiv.textContent = message.message;

    messageDiv.append(senderDiv, textDiv);
    chatMessageList.append(messageDiv);
    chatMessageList.scrollTop = chatMessageList.scrollHeight;
}

function shouldShowAllChatLabel(message: ChatMessage): boolean {
    if (!message.isAllChat || gs.room.status !== RoomStatus.PLAYING)
        return false;

    const ownTeam = getPlayerTeam(gs.player.id);
    if (!ownTeam) return false;

    return gs.room.game.matches.some((match) => {
        const teammate = match.getPlayerTeam(ownTeam);
        return teammate !== undefined && teammate.id !== gs.player.id;
    });
}

export function getPlayerPlaqueAppearance(playerID: string): {
    color: string;
    opacity: number;
    badges: ChatBadge[];
} {
    const plaque = [...document.querySelectorAll<HTMLElement>(".player-item")]
        .find((item) => item.dataset.playerId === playerID);

    if (!plaque)
        return { color: getCSSColor("--surface"), opacity: 1, badges: [] };

    const style = getComputedStyle(plaque);
    const opacity = Number.parseFloat(style.opacity);
    const badges: ChatBadge[] = [];
    if (plaque.querySelector(".spectating-icon")) badges.push("spectating");
    if (plaque.querySelector(".disconnected-icon"))
        badges.push("disconnected");
    if (plaque.querySelector(".winner-crown")) badges.push("winner");

    return {
        color: style.backgroundColor,
        opacity: Number.isFinite(opacity) ? opacity : 1,
        badges,
    };
}

function getStoredChatAppearance(message: ChatMessage): {
    color: string;
    opacity: number;
    badges: ChatBadge[];
} {
    // Snapshot the rendered player plaque color so later team/status changes or
    // the player leaving cannot recolor an existing message.
    if (
        message.color === undefined ||
        message.opacity === undefined ||
        message.badges === undefined
    ) {
        const plaque = getPlayerPlaqueAppearance(message.id);
        message.color ??= plaque.color;
        message.opacity ??= plaque.opacity;
        message.badges ??= plaque.badges;
    }

    return {
        color: message.color,
        opacity: message.opacity,
        badges: message.badges,
    };
}

function createChatBadge(badge: ChatBadge): HTMLElement {
    if (badge === "winner") {
        const crown = document.createElement("img");
        crown.className = "chat-badge winner-crown";
        crown.src = getAssetPath("img/crown.svg");
        crown.alt = "Winner";
        crown.title = "Winner";
        return crown;
    }

    if (badge === "spectating") {
        const eye = document.createElement("img");
        eye.className = "chat-badge spectating-icon";
        eye.src = getAssetPath("img/eye.svg");
        eye.alt = "Spectating";
        eye.title = "Spectating";
        return eye;
    }

    const disconnected = document.createElement("span");
    disconnected.className = "chat-badge disconnected-icon";
    disconnected.setAttribute("role", "img");
    disconnected.setAttribute("aria-label", "Disconnected");
    disconnected.title = "Disconnected";
    return disconnected;
}

function getCSSColor(property: string): string {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(property)
        .trim();
}

function getPlayerRelationshipClass(playerID: string): string {
    if (playerID === "server") return "";
    if (isPlayerDisplayedAsInactive(playerID)) return "";
    if (playerID === gs.player.id) return "own";

    const ownTeam = getPlayerTeam(gs.player.id);
    const playerTeam = getPlayerTeam(playerID);
    if (!ownTeam || !playerTeam) return "";

    return ownTeam === playerTeam ? "teammate" : "opponent";
}

function isPlayerDisplayedAsInactive(
    playerID: string,
    player = gs.room.players.get(playerID),
): boolean {
    if (!player) return false;
    return (
        isPlayerDisplayedAsSpectator(playerID, player) ||
        (gs.room.status === RoomStatus.PLAYING && !getPlayerTeam(playerID))
    );
}

function isPlayerDisplayedAsSpectator(
    playerID: string,
    player = gs.room.players.get(playerID),
): boolean {
    if (!player || player.status !== PlayerStatus.SPECTATING) return false;
    return !getPlayerTeam(playerID);
}

function getPlayerTeam(playerID: string): Team | undefined {
    for (const match of gs.room.game.matches) {
        if (match.getPlayerTeam(Team.BLUE)?.id === playerID) return Team.BLUE;
        if (match.getPlayerTeam(Team.RED)?.id === playerID) return Team.RED;
    }
}

export function sendChatMessage(): void {
    const chatInput = document.querySelector("#chat-input") as HTMLInputElement;

    const message = sanitizeChatMessage(chatInput.value);
    if (message.length > 0) {
        gs.socket.emit("send-chat", message);
        chatInput.value = "";
    }
}

export function startSidebarGameUI(): void {
    const lobbyActionRow = document.querySelector(
        "#lobby-action-row",
    ) as HTMLElement;
    const resignButton = document.querySelector(
        "#resign-btn",
    ) as HTMLButtonElement;

    if (isPlayerInGame()) {
        lobbyActionRow.style.display = "none";
        resignButton.style.display = "block";
    } else {
        lobbyActionRow.style.display = "flex";
        resignButton.style.display = "none";
    }
    updateStartButton();
}

export function endSidebarGameUI(): void {
    const lobbyActionRow = document.querySelector(
        "#lobby-action-row",
    ) as HTMLElement;
    const resignButton = document.querySelector(
        "#resign-btn",
    ) as HTMLButtonElement;

    lobbyActionRow.style.display = "flex";
    resignButton.style.display = "none";
    updateStartButton();
    updateUIPlayerList();
    updateRoomSettingsUI();
}
