export interface ChatMessage {
    id: string;
    message: string;
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

    push(id: string, message: string): void {
        this.messages.push({ id, message });
        if (this.messages.length > 100) this.messages.shift();
    }
}
