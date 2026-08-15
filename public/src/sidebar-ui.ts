import { Color } from "@shared/chess";
import {
    getPlayerDisplayName,
    type Player,
    PlayerStatus,
} from "@shared/player";
import { RoomStatus, Team } from "@shared/room";
import { getAssetPath, getRoomPath } from "./app-paths";
import { isLatestWinner } from "./match-ui";
import { leaveRoom } from "./menu-ui";
import {
    initRoomSettingsUI,
    setMoreRoomSettingsOpen,
    setRoomVariantsOpen,
    updateRoomSettingsUI,
} from "./room-settings-ui";
import { gs } from "./session";

let pingIntervalID: number;
let pingStartTime = 0;

export function initSidebarControls(): void {
    initSidebarTabs();
    initRoomSettingsUI();

    document
        .querySelector("#leave-game-btn")
        ?.addEventListener("click", leaveRoom);
    document
        .querySelector("#game-room-code")
        ?.addEventListener("click", copyRoomLink);
    document
        .querySelector("#resign-btn")
        ?.addEventListener("click", handleResign);
}

function initSidebarTabs(): void {
    const sidebarTabs = document.querySelector("#sidebar-tabs");
    const playersTabButton = document.querySelector("#players-tab-btn");
    const settingsTabButton = document.querySelector("#settings-tab-btn");
    const playersPanel = document.querySelector("#players-tab-panel");
    const settingsPanel = document.querySelector("#settings-tab-panel");
    const chatSection = document.querySelector("#chat-section");

    playersTabButton?.addEventListener("click", () => {
        sidebarTabs?.classList.remove("settings-active");
        playersTabButton.classList.add("active");
        settingsTabButton?.classList.remove("active");
        playersPanel?.classList.remove("hidden");
        settingsPanel?.classList.add("hidden");
        setMoreRoomSettingsOpen(false);
        setRoomVariantsOpen(false);
        chatSection?.classList.remove("hidden");
    });

    settingsTabButton?.addEventListener("click", () => {
        sidebarTabs?.classList.add("settings-active");
        settingsTabButton.classList.add("active");
        playersTabButton?.classList.remove("active");
        settingsPanel?.classList.remove("hidden");
        playersPanel?.classList.add("hidden");
        setMoreRoomSettingsOpen(false);
        setRoomVariantsOpen(false);
        updateRoomSettingsUI();
    });
}

// MARK: Resign Functionality

