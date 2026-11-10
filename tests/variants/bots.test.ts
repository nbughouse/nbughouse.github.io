import assert from "node:assert/strict";
import test from "node:test";
import { Chess, Color, PieceType, type Move } from "../../shared/src/chess";
import { BOT_SKILLS, assignBotRoomHuman, configureBotRoom, fillBotSeats, submitBotRoomMove, validBotOptions } from "../../shared/src/bots";
import { botFen, botLegalMoves } from "../../shared/src/bot-position";
import { Player, PlayerStatus } from "../../shared/src/player";
import { Room, Team } from "../../shared/src/room";

const e4: Move = { from: { loc: "board", row: 6, col: 4 }, to: { loc: "board", row: 4, col: 4 } };

for (const boards of [2, 3] as const) {
    test(`${boards}-board bot rooms start with one human and survive serialization`, () => {
        const room = new Room("BOTS", "host");
        configureBotRoom(room, { boards, level: 9 }, new Player("host"));
        assert.equal(room.players.size, boards + 1);
        assert.equal(room.game.matches[0].whitePlayer?.isBot, false);
        const copy = Room.deserialize(room.serialize());
        assert.equal(copy.kind, "bot");
        assert.equal(copy.botLevel, 9);
        assert.equal(copy.game.config.pocketShare, "none");
        assert.equal([...copy.players.values()].filter(player => player.isBot).length, boards);
        for (const match of copy.game.matches) {
            assert.equal(match.getPlayerTeam(Team.RED)?.id, "host");
            assert.equal(match.getPlayerTeam(Team.BLUE)?.isBot, true);
        }
        assert.equal(copy.tryStartRoom(1000), true);
        assert.ok(submitBotRoomMove(copy, "host", 0, Color.WHITE, e4, 1100)?.moved);
        assert.equal(copy.revision, 1);
    });
}

test("human assignments stay on one team through reassignment and resizing", () => {
    const room = new Room("BOTS", "host");
    configureBotRoom(room, { boards: 3, level: 5 }, new Player("host"));
    const friend = new Player("friend");
    room.addPlayer(friend);
    assert.equal(assignBotRoomHuman(room, friend.id, 1, Color.WHITE), false);
    assert.equal(assignBotRoomHuman(room, friend.id, 1, Color.BLACK), true);
    assert.equal(assignBotRoomHuman(room, friend.id, 2, Color.WHITE), true);
    assert.equal(room.game.matches[0].whitePlayer?.id, "host");
    assert.equal(room.game.matches[1].blackPlayer, friend);
    assert.equal(room.game.matches[2].whitePlayer, friend);
    assert.equal(assignBotRoomHuman(room, "bot:1:1", 0, Color.WHITE), false);
    room.updateConfig({ matchNum: 2 });
    fillBotSeats(room);
    room.updateConfig({ matchNum: 3 });
    fillBotSeats(room);
    for (const match of room.game.matches) {
        assert.equal(match.getPlayerTeam(Team.RED)?.isBot, false);
        assert.equal(match.getPlayerTeam(Team.BLUE)?.isBot, true);
    }
});

test("bot moves require the current host and exact room revision", () => {
    const room = new Room("BOTS", "host");
    configureBotRoom(room, { boards: 3, level: 5 }, new Player("host"));
    room.addPlayer(new Player("friend"));
    room.tryStartRoom(1000);
    assert.equal(submitBotRoomMove(room, "friend", 1, Color.WHITE, e4, 1100, 0), undefined);
    assert.equal(submitBotRoomMove(room, "host", 1, Color.WHITE, e4, 1100), undefined);
    assert.ok(submitBotRoomMove(room, "host", 1, Color.WHITE, e4, 1100, 0)?.moved);
    assert.equal(submitBotRoomMove(room, "host", 0, Color.WHITE, e4, 1200, 0), undefined);
    room.transferHost("friend");
    const e5: Move = { from: { loc: "board", row: 1, col: 4 }, to: { loc: "board", row: 3, col: 4 } };
    assert.ok(submitBotRoomMove(room, "host", 0, Color.WHITE, e4, 1200)?.moved);
    assert.equal(submitBotRoomMove(room, "host", 0, Color.BLACK, e5, 1300, 2), undefined);
    assert.ok(submitBotRoomMove(room, "friend", 0, Color.BLACK, e5, 1300, 2)?.moved);
});

