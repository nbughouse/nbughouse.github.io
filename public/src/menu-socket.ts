import { Player } from "@shared/player";
import { showError } from "./menu-ui";
import { sn } from "./session";

export function initMenuSocket(): void {
    sn.socket.on("created-player", (id: string, auth: string) => {
        sn.player = new Player(id, sn.name);
        sn.auth = auth;
        sessionStorage.setItem("id", id);
        sessionStorage.setItem("auth", auth);

        if (sn.name) sn.socket.emit("set-name", sn.name);
    });

    sn.socket.on("error", (error: string) => {
        showError("menu-error", error);
    });
}
