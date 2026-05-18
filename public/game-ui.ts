import type { ChatMessage } from "../shared/chat";
import { Color } from "../shared/chess";
import { PlayerStatus } from "../shared/player";
import {
	createMatchElements,
	setVisualFlipped,
	toggleVisualFlipped,
	updateUIAllGame,
} from "./match-ui";
import { leaveRoom } from "./menu-ui";
import { gs } from "./session";

let gridMode = false;

let pingIntervalID: number;
let pingStartTime: number = 0;

export function initGameControls(): void {
	const leaveGameButton = document.querySelector("#leave-game-btn");
	leaveGameButton?.addEventListener("click", () => {
		leaveRoom();
	});

	const gridToggleButton = document.querySelector("#grid-toggle-btn");
	gridToggleButton?.addEventListener("click", () => {
		toggleGridMode();
	});

	const chatInput = document.querySelector("#chat-input");
	chatInput?.addEventListener("keypress", (event: Event) => {
		const keyEvent = event as KeyboardEvent;
		if (keyEvent.key === "Enter") sendChatMessage();
	});

	// Prevent chat input from triggering keyboard shortcuts
	chatInput?.addEventListener("keydown", (event: Event) => {
		event.stopPropagation();
	});

	// Add resign button event listener
	const resignButton = document.querySelector("#resign-btn");
	resignButton?.addEventListener("click", () => {
		handleResign();
	});

	document.addEventListener("keydown", (event: Event) => {
		const keyEvent = event as KeyboardEvent;

		// Check if user is typing in an input or textarea
		const target = keyEvent.target as HTMLElement;
		if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

		if (keyEvent.key === "x") {
			toggleVisualFlipped();
			updateUIAllGame();
		}

		if (keyEvent.key === "g" || keyEvent.key === "G") toggleGridMode();

		// Navigate boards with arrow keys or A/D
		if (
			keyEvent.key === "ArrowLeft" ||
			keyEvent.key === "a" ||
			keyEvent.key === "A"
		) {
			keyEvent.preventDefault(); // Override default HTML behavior
			navigateBoards(-1);
		} else if (
			keyEvent.key === "ArrowRight" ||
			keyEvent.key === "d" ||
			keyEvent.key === "D"
		) {
			keyEvent.preventDefault(); // Override default HTML behavior
			navigateBoards(1);
		}
	});
}

// MARK: Resign Functionality

function handleResign(): void {
	if (confirm("Are you sure you want to resign? This will end the game."))
		gs.socket.emit("resign-room");
}

function isPlayerInGame(): boolean {
	// Check if current player is playing in any match
	for (const match of gs.room.game.matches) {
		const whitePlayer = match.getPlayer(Color.WHITE);
		const blackPlayer = match.getPlayer(Color.BLACK);

		if (
			whitePlayer?.id === gs.player.id ||
			blackPlayer?.id === gs.player.id
		)
			return true;
	}
	return false;
}

// MARK: Ping Indicator

function initPingIndicator(): void {
	gs.socket.on("pong", () => {
		const pingTime = Date.now() - pingStartTime;
		updatePingDisplay(pingTime);
	});

	startPingUpdates();
}

function updatePingDisplay(ping: number): void {
	const ranges = [
		{ max: 50, bars: 5, color: "var(--green)" },
		{ max: 100, bars: 4, color: "var(--green-yellow)" },
		{ max: 150, bars: 3, color: "var(--yellow)" },
		{ max: 250, bars: 2, color: "var(--yellow-red)" },
		{ max: Infinity, bars: 1, color: "var(--red)" },
	];

	const foundRange = ranges.find((r) => ping < r.max);
	if (!foundRange) return;

	const { bars: activeBars, color } = foundRange;

	// Update bar colors
	const bars = document.querySelectorAll(".ping-bar");
	for (const [index, bar] of bars.entries()) {
		const barElement = bar as HTMLElement;
		// We check from the bottom up (index < activeBars)
		if (index < activeBars) {
			barElement.style.backgroundColor = color;
			barElement.style.opacity = "1";
		} else {
			barElement.style.backgroundColor = "var(--background)";
			barElement.style.opacity = "0.3";
		}
	}
}

function sendPing(): void {
	pingStartTime = Date.now();
	gs.socket.emit("ping");
}

export function startPingUpdates(): void {
	stopPingUpdates();
	sendPing();
	pingIntervalID = globalThis.setInterval(() => {
		sendPing();
	}, 5000);
}

