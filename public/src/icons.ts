export function createIcon(name: "arrow-left" | "arrow-right" | "close"): HTMLSpanElement {
    const icon = document.createElement("span");
    icon.className = `ui-icon ui-icon-${name}`;
    icon.setAttribute("aria-hidden", "true");
    return icon;
}
