import { initGameSocket } from "./game-socket";
import { initGameControls } from "./game-ui";
import { initMenuSocket } from "./menu-socket";
import { initMenuControls } from "./menu-ui";
import { initSession } from "./session";
import { checkURLForRoom } from "./url";

document.addEventListener("DOMContentLoaded", () => {
    (function () {
        initSession();
        initMenuSocket();
        initMenuControls();
        initGameSocket();
        initGameControls();
        checkURLForRoom();
    })();
});