export function stopPingUpdates(): void {
	clearInterval(pingIntervalID);
}

// MARK: Audio

export function playAudio(source: string): void {
	const audio = new Audio("/audio/" + source);
	console.log(`Playing audio: ${source}`);
	audio.play().catch((error) => console.error("Audio play failed:", error));
}

// MARK: Sidebar UI

export function showRoomElements(): void {
	const gameScreen = document.querySelector("#game") as HTMLDivElement;
	for (const screen of document.querySelectorAll(".screen"))
		screen.classList.add("hidden");

	gameScreen.classList.remove("hidden");

	const gameRoomCode = document.querySelector(
		"#game-room-code",
	) as HTMLSpanElement;
	gameRoomCode.textContent = gs.room.code || "";

	const boardsArea = document.querySelector("#game-area") as HTMLDivElement;
	for (const container of boardsArea.querySelectorAll(".game-container"))
		container.remove();

	// Reset grid mode when creating room elements
	if (gridMode) {
		gridMode = false;
		const gameArea = document.querySelector("#game-area") as HTMLDivElement;
		gameArea.classList.remove("grid-mode");
		window.removeEventListener("resize", updateGridLayout);
		resetToFlexLayout();
	}

	for (let index = 0; index < gs.room.game.matches.length; index++)
		createMatchElements(index);

	const totalBoardsSpan = document.querySelector("#totalBoards");
	if (totalBoardsSpan)
		totalBoardsSpan.textContent = gs.room.game.matches.length.toString();

	initScrollControls();
	initPingIndicator();

	// Reset button icon to scroll view
	const gridToggleButton = document.querySelector(
		"#grid-toggle-btn",
	) as HTMLButtonElement;

	gridToggleButton.innerHTML = `
         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="18"></rect>
            <rect x="14" y="3" width="7" height="18"></rect>
         </svg>
      `;

	// Reset buttons to initial state (show ready, hide resign)
	resetGameButtons();
}

export function updateReadyButton(): void {
	const readyButton = document.querySelector(
		"#ready-btn",
	) as HTMLButtonElement;

	if (gs.player.status === PlayerStatus.READY) {
		readyButton.textContent = "Not Ready";
		readyButton.classList.add("ready");
	} else {
		readyButton.textContent = "Ready";
		readyButton.classList.remove("ready");
	}
}

function resetGameButtons(): void {
	const readyButton = document.querySelector(
		"#ready-btn",
	) as HTMLButtonElement;
	const resignButton = document.querySelector(
		"#resign-btn",
	) as HTMLButtonElement;

	readyButton.style.display = "block";
	resignButton.style.display = "none";
}

export function updateUIPlayerList(): void {
	const playerList = document.querySelector("#player-list");
	if (playerList) {
		playerList.innerHTML = "";
		for (const [id, player] of gs.room.players) {
			const playerDiv = document.createElement("div");
			playerDiv.className = "player-item";

			let statusIcon = "";
			let statusClass = "";

			switch (player.status) {
				case PlayerStatus.READY: {
					statusIcon = "✓";
					statusClass = "status-ready";
					break;
				}
				case PlayerStatus.NOT_READY: {
					statusIcon = "";
					statusClass = "status-not-ready";
					break;
				}
				case PlayerStatus.DISCONNECTED: {
					statusIcon = "⚠";
					statusClass = "status-disconnected";
					break;
				}
			}

			const isCurrentPlayer = id === gs.player.id;

			// // Show stats only if total > 0
			// const statsHTML =
			//    player.total > 0
			//       ? `<div class="player-stats" style="font-weight: bold; color: var(--hidden-text);">(${Math.floor(player.wins)}/${Math.floor(player.total)})</div>`
			//       : "";

			// playerDiv.innerHTML = `
			//    <span class="status-checkbox ${statusClass}">${statusIcon}</span>
			//    <div class="player-name" style="${
			//       isCurrentPlayer ? "font-weight: bold;" : ""
			//    }">${player.name}</div>
			//    ${statsHTML}
			// `;

			playerDiv.innerHTML = `
            <span class="status-checkbox ${statusClass}">${statusIcon}</span>
            <div class="player-name" style="${
				isCurrentPlayer ? "font-weight: bold;" : ""
			}">${player.name}</div>
         `;

			playerList.append(playerDiv);
		}
	}
}

// MARK: Chat UI

