import type { Socket } from "socket.io-client";

type Listener = (...args: any[]) => void;

/** Gameplay can use a local authority without pretending to be a socket. */
export class GameConnection {
    private listeners = new Map<string, Listener[]>();
    private localCommand?: Listener;
    private disposeLocal?: () => void;
    get local(): boolean { return Boolean(this.localCommand); }

    constructor(private socket: Socket) {}

    on(event: string, listener: Listener): void {
        const listeners = this.listeners.get(event) ?? [];
        if (!this.listeners.has(event)) {
            this.listeners.set(event, listeners);
            this.socket.on(event, (...args: any[]) => {
                if (!this.local) this.publish(event, ...args);
            });
        }
        listeners.push(listener);
    }

    send(event: string, ...args: any[]): void {
        if (this.localCommand) {
            const handler = this.localCommand;
            // Match socket ordering: finish input/premove bookkeeping first.
            queueMicrotask(() => {
                if (handler === this.localCommand) handler(event, ...args);
            });
        } else this.socket.emit(event, ...args);
    }

    publish(event: string, ...args: any[]): void {
        for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }

    useLocal(command: Listener, dispose: () => void): void {
        this.closeLocal();
        this.localCommand = command;
        this.disposeLocal = dispose;
    }

    closeLocal(): void {
        this.localCommand = undefined;
        this.disposeLocal?.();
        this.disposeLocal = undefined;
    }
}