test("computers cannot become host and vacated human seats stay human", () => {
    const room = new Room("BOTS", "host");
    configureBotRoom(room, { boards: 2, level: 1 }, new Player("host"));
    const friend = new Player("friend");
    room.addPlayer(friend);
    assert.equal(room.transferHost("bot:0:0"), false);
    room.removePlayer("host");
    fillBotSeats(room);
    assert.equal(room.hostID, "friend");
    assert.equal(room.game.matches[0].whitePlayer, friend);
    friend.status = PlayerStatus.DISCONNECTED;
    room.reassignHost();
    assert.equal(room.hostID, undefined);
});

test("FEN includes real pockets, promotion markers, en passant and castling rights", () => {
    const chess = new Chess();
    assert.equal(botFen(chess), "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1");
    chess.doMove(e4);
    chess.whitePocket.set(PieceType.KNIGHT, 2);
    chess.blackPocket.set(PieceType.PAWN, 1);
    chess.board[3][0] = { type: PieceType.PROMOTED_QUEEN, color: Color.WHITE };
    assert.match(botFen(chess), /Q~7/);
    assert.match(botFen(chess), /\[NNp\] b KQkq e3 0 1$/);
    assert.equal(botLegalMoves(new Chess(), {}).size, 20);
});

test("bot captures go to one teammate and drops use only that board's pocket", () => {
    const room = new Room("BOTS", "host");
    configureBotRoom(room, { boards: 3, level: 5 }, new Player("host"));
    room.tryStartRoom(1000);
    const play = (board: number, uci: string) => {
        const match = room.game.matches[board];
        const move = botLegalMoves(match.chess, room.game.getMoveRules()).get(uci)!;
        assert.ok(move, uci);
        assert.ok(submitBotRoomMove(room, "host", board, match.chess.turn, move, 1100 + room.revision,
            match.getPlayer(match.chess.turn)?.isBot ? room.revision : undefined)?.moved);
    };
    play(0, "e2e4"); play(0, "d7d5"); play(0, "e4d5");
    assert.equal(room.game.matches[1].chess.blackPocket.get(PieceType.PAWN), 1);
    assert.equal(room.game.matches[0].chess.whitePocket.get(PieceType.PAWN) ?? 0, 0);
    assert.equal(room.game.matches[2].chess.whitePocket.get(PieceType.PAWN) ?? 0, 0);
    room.game.matches[2].chess.whitePocket.set(PieceType.PAWN, 1);
    play(1, "e2e4");
    play(1, "P@e5");
    assert.equal(room.game.matches[1].chess.blackPocket.get(PieceType.PAWN) ?? 0, 0);
    assert.equal(room.game.matches[2].chess.whitePocket.get(PieceType.PAWN), 1);
    play(2, "P@e4");
    assert.equal(room.revision, 6);
});

test("nine presets and untrusted setup/move inputs are bounded", () => {
    assert.equal(new Set(BOT_SKILLS).size, 9);
    for (const input of [null, {}, { boards: 8, level: 1 }, { boards: 2, level: 0 }, { boards: 3, level: 1.5 }])
        assert.equal(validBotOptions(input), false);
    assert.equal(validBotOptions({ boards: 3, level: 9 }), true);
    const room = new Room("BOTS", "host");
    configureBotRoom(room, { boards: 2, level: 1 }, new Player("host"));
    room.tryStartRoom(1000);
    assert.equal(submitBotRoomMove(room, "host", 99, Color.WHITE, e4, 1100), undefined);
    assert.equal(submitBotRoomMove(room, "host", 0, Color.WHITE, null as unknown as Move, 1100), undefined);
    assert.equal(submitBotRoomMove(room, "host", 0, Color.WHITE, e4, 181001)?.end?.reason, "Time expired.");
    assert.equal(room.revision, 0);
});
