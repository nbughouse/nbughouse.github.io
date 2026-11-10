import assert from "node:assert/strict";
import test from "node:test";
import type { Socket } from "socket.io-client";
import { GameConnection } from "../../public/src/game-connection";

test("local gameplay bypasses sockets, preserves input ordering and cancels pending commands on exit", async () => {
    const incoming = new Map<string, (...args: any[]) => void>();
    const sent: string[] = [];
    const connection = new GameConnection({
        on: (event: string, listener: (...args: any[]) => void) => incoming.set(event, listener),
        emit: (event: string) => sent.push(event),
    } as unknown as Socket);
    const events: string[] = [];
    connection.on("move", () => events.push("confirmed"));
    connection.useLocal(event => { events.push(event); connection.publish("move"); }, () => events.push("disposed"));
    connection.send("submit");
    events.push("input-finished");
    incoming.get("move")!();
    await Promise.resolve();
    assert.deepEqual(events, ["input-finished", "submit", "confirmed"]);
    assert.deepEqual(sent, []);
    connection.send("cancelled");
    connection.closeLocal();
    await Promise.resolve();
    assert.equal(events.includes("cancelled"), false);
    connection.send("online");
    assert.deepEqual(sent, ["online"]);
});
