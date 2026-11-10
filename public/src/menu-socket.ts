import { Player } from "@shared/player";
import { applyAuthenticatedPlayerName, showError } from "./menu-ui";
import { setStoredProfileValue, sn } from "./session";

export function initMenuSocket(): void {
    sn.socket.on("created-player", (id: string, auth: string) => {
        const player = new Player(id, sn.name);
        if (sn.game.local) sn.onlinePlayer = player;
        else sn.player = player;
        sn.auth = auth;
        setStoredProfileValue("id", id);
        setStoredProfileValue("auth", auth);

        if (sn.name) sn.socket.emit("set-name", sn.name);
    });

    sn.socket.on("sent-player", (name: string) => {
        applyAuthenticatedPlayerName(name);
    });

    sn.socket.on("error", (error: string) => {
        showError("menu-error", error);
    });
}
