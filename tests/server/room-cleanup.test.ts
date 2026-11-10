import assert from "node:assert/strict";
import test from "node:test";
import { Player, PlayerStatus } from "../../shared/src/player";
import { Room, RoomStatus } from "../../shared/src/room";
import { removeEmptyRooms, trackRoomPresence } from "../../server/src/room-cleanup";

test("an empty lobby stays open for 30 seconds after the last player leaves", () => {
    const room = new Room("TEST");
    const rooms = new Map([[room.code, room]]);
    room.addPlayer(new Player("host"));
    trackRoomPresence(room, 0);
    room.removePlayer("host");
    trackRoomPresence(room, 1_000);

    removeEmptyRooms(rooms, 30_999);
    assert.equal(rooms.has(room.code), true);
    removeEmptyRooms(rooms, 31_000);
    assert.equal(rooms.has(room.code), false);
});

test("returning cancels cleanup and the next departure starts a new grace period", () => {
    const room = new Room("TEST");
    const rooms = new Map([[room.code, room]]);
    trackRoomPresence(room, 0);
    room.addPlayer(new Player("host"));
    trackRoomPresence(room, 29_000);
    room.removePlayer("host");
    trackRoomPresence(room, 29_001);

    removeEmptyRooms(rooms, 30_000);
    assert.equal(rooms.has(room.code), true);
    removeEmptyRooms(rooms, 59_001);
    assert.equal(rooms.has(room.code), false);
});

test("active games close after everyone disconnects, even with retained players", () => {
    const room = new Room("TEST");
    const rooms = new Map([[room.code, room]]);
    const player = new Player("host");
    room.addPlayer(player);
    room.status = RoomStatus.PLAYING;
    trackRoomPresence(room, 0);
    player.status = PlayerStatus.DISCONNECTED;
    trackRoomPresence(room, 5_000);

    removeEmptyRooms(rooms, 34_999);
    assert.equal(rooms.has(room.code), true);
    removeEmptyRooms(rooms, 35_000);
    assert.equal(rooms.has(room.code), false);
});

test("a connected spectator keeps the room open", () => {
    const room = new Room("TEST");
    const rooms = new Map([[room.code, room]]);
    trackRoomPresence(room, 0);
    room.addPlayer(new Player("spectator", "", PlayerStatus.SPECTATING));

    removeEmptyRooms(rooms, 30_000);
    assert.equal(rooms.has(room.code), true);
    removeEmptyRooms(rooms, 60_000);
    assert.equal(rooms.has(room.code), true);
});

test("ending an empty game preserves the original cleanup deadline", () => {
    const room = new Room("TEST");
    const rooms = new Map([[room.code, room]]);
    room.addPlayer(new Player("host", "", PlayerStatus.DISCONNECTED));
    room.status = RoomStatus.PLAYING;
    trackRoomPresence(room, 0);
    room.endRoom();

    removeEmptyRooms(rooms, 29_999);
    assert.equal(rooms.has(room.code), true);
    removeEmptyRooms(rooms, 30_000);
    assert.equal(rooms.has(room.code), false);
});
