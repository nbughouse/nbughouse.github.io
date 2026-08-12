export type ChatBadge = "winner" | "spectating" | "disconnected";

export interface ChatMessage {
    id: string;
    message: string;
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
        chat.messages = data.messages;
        return chat;
    }

    push(
        id: string,
        message: string,
        color?: string,
        opacity?: number,
        badges?: ChatBadge[],
    ): ChatMessage {
        const chatMessage = { id, message, color, opacity, badges };
        this.messages.push(chatMessage);
        if (this.messages.length > 100) this.messages.shift();
        return chatMessage;
    }
}
