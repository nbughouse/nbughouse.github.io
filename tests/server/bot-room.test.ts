import assert from "node:assert/strict";
import test from "node:test";
import { Color } from "../../shared/src/chess";
import { configureBotRoom } from "../../shared/src/bots";
import { Player, PlayerStatus } from "../../shared/src/player";
import { Room, RoomStatus } from "../../shared/src/room";
import { setupHandlers } from "../../server/src/handlers";
import { type GameSocket, io, rooms } from "../../server/src/state";
import { removeEmptyRooms, trackRoomPresence } from "../../server/src/room-cleanup";

function connection(room: Room, player: Player) {
    const handlers = new Map<string, (...args: any[]) => void>();
    const received: { event: string; args: any[] }[] = [];
    const socket = {
        id: player.id, room: room as Room | undefined, player,
        on: (event: string, handler: (...args: any[]) => void) => handlers.set(event, handler),
        emit: (event: string, ...args: any[]) => received.push({ event, args }),
        to: () => ({ emit: (event: string, ...args: any[]) => received.push({ event, args }) }), join: () => {}, leave: () => {},
    };
    setupHandlers(socket as unknown as GameSocket);
    return { socket, received, trigger: (event: string, ...args: any[]) => handlers.get(event)!(...args) };
}

test("friends can take human seats, and host changes revoke engine authority", t => {
    const broadcasts: string[] = [];
    t.mock.method(io, "to", () => ({ emit: (event: string) => broadcasts.push(event) }));
    const host = new Player("host");
    const friend = new Player("friend");
    const room = new Room("BOTS", host.id);
    configureBotRoom(room, { boards: 3, level: 5 }, host);
    room.addPlayer(friend);
    const hostConnection = connection(room, host);
    const friendConnection = connection(room, friend);
    friendConnection.trigger("join-board", 1, Color.BLACK);
    assert.equal(room.game.matches[1].blackPlayer, friend);
    assert.equal(room.players.size, 5);
    friendConnection.trigger("start-room");
    assert.equal(room.status, RoomStatus.LOBBY);
    hostConnection.trigger("update-room-settings", { initialBoard: "duck", matchNum: 8 });
    assert.equal(room.game.config.initialBoard, "default");
    assert.equal(room.game.matches.length, 3);
    friendConnection.trigger("update-bot-settings", { matchNum: 2, timeBase: 60 }, 1);
    assert.equal(room.botLevel, 5);
    hostConnection.trigger("update-bot-settings", { matchNum: 3, timeBase: 300, initialBoard: "duck" }, 9, 8);
    assert.equal(room.botLevel, 9);
    assert.equal(room.botSpeed, 8);
    assert.equal(room.game.config.timeBase, 300);
    assert.equal(room.game.config.initialBoard, "default");
    assert.ok(broadcasts.includes("bot-room-updated"));
    hostConnection.trigger("start-room");
    assert.equal(room.status, RoomStatus.PLAYING);
    const move = { from: { loc: "board", row: 6, col: 4 }, to: { loc: "board", row: 4, col: 4 } };
    friendConnection.trigger("bot-move", 2, Color.WHITE, move, 0);
    assert.equal(room.revision, 0);
    hostConnection.trigger("move-board", 2, Color.WHITE, move);
    assert.equal(room.revision, 1);
    hostConnection.trigger("disconnect");
    assert.equal(room.hostID, friend.id);
    hostConnection.trigger("bot-move", 1, Color.WHITE, move, 1);
    assert.equal(room.revision, 1);
    friendConnection.trigger("bot-move", 1, Color.WHITE, move, 0);
    assert.equal(room.revision, 1);
    friendConnection.trigger("bot-move", 1, Color.WHITE, move, 1);
    assert.equal(room.revision, 2);
    assert.ok(hostConnection.received.some(entry => entry.event === "room-host-updated"));
    assert.ok(broadcasts.includes("p-moved-board"));
});

test("host can drag humans between human seats but nobody can take bot seats", t => {
    t.mock.method(io, "to", () => ({ emit: () => {} }));
    const host = new Player("host");
    const friend = new Player("friend");
    const room = new Room("BOTS", host.id);
    configureBotRoom(room, { boards: 3, level: 5 }, host);
    room.addPlayer(friend);
    const h = connection(room, host);
    const f = connection(room, friend);
    f.trigger("assign-player-board", friend.id, 1, Color.BLACK);
    assert.equal(room.game.matches[1].blackPlayer, host);
    h.trigger("assign-player-board", friend.id, 1, Color.WHITE);
    f.trigger("join-board", 0, Color.BLACK);
    assert.equal(room.game.matches[1].whitePlayer?.isBot, true);
    assert.equal(room.game.matches[0].blackPlayer?.isBot, true);
    h.trigger("assign-player-board", friend.id, 1, Color.BLACK);
    h.trigger("assign-player-board", friend.id, 2, Color.WHITE);
    assert.equal(room.game.matches[1].blackPlayer, friend);
    assert.equal(room.game.matches[2].whitePlayer, friend);
    assert.equal(room.game.matches[0].whitePlayer, host);
});

test("create-bot-room validates setup and returns a distinct bot room", t => {
    t.mock.method(io, "to", () => ({ emit: () => {} }));
    const host = new Player("host");
    const c = connection(new Room("OLD", host.id), host);
    c.socket.room = undefined;
    const before = rooms.size;
    c.trigger("create-bot-room", { boards: 8, level: 10 });
    assert.equal(rooms.size, before);
    let acknowledged: Room | undefined;
    c.trigger("create-bot-room", { boards: 2, level: 9, timeBase: 300 }, (raw: any) => {
        acknowledged = Room.deserialize(raw);
    });
    const room = c.socket.room!;
    t.after(() => rooms.delete(room.code));
    assert.equal(room.kind, "bot");
    assert.equal(room.botLevel, 9);
    assert.equal(acknowledged?.game.config.timeBase, 300);
    assert.equal(room.players.size, 3);
    assert.equal(c.received.find(entry => entry.event === "joined-room")?.args[0].kind, "bot");
});

test("bot-only rooms expire after their last human disconnects", () => {
    const host = new Player("host");
    const room = new Room("BOTS", host.id);
    configureBotRoom(room, { boards: 3, level: 5 }, host);
    const rooms = new Map([[room.code, room]]);
    host.status = PlayerStatus.DISCONNECTED;
    trackRoomPresence(room, 1000);
    removeEmptyRooms(rooms, 30999);
    assert.equal(rooms.size, 1);
    removeEmptyRooms(rooms, 31000);
    assert.equal(rooms.size, 0);
});