export function updateUIAllChat(): void {
	const chatMessagesDiv = document.querySelector("#chat-messages");
	if (!chatMessagesDiv) return;

	chatMessagesDiv.innerHTML = "";
	for (const message of gs.room.chat.messages) updateUIPushChat(message);
}

export function updateUIPushChat(message: ChatMessage): void {
	const chatMessagesDiv = document.querySelector("#chat-messages");
	if (!chatMessagesDiv) return;

	const getSenderName = () => {
		if (message.id === gs.player.id) return "You";
		if (message.id === "server") return "Server";
		return gs.room.players.get(message.id)?.name ?? "Unknown";
	};

	const messageDiv = document.createElement("div");
	messageDiv.className = `chat-message ${
		message.id === gs.player.id ? "own" : ""
	} ${message.id === "server" ? "server" : ""}`.trim();

	const senderName = getSenderName();

	messageDiv.innerHTML = `
      <div class="chat-sender">${senderName}</div>
      <div class="chat-text">${escapeHtml(message.message)}</div>
    `;
	chatMessagesDiv.append(messageDiv);
	chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

export function sendChatMessage(): void {
	const chatInput = document.querySelector("#chat-input") as HTMLInputElement;

	const message = chatInput.value.trim();
	if (message.length > 0) {
		gs.socket.emit("send-chat", message);
		chatInput.value = "";
	}
}

// MARK: Scrolling UI

function getBoardAreaDimensions(): { board: number; gap: number } {
	const gameArea = document.querySelector("#game-area") as HTMLElement;
	const boardArea = document.querySelector(".match-container") as HTMLElement;
	return {
		board: boardArea.clientWidth,
		gap: Number.parseFloat(getComputedStyle(gameArea).gap) || 0,
	};
}

function getTotalBoards(): number {
	return gs.room.game.matches.length || 1;
}

function scrollBoards(
	gameArea: HTMLDivElement,
	direction: number,
	updateScrollButtons: () => void,
): void {
	const { board, gap } = getBoardAreaDimensions();
	gameArea.scrollBy({
		left: direction * (board + gap),
		behavior: "smooth",
	});
	setTimeout(updateScrollButtons, 300);
}

function updateScrollButtons(): void {
	const gameArea = document.querySelector("#game-area") as HTMLDivElement;
	const leftButton = document.querySelector(
		"#scrollLeft",
	) as HTMLButtonElement;
	const rightButton = document.querySelector(
		"#scrollRight",
	) as HTMLButtonElement;

	const scrollLeft = gameArea.scrollLeft;
	const maxScroll = gameArea.scrollWidth - gameArea.clientWidth;
	leftButton.disabled = scrollLeft <= 1;
	rightButton.disabled = scrollLeft >= maxScroll - 1;

	const totalBoards = getTotalBoards();
	const { board, gap } = getBoardAreaDimensions();
	const leftBoard = Math.ceil((scrollLeft - gap) / (board + gap)) + 1;
	const rightBoard =
		totalBoards - Math.ceil((maxScroll - scrollLeft - gap) / (board + gap));

	const currentBoardSpan = document.querySelector(
		"#boardRange",
	) as HTMLSpanElement;
	const totalBoardsSpan = document.querySelector(
		"#totalBoards",
	) as HTMLSpanElement;

	if (gridMode) {
		currentBoardSpan.textContent = `[All]`;
	} else {
		if (leftBoard > rightBoard) currentBoardSpan.textContent = "_";
		else if (leftBoard === rightBoard)
			currentBoardSpan.textContent = `${leftBoard}`;
		else currentBoardSpan.textContent = `${leftBoard}-${rightBoard}`;
	}

	totalBoardsSpan.textContent = totalBoards.toString();
}

// Navigate boards with keyboard
function navigateBoards(direction: number): void {
	const gameArea = document.querySelector("#game-area") as HTMLDivElement;

	scrollBoards(gameArea, direction, updateScrollButtons);
}

export function initScrollControls(): void {
	const gameArea = document.querySelector("#game-area") as HTMLDivElement;
	const leftButton = document.querySelector(
		"#scrollLeft",
	) as HTMLButtonElement;
	const rightButton = document.querySelector(
		"#scrollRight",
	) as HTMLButtonElement;

	leftButton.addEventListener("click", () =>
		scrollBoards(gameArea, -1, updateScrollButtons),
	);
	rightButton.addEventListener("click", () =>
		scrollBoards(gameArea, 1, updateScrollButtons),
	);
	gameArea.addEventListener("scroll", updateScrollButtons);

	updateScrollButtons();
}

// MARK: Grid Mode UI

export function toggleGridMode(): void {
	gridMode = !gridMode;
	const gameArea = document.querySelector("#game-area") as HTMLDivElement;
	const gridToggleButton = document.querySelector(
		"#grid-toggle-btn",
	) as HTMLButtonElement;

	if (gridMode) {
		gameArea.classList.add("grid-mode");
		gridToggleButton.innerHTML = `
         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
         </svg>
      `;

		updateGridLayout();
		window.addEventListener("resize", updateGridLayout);
	} else {
		gameArea.classList.remove("grid-mode");
		gridToggleButton.innerHTML = `
         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="18"></rect>
            <rect x="14" y="3" width="7" height="18"></rect>
         </svg>
      `;

		window.removeEventListener("resize", updateGridLayout);
		resetToFlexLayout();
	}
	updateScrollButtons();
}

function updateGridLayout(): void {
	if (!gridMode) return;

	const gameArea = document.querySelector("#game-area") as HTMLDivElement;
	const matches = gameArea.querySelectorAll(".match-container");
	const boardCount = matches.length;
	if (boardCount === 0) return;

	// Margin/Padding offset
	const winW = gameArea.clientWidth - 40;
	const winH = gameArea.clientHeight - 40;

	// Match Aspect Ratio: Width (8 squares) / Height (10 squares) = 0.8
	const ratio = 0.8;

	let bestW = 0;
	let bestCols = 1;

	for (let cols = 1; cols <= boardCount; cols++) {
		const rows = Math.ceil(boardCount / cols);
		let w = winW / cols;
		// Check if height exceeds available space
		if (w * (1 / ratio) * rows > winH) w = (winH / rows) * ratio;

		if (w > bestW) {
			bestW = w;
			bestCols = cols;
		}
	}

	gameArea.style.gridTemplateColumns = `repeat(${bestCols}, auto)`;

	for (const match of matches) {
		const m = match as HTMLElement;
		// Apply the calculated width, height follows aspect ratio
		m.style.width = `${bestW - 10}px`;
		m.style.height = `${(bestW - 10) * (1 / ratio)}px`;
		m.style.setProperty("--square-size", `${(bestW - 10) / 8}px`);
	}
}

function resetToFlexLayout(): void {
	const gameArea = document.querySelector("#game-area") as HTMLDivElement;
	const matches = gameArea.querySelectorAll(".match-container");

	gameArea.style.gridTemplateColumns = "";
	for (const match of matches) {
		const m = match as HTMLElement;
		m.style.width = "";
		m.style.height = "";
		m.style.removeProperty("--square-size");
	}
}

// MARK: Start/End Game UI

export function startGameUI(): void {
	const readyButton = document.querySelector(
		"#ready-btn",
	) as HTMLButtonElement;
	const resignButton = document.querySelector(
		"#resign-btn",
	) as HTMLButtonElement;

	// Show resign button only if player is in the game
	if (isPlayerInGame()) {
		readyButton.style.display = "none";
		resignButton.style.display = "block";
	} else {
		readyButton.style.display = "none";
		resignButton.style.display = "none";
	}

	// Put current player on bottom
	let topBottomDelta = 0; // # of this player on top - # on bottom
	for (const match of gs.room.game.matches) {
		const playerIsTop =
			match.getPlayer(match.flipped ? Color.WHITE : Color.BLACK)?.id ===
			gs.player.id;
		const playerIsBottom =
			match.getPlayer(match.flipped ? Color.BLACK : Color.WHITE)?.id ===
			gs.player.id;

		topBottomDelta += (playerIsTop ? 1 : 0) - (playerIsBottom ? 1 : 0);
	}

	// If more boards have this player on top than bottom, flip all boards
	setVisualFlipped(topBottomDelta > 0);
	updateUIAllGame();
	initScrollControls();
}

export function endGameUI(): void {
	const readyButton = document.querySelector(
		"#ready-btn",
	) as HTMLButtonElement;
	const resignButton = document.querySelector(
		"#resign-btn",
	) as HTMLButtonElement;

	readyButton.style.display = "block";
	resignButton.style.display = "none";

	updateUIAllGame();
	updateUIPlayerList();
}

function escapeHtml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}
