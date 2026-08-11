import { getAssetPath } from "./app-paths";
import { boardThemes, pieceThemes } from "./settings";

export interface SelectOption {
    value: string;
    label: string;
}

let preloaded = false;

export function preloadSettingsAssets(): void {
    if (preloaded) return;
    preloaded = true;

    for (const theme of pieceThemes)
        preloadAsset("style", getAssetPath(`pieces/${theme}.css`));

    for (const theme of boardThemes) {
        if (theme.image) preloadAsset("image", getAssetPath(`board/${theme.image}`));
    }
}

export function populateSelect(
    select: HTMLSelectElement | null,
    options: SelectOption[],
    selectedValue = select?.value || "",
): void {
    if (!select) return;

    select.innerHTML = "";
    for (const option of orderOptionsForInitialSelection(options, selectedValue)) {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        select.append(element);
    }
}

export function createHoverPreviewSelect(
    select: HTMLSelectElement | null,
    options: SelectOption[],
    preview: (value: string) => void,
): void {
    createSettingsSelect(select, options, preview);
}

export function createSettingsSelect(
    select: HTMLSelectElement | null,
    options: SelectOption[],
    preview?: (value: string) => void,
): void {
    if (!select || select.dataset.enhancedPicker === "true") return;

    const orderedOptions = orderOptionsForInitialSelection(options, select.value);

    select.dataset.enhancedPicker = "true";
    select.classList.add("native-hover-select");

    const picker = document.createElement("div");
    picker.className = "settings-picker";

    const button = document.createElement("button");
    button.className = "settings-picker-button";
    button.type = "button";
    button.setAttribute("aria-haspopup", "listbox");

    const menu = document.createElement("div");
    menu.className = "settings-picker-menu hidden";
    menu.setAttribute("role", "listbox");

    const syncButton = () => {
        button.textContent =
            orderedOptions.find((option) => option.value === select.value)?.label ||
            select.value;
        button.disabled = select.disabled;
        syncSelectedOption(select, menu);
    };

    const close = () => {
        menu.classList.add("hidden");
        button.setAttribute("aria-expanded", "false");
        preview?.(select.value);
    };

    const open = () => {
        closeOpenPickers();
        menu.classList.remove("hidden");
        button.setAttribute("aria-expanded", "true");
    };

    button.addEventListener("click", () => {
        if (menu.classList.contains("hidden")) open();
        else close();
    });

    if (preview) {
        menu.addEventListener("mouseleave", () => {
            preview(select.value);
        });
    }

    for (const option of orderedOptions) {
        const item = document.createElement("button");
        item.className = "settings-picker-option";
        item.type = "button";
        item.textContent = option.label;
        item.dataset.value = option.value;
        item.setAttribute("role", "option");

        if (preview) {
            item.addEventListener("mouseenter", () => {
                preview(option.value);
            });
        }

        item.addEventListener("click", () => {
            select.value = option.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            syncButton();
            close();
        });

        menu.append(item);
    }

    select.addEventListener("change", syncButton);
    document.addEventListener("click", (event) => {
        if (!picker.contains(event.target as Node)) close();
    });

    syncButton();
    picker.append(button, menu);
    select.after(picker);
}

export function closeSettingsPickers(): void {
    closeOpenPickers(true);
}

export function syncHoverPreviewSelect(select: HTMLSelectElement | null): void {
    const picker = select?.nextElementSibling as HTMLElement | null;
    const button = picker?.querySelector(
        ".settings-picker-button",
    ) as HTMLButtonElement | null;
    if (!select || !button) return;

    button.textContent =
        select.selectedOptions[0]?.textContent || select.value || "";
    button.disabled = select.disabled;
    const menu = picker?.querySelector(".settings-picker-menu") as HTMLElement | null;
    if (menu) syncSelectedOption(select, menu);
}

export function titleCase(value: string): string {
    return value
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export function orderOptionsForInitialSelection(
    options: SelectOption[],
    selectedValue: string,
): SelectOption[] {
    const selected = options.find((option) => option.value === selectedValue);
    const rest = options
        .filter((option) => option.value !== selectedValue)
        .sort((a, b) => a.label.localeCompare(b.label));

    return selected ? [selected, ...rest] : rest;
}

function preloadAsset(as: "style" | "image", href: string): void {
    if (document.querySelector(`link[rel="preload"][href="${href}"]`)) return;

    const link = document.createElement("link");
    link.rel = "preload";
    link.as = as;
    link.href = href;
    document.head.append(link);
}

function closeOpenPickers(resetPreview = false): void {
    for (const select of document.querySelectorAll<HTMLSelectElement>(
        "select.native-hover-select",
    )) {
        if (resetPreview) select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    for (const menu of document.querySelectorAll(".settings-picker-menu"))
        menu.classList.add("hidden");
    for (const button of document.querySelectorAll(".settings-picker-button"))
        button.setAttribute("aria-expanded", "false");
}

function syncSelectedOption(select: HTMLSelectElement, menu: HTMLElement): void {
    for (const option of menu.querySelectorAll(".settings-picker-option")) {
        const element = option as HTMLElement;
        const selected = element.dataset.value === select.value;
        element.classList.toggle("selected", selected);
        element.setAttribute("aria-selected", selected.toString());
    }
}
