export type ChatBadge = "winner" | "spectating" | "disconnected";
export const CHAT_MESSAGE_MAX_LENGTH = 200;
const CHAT_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export interface ChatMessage {
    id: string;
    message: string;
    isAllChat?: boolean;
    color?: string;
    opacity?: number;
    badges?: ChatBadge[];
}

export class Chat {
    messages: ChatMessage[];

    constructor() {
        this.messages = [];
    }

    serialize(): string {
        return JSON.stringify({
            messages: this.messages,
        });
    }

    static deserialize(json: string): Chat {
        const chat = new Chat();
        const data: { messages: ChatMessage[] } = JSON.parse(json);
        if (!Array.isArray(data.messages)) return chat;

        for (const message of data.messages) {
            if (!message || typeof message.id !== "string") continue;
            if (typeof message.message !== "string") continue;

            chat.push(
                message.id,
                message.message,
                typeof message.color === "string" ? message.color : undefined,
                typeof message.opacity === "number" ? message.opacity : undefined,
                Array.isArray(message.badges) ? message.badges : undefined,
                message.isAllChat === true,
            );
        }
        return chat;
    }

    push(
        id: string,
        message: string,
        color?: string,
        opacity?: number,
        badges?: ChatBadge[],
        isAllChat?: boolean,
    ): ChatMessage {
        const chatMessage = {
            id,
            message: sanitizeChatMessage(message),
            color,
            opacity,
            badges: sanitizeChatBadges(badges),
            isAllChat: isAllChat === true,
        };
        this.messages.push(chatMessage);
        if (this.messages.length > 100) this.messages.shift();
        return chatMessage;
    }
}

export function sanitizeChatMessage(message: string): string {
    return message
        .replace(CHAT_CONTROL_CHARACTERS, "")
        .trim()
        .slice(0, CHAT_MESSAGE_MAX_LENGTH);
}

function sanitizeChatBadges(
    badges: ChatBadge[] | undefined,
): ChatBadge[] | undefined {
    if (!badges) return undefined;

    return badges.filter(
        (badge): badge is ChatBadge =>
            badge === "winner" ||
            badge === "spectating" ||
            badge === "disconnected",
    );
}
