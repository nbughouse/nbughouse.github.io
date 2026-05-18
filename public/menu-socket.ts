import { Player } from "../shared/player";
import type { RoomListing } from "../shared/room";
import { showError, updateLobbiesList } from "./menu-ui";
import { sn } from "./session";

export function initMenuSocket(): void {
    sn.socket.on("created-player", (id: string, auth: string) => {
        sn.player = new Player(id);
        sn.auth = auth;
        sessionStorage.setItem("id", id);
        sessionStorage.setItem("auth", auth);
    });

    sn.socket.on("listed-rooms", (lobbies: RoomListing[]) => {
        updateLobbiesList(lobbies);
    });

    sn.socket.on("error", (error: string) => {
        showError("menu-error", error);
    });
}
