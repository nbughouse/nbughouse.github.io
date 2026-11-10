import assert from "node:assert/strict";
import test from "node:test";
import { Color } from "../../shared/src/chess";
import { Player, PlayerStatus } from "../../shared/src/player";
import { Room, RoomStatus } from "../../shared/src/room";
import { setupHandlers } from "../../server/src/handlers";
import { type GameSocket, io, rooms } from "../../server/src/state";

type Event = { name: string; args: unknown[] };

function socketFor(room: Room, player: Player, broadcasts: Event[]) {
    const handlers = new Map<string, (...args: any[]) => void>();
    const received: Event[] = [];
    const socket = {
        id: player.id,
        room: room as Room | undefined,
        player,
        on: (name: string, handler: (...args: any[]) => void) => handlers.set(name, handler),
        emit: (name: string, ...args: unknown[]) => received.push({ name, args }),
        to: () => ({ emit: (name: string, ...args: unknown[]) => broadcasts.push({ name, args }) }),
        join: () => {},
        leave: () => {},
    };
    setupHandlers(socket as unknown as GameSocket);
    return { socket, received, trigger: (name: string, ...args: unknown[]) => handlers.get(name)!(...args) };
}

for (const status of [RoomStatus.LOBBY, RoomStatus.PLAYING]) {
    for (const departure of ["leave-room", "disconnect"]) {
        for (const seated of status === RoomStatus.PLAYING ? [false, true] : [false]) {
            test(`${departure} transfers host and broadcasts it in ${status}, seated=${seated}`, (t) => {
                const broadcasts: Event[] = [];
                t.mock.method(io, "to", () => ({
                    emit: (name: string, ...args: unknown[]) => broadcasts.push({ name, args }),
                }));
                const room = new Room("TEST");
                const host = new Player("host", "Host");
                const disconnected = new Player("offline", "Offline", PlayerStatus.DISCONNECTED);
                const next = new Player("next", "Next", PlayerStatus.SPECTATING);
                room.addPlayer(host);
                room.addPlayer(disconnected);
                room.addPlayer(next);
                room.status = status;
                if (seated) room.game.matches[0].setPlayer(host, Color.WHITE);
                const client = Room.deserialize(room.serialize());
                const connection = socketFor(room, host, broadcasts);

                connection.trigger(departure);

                assert.equal(room.hostID, next.id);
                assert.equal(connection.socket.room, undefined);
                const updates = broadcasts.filter((event) => event.name === "room-host-updated");
                assert.deepEqual(updates, [{ name: "room-host-updated", args: [next.id] }]);
                // Replay the membership and host events in wire order on a remaining client.
                for (const event of broadcasts) {
                    if (event.name === "p-left-room") client.removePlayer(event.args[0] as string);
                    if (event.name === "room-host-updated") client.hostID = event.args[0] as string;
                }
                assert.equal(client.hostID, next.id);
                if (seated) {
                    assert.equal(host.status, PlayerStatus.DISCONNECTED);
                    assert.equal(room.game.matches[0].whitePlayer, host);
                }
                assert.ok(broadcasts.some((event) => event.name === "p-sent-chat" && event.args[1] === "Next is now the host."));
            });
        }
    }
}

test("a returning seated host does not take host back from the successor", (t) => {
    t.mock.method(io, "to", () => ({ emit: () => {} }));
    const room = new Room("TEST");
    t.after(() => rooms.delete(room.code));
    rooms.set(room.code, room);
    const host = new Player("host", "Host");
    const next = new Player("next", "Next");
    room.addPlayer(host);
    room.addPlayer(next);
    room.status = RoomStatus.PLAYING;
    room.game.matches[0].setPlayer(host, Color.WHITE);
    const connection = socketFor(room, host, []);
    connection.trigger("disconnect");
    connection.trigger("join-room", room.code);
    assert.equal(room.hostID, next.id);
    assert.equal(host.status, PlayerStatus.CONNECTED);
    assert.equal((connection.received.find((event) => event.name === "joined-room")!.args[0] as { hostID: string }).hostID, next.id);
});

test("the first returning player becomes host after everyone disconnects", (t) => {
    const broadcasts: Event[] = [];
    t.mock.method(io, "to", () => ({
        emit: (name: string, ...args: unknown[]) => broadcasts.push({ name, args }),
    }));
    const room = new Room("TEST");
    t.after(() => rooms.delete(room.code));
    rooms.set(room.code, room);
    const host = new Player("host", "Host");
    room.addPlayer(host);
    room.status = RoomStatus.PLAYING;
    room.game.matches[0].setPlayer(host, Color.WHITE);
    const connection = socketFor(room, host, broadcasts);
    connection.trigger("disconnect");
    assert.equal(room.hostID, undefined);
    broadcasts.length = 0;
    connection.trigger("join-room", room.code);
    assert.equal(room.hostID, host.id);
    assert.ok(broadcasts.some((event) => event.name === "room-host-updated" && event.args[0] === host.id));
});
