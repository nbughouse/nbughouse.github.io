import { sanitizeChatMessage, type ChatBadge, type ChatMessage } from "@shared/chat";
import { getPlayerDisplayName } from "@shared/player";
import { RoomStatus } from "@shared/room";
import { getAssetPath } from "./app-paths";
import { gs } from "./session";
import { getPlayerRelationshipClass, getPlayerTeam } from "./sidebar-ui";

export function initChatControls(): void {
    const chatInput = document.querySelector("#chat-input");
    chatInput?.addEventListener("keypress", (event: Event) => {
        if ((event as KeyboardEvent).key === "Enter") sendChatMessage();
    });
    chatInput?.addEventListener("keydown", (event: Event) =>
        event.stopPropagation(),
    );
}

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

export function sendChatMessage(): void {
    const chatInput = document.querySelector("#chat-input") as HTMLInputElement;

    const message = sanitizeChatMessage(chatInput.value);
    if (message.length > 0) {
        gs.socket.emit("send-chat", message);
        chatInput.value = "";
    }
}
