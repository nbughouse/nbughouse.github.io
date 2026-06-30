import type { RoomListing } from "@shared/room";
import { stopPingUpdates } from "./game-ui";
import { stopTimeUpdates } from "./match-ui";
import { sn } from "./session";
import { getBasePath } from "./app-paths";

// Store the pending action
let pendingAction: (() => void) | undefined;

export function initMenuControls(): void {
    const createGameButton = document.querySelector(
        "#create-game-btn",
    ) as HTMLButtonElement;
    const joinGameButton = document.querySelector(
        "#join-game-btn",
    ) as HTMLButtonElement;
    const playerNameInput = document.querySelector(
        "#player-name-input",
    ) as HTMLInputElement;

    // Handle create game button
    createGameButton.addEventListener("click", () => {
        if (
            checkAndPromptForName(() => {
                sn.socket.emit("create-room");
            })
        )
            sn.socket.emit("create-room");
    });

    // Handle join game button
    joinGameButton.addEventListener("click", () => {
        checkAndPromptForName(() => {
            showJoinModal();
        });
        if (playerNameInput.value.trim()) showJoinModal();
    });

    setupNameInput("player-name-input");

    const readyButton = document.querySelector("#ready-btn");
    readyButton?.addEventListener("click", () => {
        sn.socket.emit("toggle-ready");
    });

    const leaveRoomButton = document.querySelector("#leave-game-btn");
    leaveRoomButton?.addEventListener("click", () => {
        leaveRoom();
    });

    setupNameModal();
    setupJoinModal();
}

// Export this function so it can be used in other files
export function checkAndPromptForName(action: () => void): boolean {
    const nameInput = document.querySelector(
        "#player-name-input",
    ) as HTMLInputElement;
    const currentName = nameInput.value.trim() || sn.name.trim();

    if (!currentName) {
        pendingAction = action;
        showNameModal();
        return false;
    }

    if (!nameInput.value.trim()) nameInput.value = currentName;
    return true;
}

function setupNameModal(): void {
    const modal = document.querySelector("#name-modal") as HTMLDivElement;
    const closeButton = document.querySelector(
        "#close-modal",
    ) as HTMLButtonElement;
    const submitButton = document.querySelector(
        "#submit-name-btn",
    ) as HTMLButtonElement;
    const modalInput = document.querySelector(
        "#modal-name-input",
    ) as HTMLInputElement;

    closeButton.addEventListener("click", () => {
        pendingAction = undefined;
        hideNameModal();
    });

    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            pendingAction = undefined;
            hideNameModal();
        }
    });

    submitButton.addEventListener("click", () => {
        const name = modalInput.value.trim();
        if (name) {
            const mainInput = document.querySelector(
                "#player-name-input",
            ) as HTMLInputElement;

            mainInput.value = name;

            setPlayerName(name);
            hideNameModal();

            // Execute the pending action
            if (pendingAction) {
                pendingAction();
                pendingAction = undefined;
            }
        }
    });

    modalInput.addEventListener("keypress", (event: Event) => {
        const keyEvent = event as KeyboardEvent;
        if (keyEvent.key === "Enter") submitButton.click();
    });
}

function setupJoinModal(): void {
    const modal = document.querySelector("#join-modal") as HTMLDivElement;
    const closeButton = document.querySelector(
        "#close-join-modal",
    ) as HTMLButtonElement;
    const submitButton = document.querySelector(
        "#submit-join-btn",
    ) as HTMLButtonElement;
    const modalInput = document.querySelector(
        "#join-room-code-input",
    ) as HTMLInputElement;

    closeButton.addEventListener("click", () => {
        hideJoinModal();
    });

    modal.addEventListener("click", (event) => {
        if (event.target === modal) hideJoinModal();
    });

    submitButton.addEventListener("click", () => {
        const roomCode = modalInput.value.trim();
        if (roomCode.length === 4) {
            sn.socket.emit("join-room", roomCode);
            hideJoinModal();
        }
    });

    modalInput.addEventListener("keypress", (event: Event) => {
        const keyEvent = event as KeyboardEvent;
        if (keyEvent.key === "Enter") submitButton.click();
    });
}

function showNameModal(): void {
    const modal = document.querySelector("#name-modal");
    const modalInput = document.querySelector(
        "#modal-name-input",
    ) as HTMLInputElement;
    if (modal) {
        modal.classList.remove("hidden");
        modalInput.focus();
    }
}