function handleResign(): void {
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
    const pingIndicator = document.querySelector("#ping-indicator") as HTMLElement;
    const pingLabel = `Ping: ${Math.round(ping)} ms`;
    pingIndicator.title = pingLabel;
    pingIndicator.setAttribute("aria-label", pingLabel);

    const ranges = [
        { max: 50, bars: 4, color: "var(--green)" },
        { max: 100, bars: 3, color: "var(--green-yellow)" },
        { max: 150, bars: 2, color: "var(--yellow)" },
        { max: 250, bars: 1, color: "var(--yellow-red)" },
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

export function showSidebarRoomElements(): void {
    const gameRoomCode = document.querySelector("#game-room-code") as HTMLButtonElement;
    gameRoomCode.textContent = gs.room.code || "";

    showPlayersTab();
    updateRoomSettingsUI();
    initPingIndicator();
    resetGameButtons();
}

function copyRoomLink(): void {
    if (!gs.room?.code) return;

    const roomURL = new URL(
        getRoomPath(gs.room.code),
        globalThis.location.origin,
    ).href;

    if (globalThis.navigator.clipboard) {
        void globalThis.navigator.clipboard.writeText(roomURL);
        return;
    }

    const input = document.createElement("input");
    input.value = roomURL;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
}

function showPlayersTab(): void {
    const sidebarTabs = document.querySelector("#sidebar-tabs");
    const playersTabButton = document.querySelector("#players-tab-btn");
    const settingsTabButton = document.querySelector("#settings-tab-btn");
    const playersPanel = document.querySelector("#players-tab-panel");
    const settingsPanel = document.querySelector("#settings-tab-panel");
    const chatSection = document.querySelector("#chat-section");

    sidebarTabs?.classList.remove("settings-active");
    playersTabButton?.classList.add("active");
    settingsTabButton?.classList.remove("active");
    playersPanel?.classList.remove("hidden");
    settingsPanel?.classList.add("hidden");
    setMoreRoomSettingsOpen(false);
    chatSection?.classList.remove("hidden");
}

export function updateStartButton(): void {
    const readyButton = document.querySelector(
        "#ready-btn",
    ) as HTMLButtonElement;
    const spectatorButton = document.querySelector(
        "#spectator-btn",
    ) as HTMLButtonElement;
    const spectatorButtonIcon = document.querySelector(
        "#spectator-btn-icon",
    ) as HTMLImageElement;

    const isPlaying = gs.room?.status === RoomStatus.PLAYING;
    const isCurrentPlayerPlaying = isPlayerInGame();
    const isHost =
        gs.room?.status === RoomStatus.LOBBY && gs.room.hostID === gs.player.id;
    const isLobby = gs.room?.status === RoomStatus.LOBBY;
    const isSpectating =
        gs.room?.getPlayer(gs.player.id)?.status === PlayerStatus.SPECTATING;
    const playerCount = [...(gs.room?.players.values() ?? [])].filter(
        (player) => player.status === PlayerStatus.CONNECTED,
    ).length;
    const isWaitingForPlayers = playerCount <= 1;

    if (isPlaying) {
        readyButton.textContent = "Waiting for next round...";
        readyButton.disabled = true;
        readyButton.classList.add("waiting");
    } else if (isHost && isWaitingForPlayers) {
        readyButton.textContent = "Waiting for people...";
        readyButton.disabled = true;
        readyButton.classList.add("waiting");
    } else if (isHost) {
        readyButton.textContent = "Start";
        readyButton.disabled = false;
        readyButton.classList.remove("waiting");
    } else {
        readyButton.textContent = "Waiting for start...";
        readyButton.disabled = true;
        readyButton.classList.add("waiting");
    }

    spectatorButton.hidden = !isLobby && !(isPlaying && !isCurrentPlayerPlaying);
    const spectatorLabel = isPlaying
        ? isSpectating
            ? "Play next round"
            : "Spectate next round"
        : isSpectating
          ? "Return to game"
          : "Spectate";
    spectatorButton.setAttribute("aria-label", spectatorLabel);
    spectatorButton.title = spectatorLabel;
    spectatorButton.classList.toggle("is-spectating", isSpectating);
    spectatorButtonIcon.src = getAssetPath(
        isSpectating ? "img/pawn.svg" : "img/eye.svg",
    );

    updateRoomSettingsUI();
}

function resetGameButtons(): void {
    const lobbyActionRow = document.querySelector(
        "#lobby-action-row",
    ) as HTMLElement;

    lobbyActionRow.style.display = "flex";
    const resignButton = document.querySelector(
        "#resign-btn",
    ) as HTMLButtonElement;

    resignButton.style.display = "none";
    updateStartButton();
}

export function updateUIPlayerList(): void {
    const playerList = document.querySelector("#player-list");
    if (playerList) {
        const previousPlayerTops = new Map(
            [...playerList.querySelectorAll<HTMLElement>(".player-item")].map(
                (playerItem) => [
                    playerItem.dataset.playerId,
                    playerItem.getBoundingClientRect().top,
                ],
            ),
        );
        playerList.innerHTML = "";
        const playersByScore = [...gs.room.players].sort(
            ([, playerA], [, playerB]) =>
                comparePlayersByScore(playerA, playerB),
        );
        for (const [id, player] of playersByScore) {
            const playerDiv = document.createElement("div");
            const nameDiv = document.createElement("div");
            const statsDiv = document.createElement("div");
            const scoreText = document.createElement("span");
            const isDisplayedAsSpectator = isPlayerDisplayedAsInactive(
                id,
                player,
            );
            const isTrueSpectator = isPlayerDisplayedAsSpectator(id, player);
            const statusClasses = [
                player.status === PlayerStatus.DISCONNECTED
                    ? "status-disconnected"
                    : "",
                isDisplayedAsSpectator ? "status-spectating" : "",
            ].filter(Boolean);

            const isCurrentPlayer = id === gs.player.id;

            const relationshipClass = isCurrentPlayer
                ? "own"
                : getPlayerRelationshipClass(id);
            playerDiv.className =
                `player-item ${statusClasses.join(" ")} ${relationshipClass}`.trim();
            playerDiv.dataset.playerId = id;
            nameDiv.className = "player-name";
            nameDiv.textContent = getPlayerDisplayName(player);
            if (id === gs.room.hostID) {
                const hostBadge = document.createElement("span");
                hostBadge.className = "host-badge";
                hostBadge.textContent = " (Host)";
                nameDiv.append(hostBadge);
            }
            if (isCurrentPlayer)
                nameDiv.style.fontWeight = "var(--font-weight-bold)";
            statsDiv.className = "player-stats";
            if (isLatestWinner(id)) {
                const crown = document.createElement("img");
                crown.className = "winner-crown";
                crown.src = getAssetPath("img/crown.svg");
                crown.alt = "Winner";
                statsDiv.append(crown);
            }
            scoreText.textContent = `${player.wins}/${player.total}`;
            statsDiv.append(scoreText);

            if (isTrueSpectator) {
                const spectatingIcon = document.createElement("img");
                spectatingIcon.className = "spectating-icon";
                spectatingIcon.src = getAssetPath("img/eye.svg");
                spectatingIcon.alt = "";
                spectatingIcon.setAttribute("aria-hidden", "true");
                playerDiv.append(spectatingIcon);
            }
            if (player.status === PlayerStatus.DISCONNECTED) {
                const disconnectedIcon = document.createElement("span");
                disconnectedIcon.className = "disconnected-icon";
                disconnectedIcon.setAttribute("aria-hidden", "true");
                playerDiv.append(disconnectedIcon);
            }
            playerDiv.append(nameDiv);
            playerDiv.append(statsDiv);
            playerList.append(playerDiv);
        }

        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            for (const playerItem of playerList.querySelectorAll<HTMLElement>(
                ".player-item",
            )) {
                const previousTop = previousPlayerTops.get(
                    playerItem.dataset.playerId,
                );
                if (previousTop === undefined) continue;

                const offset = previousTop - playerItem.getBoundingClientRect().top;
                if (Math.abs(offset) < 1) continue;

                playerItem.animate(
                    [
                        { transform: `translateY(${offset}px)` },
                        { transform: "translateY(0)" },
                    ],
                    { duration: 250, easing: "ease-out" },
                );
            }
        }
    }
    updateStartButton();
}

function comparePlayersByScore(
    playerA: Pick<Player, "wins" | "total">,
    playerB: Pick<Player, "wins" | "total">,
): number {
    const winRateA = playerA.total > 0 ? playerA.wins / playerA.total : 0;
    const winRateB = playerB.total > 0 ? playerB.wins / playerB.total : 0;

    return winRateB - winRateA || playerB.total - playerA.total;
}

export function getPlayerRelationshipClass(playerID: string): string {
    if (playerID === "server") return "";
    if (isPlayerDisplayedAsInactive(playerID)) return "";
    if (playerID === gs.player.id) return "own";

    const ownTeam = getPlayerTeam(gs.player.id);
    const playerTeam = getPlayerTeam(playerID);
    if (!ownTeam || !playerTeam) return "";

    return ownTeam === playerTeam ? "teammate" : "opponent";
}

function isPlayerDisplayedAsInactive(
    playerID: string,
    player = gs.room.players.get(playerID),
): boolean {
    if (!player) return false;
    return (
        isPlayerDisplayedAsSpectator(playerID, player) ||
        (gs.room.status === RoomStatus.PLAYING && !getPlayerTeam(playerID))
    );
}

function isPlayerDisplayedAsSpectator(
    playerID: string,
    player = gs.room.players.get(playerID),
): boolean {
    if (!player || player.status !== PlayerStatus.SPECTATING) return false;
    return !getPlayerTeam(playerID);
}

export function getPlayerTeam(playerID: string): Team | undefined {
    for (const match of gs.room.game.matches) {
        if (match.getPlayerTeam(Team.BLUE)?.id === playerID) return Team.BLUE;
        if (match.getPlayerTeam(Team.RED)?.id === playerID) return Team.RED;
    }
}

export function startSidebarGameUI(): void {
    const lobbyActionRow = document.querySelector(
        "#lobby-action-row",
    ) as HTMLElement;
    const resignButton = document.querySelector(
        "#resign-btn",
    ) as HTMLButtonElement;

    if (isPlayerInGame()) {
        lobbyActionRow.style.display = "none";
        resignButton.style.display = "block";
    } else {
        lobbyActionRow.style.display = "flex";
        resignButton.style.display = "none";
    }
    updateStartButton();
}

export function endSidebarGameUI(): void {
    const lobbyActionRow = document.querySelector(
        "#lobby-action-row",
    ) as HTMLElement;
    const resignButton = document.querySelector(
        "#resign-btn",
    ) as HTMLButtonElement;

    lobbyActionRow.style.display = "flex";
    resignButton.style.display = "none";
    updateStartButton();
    updateUIPlayerList();
    updateRoomSettingsUI();
}
