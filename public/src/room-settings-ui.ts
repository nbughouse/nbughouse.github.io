import type {
    DropAggression,
    PocketShare,
    PromotionType,
    TimeType,
} from "@shared/config";
import { isKungFuInitialBoard } from "@shared/config";
import { RoomStatus } from "@shared/room";
import { gs } from "./session";
import { createSettingsSelect, syncHoverPreviewSelect } from "./settings-ui";

let roomSettingsSaveTimeout: number | undefined;
const roomSettingsSaveDelay = 300;

export function initRoomSettingsUI(): void {
    const moreSettingsButton = document.querySelector("#more-room-settings-btn");
    const variantsButton = document.querySelector("#room-variants-btn");
    const variantButtons = document.querySelectorAll<HTMLButtonElement>(
        ".room-variant-button",
    );
    const timeBonusInput = document.querySelector("#setting-time-bonus");
    const timeSharedInput = document.querySelector("#setting-time-shared");
    const initialBoardModeSelect = document.querySelector(
        "#setting-initial-board-mode",
    ) as HTMLSelectElement | null;
    const initialBoardFenInput = document.querySelector(
        "#setting-initial-board-fen",
    ) as HTMLInputElement | null;

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

    for (const selector of [
        "#setting-match-num",
        "#setting-time-base",
        "#setting-time-bonus",
        "#setting-piece-cooldown",
        "#setting-pocket-cooldown",
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
        "#setting-piece-cooldown",
        "#setting-pocket-cooldown",
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

    timeBonusInput?.addEventListener("keydown", stopRoomSettingsInputShortcut);
    timeSharedInput?.addEventListener("keydown", stopRoomSettingsInputShortcut);
    initialBoardFenInput?.addEventListener(
        "keydown",
        stopRoomSettingsInputShortcut,
    );
    initialBoardModeSelect?.addEventListener("change", () => {
        syncInitialBoardStartMode(initialBoardModeSelect);
        syncInitialBoardFenVisibility(
            initialBoardModeSelect,
            initialBoardFenInput,
        );
        syncRoomVariantButtons(initialBoardModeSelect);
        syncClockSettingsLock(initialBoardModeSelect);
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

            setInitialBoardUI(
                initialBoardModeSelect,
                initialBoardFenInput,
                toggleInitialBoardVariant(
                    initialBoardModeSelect.dataset.initialBoard ??
                        initialBoardModeSelect.value,
                    variant,
                ),
            );
            syncInitialBoardFenVisibility(
                initialBoardModeSelect,
                initialBoardFenInput,
            );
            syncHoverPreviewSelect(initialBoardModeSelect);
            syncRoomVariantButtons(initialBoardModeSelect);
            syncClockSettingsLock(initialBoardModeSelect);
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
            { value: "custom", label: "Custom FEN" },
        ],
    );
    syncInitialBoardFenVisibility(initialBoardModeSelect, initialBoardFenInput);
    syncRoomVariantButtons(initialBoardModeSelect);
    syncClockSettingsLock(initialBoardModeSelect);

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

export function setMoreRoomSettingsOpen(open: boolean): void {
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

export function setRoomVariantsOpen(open: boolean): void {
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
    const pieceCooldownInput = document.querySelector(
        "#setting-piece-cooldown",
    ) as HTMLInputElement;
    const pocketCooldownInput = document.querySelector(
        "#setting-pocket-cooldown",
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
    pieceCooldownInput.value = gs.room.game.config.pieceCooldown.toString();
    pocketCooldownInput.value = gs.room.game.config.pocketCooldown.toString();
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
    const clockSettingsLocked = isKungFuInitialBoard(
        gs.room.game.config.initialBoard,
    );
    for (const element of [
        matchInput,
        pieceCooldownInput,
        pocketCooldownInput,
        initialBoardFenInput,
        pawnDropRanksInput,
        ...variantButtons,
    ])
        element.disabled = !editable;
    variantsButton.disabled = false;
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
    setClockSettingsDisabled(!editable || clockSettingsLocked);
    note.textContent =
        gs.room.status !== RoomStatus.LOBBY
            ? "Settings are locked while a game is playing."
            : editable
              ? ""
              : "Only the host can change lobby settings.";
}

function stopRoomSettingsInputShortcut(event: Event): void {
    event.stopPropagation();
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
    const pieceCooldownInput = document.querySelector(
        "#setting-piece-cooldown",
    ) as HTMLInputElement;
    const pocketCooldownInput = document.querySelector(
        "#setting-pocket-cooldown",
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
    const initialBoard = getInitialBoardSetting(
        initialBoardModeSelect,
        initialBoardFenInput,
    );
    const clockSettingsLocked = isKungFuInitialBoard(initialBoard);
    const timeBase = readNumberSetting(timeInput);
    const timeBonus = readNumberSetting(timeBonusInput);
    const pieceCooldown = readNumberSetting(pieceCooldownInput);
    const pocketCooldown = readNumberSetting(pocketCooldownInput);
    if (
        matchNum === undefined ||
        (!clockSettingsLocked && timeBase === undefined) ||
        (!clockSettingsLocked && timeBonus === undefined) ||
        pieceCooldown === undefined ||
        pocketCooldown === undefined
    )
        return;

    const settings = {
        matchNum,
        pieceCooldown,
        pocketCooldown,
        playerAssignment: gs.room.game.config.playerAssignment,
        initialBoard,
        dropAggression: dropAggressionSelect.value as DropAggression,
        promotionType: promotionTypeSelect.value as PromotionType,
        pawnDropRanks: pawnDropRanksInput.value.trim(),
        pocketShare: pocketShareSelect.value as PocketShare,
    };

    gs.socket.emit(
        "update-room-settings",
        clockSettingsLocked
            ? settings
            : {
                  ...settings,
                  timeBase,
                  timeBonus,
                  timeType: timeTypeSelect.value as TimeType,
                  timeShared: timeSharedInput.checked,
              },
    );
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
    return modeSelect.dataset.initialBoard ?? modeSelect.value;
}

function syncRoomVariantButtons(
    initialBoardModeSelect: HTMLSelectElement | null,
): void {
    const activeVariants = parseInitialBoardVariants(
        initialBoardModeSelect?.dataset.initialBoard ??
            initialBoardModeSelect?.value ??
            "default",
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
    else {
        variants.add(variant);
        if (variant === "koedem") variants.delete("taijitu");
        if (variant === "taijitu") variants.delete("koedem");
    }

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
                    current === "taijitu" ||
                    current === "accolade",
            ),
    );
}

function serializeInitialBoardVariants(variants: Set<string>): string {
    const orderedVariants = ["960", "koedem", "taijitu", "accolade"].filter(
        (variant) => variants.has(variant),
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
        (variants.size > 0 && serializeInitialBoardVariants(variants) === normalized)
    ) {
        modeSelect.dataset.initialBoard = normalized;
        modeSelect.value = variants.has("960") ? "960" : "default";
        fenInput.value = "";
        syncInitialBoardFenVisibility(modeSelect, fenInput);
        return;
    }

    modeSelect.dataset.initialBoard = initialBoard;
    modeSelect.value = "custom";
    fenInput.value = initialBoard;
    syncInitialBoardFenVisibility(modeSelect, fenInput);
}

function syncInitialBoardStartMode(modeSelect: HTMLSelectElement): void {
    if (modeSelect.value === "custom") {
        modeSelect.dataset.initialBoard = "custom";
        return;
    }

    const variants = parseInitialBoardVariants(
        modeSelect.dataset.initialBoard ?? "default",
    );
    if (modeSelect.value === "960") variants.add("960");
    else variants.delete("960");

    modeSelect.dataset.initialBoard = serializeInitialBoardVariants(variants);
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

function syncClockSettingsLock(
    initialBoardModeSelect: HTMLSelectElement | null,
): void {
    const clockSettingsLocked = isKungFuInitialBoard(
        initialBoardModeSelect?.dataset.initialBoard ??
            initialBoardModeSelect?.value ??
            "default",
    );
    setClockSettingsDisabled(!canEditRoomSettings() || clockSettingsLocked);
}

function setClockSettingsDisabled(disabled: boolean): void {
    const timeInput = document.querySelector(
        "#setting-time-base",
    ) as HTMLInputElement | null;
    const timeBonusInput = document.querySelector(
        "#setting-time-bonus",
    ) as HTMLInputElement | null;
    const timeTypeSelect = document.querySelector(
        "#setting-time-type",
    ) as HTMLSelectElement | null;
    const timeSharedInput = document.querySelector(
        "#setting-time-shared",
    ) as HTMLInputElement | null;

    for (const element of [timeInput, timeBonusInput, timeSharedInput])
        if (element) element.disabled = disabled;

    if (!timeTypeSelect) return;
    timeTypeSelect.disabled = disabled;
    timeTypeSelect
        .nextElementSibling?.querySelector("button")
        ?.toggleAttribute("disabled", disabled);
}

function canEditRoomSettings(): boolean {
    return (
        gs.room?.status === RoomStatus.LOBBY && gs.room.hostID === gs.player.id
    );
}
