import { initGameSocket } from "./game-socket";
import { initGameControls } from "./game-ui";
import { initMenuSocket } from "./menu-socket";
import { initMenuControls } from "./menu-ui";
import { initSession } from "./session";
import { initSidebarControls } from "./sidebar-ui";
import { checkURLForRoom } from "./url";

document.addEventListener("DOMContentLoaded", () => {
    (function () {
        const session = initSession();
        initMenuSocket();
        initMenuControls();
        initGameSocket();
        initGameControls();
        initSidebarControls();

        const checkRoomURLAfterProfileLoads = () => {
            session.socket.off(
                "created-player",
                checkRoomURLAfterProfileLoads,
            );
            session.socket.off("sent-player", checkRoomURLAfterProfileLoads);
            void checkURLForRoom();
        };
        session.socket.once("created-player", checkRoomURLAfterProfileLoads);
        session.socket.once("sent-player", checkRoomURLAfterProfileLoads);
        session.socket.connect();
    })();
});