function hideNameModal(): void {
    const modal = document.querySelector("#name-modal");
    const modalInput = document.querySelector(
        "#modal-name-input",
    ) as HTMLInputElement;
    const errorElement = document.querySelector("#modal-error");
    if (modal) {
        modal.classList.add("hidden");
        modalInput.value = "";
        if (errorElement) errorElement.textContent = "";
    }
}

function showJoinModal(): void {
    const modal = document.querySelector("#join-modal");
    const modalInput = document.querySelector(
        "#join-room-code-input",
    ) as HTMLInputElement;
    if (modal) {
        modal.classList.remove("hidden");
        modalInput.focus();
    }
}

function hideJoinModal(): void {
    const modal = document.querySelector("#join-modal");
    const modalInput = document.querySelector(
        "#join-room-code-input",
    ) as HTMLInputElement;
    const errorElement = document.querySelector("#join-modal-error");
    if (modal) {
        modal.classList.add("hidden");
        modalInput.value = "";
        if (errorElement) errorElement.textContent = "";
    }
}

function handleNameSubmit(event: Event): void {
    const target = event.target as HTMLInputElement;
    const name = target.value.trim();
    if (name) setPlayerName(name);
}

function setPlayerName(name: string): void {
    sn.name = name;
    if (sn.player) sn.player.name = name;
    sessionStorage.setItem("name", name);
    sn.socket.emit("set-name", name);
}

function setupNameInput(elementId: string) {
    const input = document.querySelector(`#${elementId}`);

    input?.addEventListener("keypress", (event: Event) => {
        const keyEvent = event as KeyboardEvent;
        if (keyEvent.key === "Enter") handleNameSubmit(event);
    });

    input?.addEventListener("blur", handleNameSubmit);
}

export function leaveRoom(): void {
    globalThis.history.replaceState({}, "", getBasePath());
    sn.socket.emit("leave-room");
    showMenuScreen();
}

export function showScreen(screenId: string): void {
    for (const screen of document.querySelectorAll(".screen"))
        screen.classList.add("hidden");

    const targetScreen = document.querySelector(`#${screenId}`);
    targetScreen?.classList.remove("hidden");
}

export function showMenuScreen(): void {
    showScreen("menu");
    clearErrors();
    const gameArea = document.querySelector("#game-area");
    if (gameArea) gameArea.innerHTML = "";
    sn.socket.emit("list-rooms");

    stopPingUpdates();
    stopTimeUpdates();
}

export function showError(elementId: string, message: string): void {
    const errorElement = document.querySelector(`#${elementId}`);
    if (errorElement) {
        errorElement.textContent = message;
        setTimeout(() => {
            errorElement.textContent = "";
        }, 5000);
    }
}

export function clearErrors(): void {
    for (const error of document.querySelectorAll(".error"))
        error.textContent = "";
}

export function updateLobbiesList(lobbies: RoomListing[]): void {
    const lobbiesContainer = document.querySelector("#lobbies-list");
    if (!lobbiesContainer) return;

    if (lobbies.length === 0) {
        lobbiesContainer.innerHTML = `
      <div class="no-lobbies">
        <p style="font-size: 20px; color: var(--hidden-text);">No Lobbies Found!</p>
        <p style="font-size: 14px; margin-top: 5px; color: var(--hidden-text);">Create a new room or wait for others to host!</p>
      </div>`;
        return;
    }

    lobbiesContainer.innerHTML = "";

    for (const lobby of lobbies) {
        const lobbyDiv = document.createElement("div");
        lobbyDiv.className = "lobby-item";
        lobbyDiv.innerHTML = `
      <div class="lobby-info">
        <div class="lobby-code">${lobby.code}</div>
        <div class="lobby-players">
          <span style="color: var(--red); font-weight: 700;">${lobby.numPlayers}</span>
        </div>
      </div>
      <button class="lobby-join-btn">Join</button>
    `;

        lobbyDiv.addEventListener("click", () => {
            if (
                checkAndPromptForName(() => {
                    sn.socket.emit("join-room", lobby.code);
                })
            )
                sn.socket.emit("join-room", lobby.code);
        });

        lobbiesContainer.append(lobbyDiv);
    }
}
