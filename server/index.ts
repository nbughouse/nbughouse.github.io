import express from "express";
import { setupHandlers } from "./handlers";
import { randomBytes } from "node:crypto";
import http from "node:http";
import { Server, Socket } from "socket.io";
import { Player } from "../shared/player";
import type { Room } from "../shared/room";
import { RoomStatus, Team } from "../shared/room";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const server = http.createServer(app);
export const io = new Server(server);
export const rooms = new Map<string, Room>();
export const profiles = new Map<string, Profile>();
export const MENU_ROOM = "*";

export class GameSocket extends Socket {
	room: Room | undefined;
	player!: Player;
}

export interface Profile {
	name: string;
	id: string;
	auth: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.resolve(__dirname, "../public");

app.use(express.static(publicPath));

app.get("/games/:roomCode", (request, response) => {
	const roomCode = request.params.roomCode as string;
	if (!/^[A-Z0-9]{4}$/.test(roomCode))
		return response.status(404).send("Invalid room code format");
	response.sendFile("index.html", { root: publicPath });
});

io.on("connection", (socket: Socket) => {
	const gameSocket = socket as GameSocket;
	if (gameSocket.handshake.auth.playerID && gameSocket.handshake.auth.token) {
		const profile = profiles.get(gameSocket.handshake.auth.playerID);
		if (profile && profile.auth === gameSocket.handshake.auth.token) {
			gameSocket.player = new Player(
				gameSocket.handshake.auth.playerID,
				profile.name,
			);
			gameSocket.emit("sent-player", profile.name);
		} else {
			gameSocket.disconnect();
			return;
		}
	} else {
		const id = randomPlayerID();
		const auth = randomAuth();
		const player = new Player(id);
		gameSocket.player = player;
		profiles.set(id, { name: player.name, id, auth });
		gameSocket.emit("created-player", id, auth);
	}
	gameSocket.join(MENU_ROOM);
	setupHandlers(gameSocket);
	emitRoomList();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	const startTime = Date.now();
	console.log(
		`<< Started Server [${PORT}] on ${new Date().toLocaleString()} >>\n`,
	);

	function writeStatus() {
		const secondsAgo = Math.floor((Date.now() - startTime) / 1000);
		process.stdout.write(
			`\rUptime: ${secondsAgo}s | Rooms: ${rooms.size} | Players: ${profiles.size}   `,
		);
	}
	writeStatus();
	setInterval(writeStatus, 1000);
});

setInterval(() => {
	const currentTime = Date.now();
	for (const [code, room] of rooms) {
		if (room.status === RoomStatus.PLAYING) {
			room.game.updateTime(currentTime);
			const timeout = room.game.checkTimeout();
			if (timeout) {
				room.endRoom(timeout.team === Team.BLUE ? Team.RED : Team.BLUE);
				io.to(code).emit(
					"ended-room",
					timeout.team,
					timeout.player.name + " timed out.",
					currentTime,
				);
			}
		}
	}
}, 100);

function randomPlayerID(): string {
	return (
		Math.random().toString(36).slice(2, 15) +
		Math.random().toString(36).slice(2, 15)
	);
}

function randomAuth(): string {
	return randomBytes(32).toString("hex");
}

export function emitRoomList(): void {
	io.to(MENU_ROOM).emit(
		"listed-rooms",
		[...rooms.values()].map((room) => room.getRoomListing()),
	);
}
