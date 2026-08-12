export type MovementMode = "drag" | "click" | "both";
export type SoundName = "move" | "capture" | "check" | "castle";
export type SoundTheme =
    | "sfx"
    | "standard"
    | "robot"
    | "futuristic"
    | "woodland"
    | "nes"
    | "lisp"
    | "piano";

export interface BoardTheme {
    id: string;
    name: string;
    light?: string;
    dark?: string;
    image?: string;
}

interface SoundThemeOption {
    id: SoundTheme;
    name: string;
    sounds: Partial<Record<SoundName, string>>;
}

const storageKey = "bughouse-settings";
const cookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export const pieceThemes = [
    "cburnett",
    "alpha",
    "anarcandy",
    "california",
    "cardinal",
    "chess7",
    "chessnut",
    "companion",
    "disguised",
    "dubrovny",
    "fantasy",
    "fresca",
    "gioco",
    "governor",
    "horsey",
    "icpieces",
    "kosal",
    "leipzig",
    "letter",
    "libra",
    "maestro",
    "merida",
    "pirouetti",
    "pixel",
    "reillycraig",
    "riohacha",
    "shapes",
    "spatial",
    "staunty",
    "tatiana",
] as const;

export const boardThemes: BoardTheme[] = [
    { id: "classic", name: "Classic", light: "#e9d7b4", dark: "#b18967" },
    { id: "blue", name: "Blue", image: "blue.png" },
    { id: "blue2", name: "Blue 2", image: "blue2.jpg" },
    { id: "blue3", name: "Blue 3", image: "blue3.jpg" },
    { id: "blue-marble", name: "Blue Marble", image: "blue-marble.jpg" },
    { id: "brown", name: "Brown", image: "brown.png" },
    { id: "canvas2", name: "Canvas", image: "canvas2.jpg" },
    { id: "green", name: "Green", image: "green.png" },
    { id: "green-plastic", name: "Green Plastic", image: "green-plastic.png" },
    { id: "grey", name: "Grey", image: "grey.jpg" },
    { id: "gray", name: "Gray", image: "gray.svg" },
    { id: "horsey", name: "Horsey", image: "horsey.jpg" },
    { id: "ic", name: "IC", image: "ic.png" },
    { id: "leather", name: "Leather", image: "leather.jpg" },
    { id: "maple", name: "Maple", image: "maple.jpg" },
    { id: "maple2", name: "Maple 2", image: "maple2.jpg" },
    { id: "marble", name: "Marble", image: "marble.jpg" },
    { id: "metal", name: "Metal", image: "metal.jpg" },
    { id: "newspaper", name: "Newspaper", image: "newspaper.svg" },
    { id: "olive", name: "Olive", image: "olive.jpg" },
    { id: "pink-pyramid", name: "Pink Pyramid", image: "pink-pyramid.png" },
    { id: "purple", name: "Purple", image: "purple.png" },
    { id: "purple-diag", name: "Purple Diag", image: "purple-diag.png" },
    { id: "wood", name: "Wood", image: "wood.jpg" },
    { id: "wood2", name: "Wood 2", image: "wood2.jpg" },
    { id: "wood3", name: "Wood 3", image: "wood3.jpg" },
    { id: "wood4", name: "Wood 4", image: "wood4.jpg" },
];

export const soundThemes: readonly SoundThemeOption[] = [
    {
        id: "sfx",
        name: "SFX",
        sounds: { move: "Move.mp3", capture: "Capture.mp3", check: "Check.mp3" },
    },
    {
        id: "standard",
        name: "Standard",
        sounds: { move: "Move.mp3", capture: "Capture.mp3" },
    },
    {
        id: "robot",
        name: "Robot",
        sounds: { move: "Move.mp3", capture: "Capture.mp3", check: "Check.mp3" },
    },
    {
        id: "futuristic",
        name: "Futuristic",
        sounds: { move: "Move.mp3", capture: "Capture.mp3", check: "Check.mp3" },
    },
    {
        id: "woodland",
        name: "Woodland",
        sounds: { move: "Move.mp3", capture: "Capture.mp3", check: "Check.mp3" },
    },
    {
        id: "nes",
        name: "NES",
        sounds: { move: "Move.mp3", capture: "Capture.mp3", check: "Check.mp3" },
    },
    {
        id: "lisp",
        name: "Lisp",
        sounds: {
            move: "Move.mp3",
            capture: "Capture.mp3",
            check: "Check.mp3",
            castle: "Castles.mp3",
        },
    },
    {
        id: "piano",
        name: "Piano",
        sounds: { move: "Move.mp3", capture: "Capture.mp3", check: "Check.mp3" },
    },
];

export class Settings {
    logSocket = true;
    pieceTheme = "staunty";
    boardTheme = "classic";
    autoQueen = false;
    premoves = true;
    showBoardCoords = true;
    highlightLastMove = true;
    movementMode: MovementMode = "both";
    sounds = true;
    soundTheme: SoundTheme = "standard";
    showLegalMoves = true;
    messageGrouping = false;
    dualBoardUI = true;
    pieceAnimationSpeed = 1;

    constructor() {
        this.load();
    }

    save(): void {
        setCookie(storageKey, JSON.stringify(this.serialize()));
    }

    private load(): void {
        const raw = getCookie(storageKey) || getLocalStorageItem(storageKey);
        if (!raw) return;

        try {
            const data = JSON.parse(raw) as Partial<SettingsData>;
            Object.assign(this, data);
            this.validate();
            this.save();
        } catch {
            this.save();
        }
    }

    private serialize(): SettingsData {
        return {
            logSocket: this.logSocket,
            pieceTheme: this.pieceTheme,
            boardTheme: this.boardTheme,
            autoQueen: this.autoQueen,
            premoves: this.premoves,
            showBoardCoords: this.showBoardCoords,
            highlightLastMove: this.highlightLastMove,
            movementMode: this.movementMode,
            sounds: this.sounds,
            soundTheme: this.soundTheme,
            showLegalMoves: this.showLegalMoves,
            messageGrouping: this.messageGrouping,
            dualBoardUI: this.dualBoardUI,
            pieceAnimationSpeed: this.pieceAnimationSpeed,
        };
    }

    private validate(): void {
        if (!pieceThemes.includes(this.pieceTheme as (typeof pieceThemes)[number]))
            this.pieceTheme = "staunty";

        if (!boardThemes.some((theme) => theme.id === this.boardTheme))
            this.boardTheme = "classic";

        if (!["drag", "click", "both"].includes(this.movementMode))
            this.movementMode = "both";

        if (!soundThemes.some((theme) => theme.id === this.soundTheme))
            this.soundTheme = "standard";

        if (typeof this.dualBoardUI !== "boolean") this.dualBoardUI = true;

        if (
            typeof this.pieceAnimationSpeed !== "number" ||
            !Number.isFinite(this.pieceAnimationSpeed)
        )
            this.pieceAnimationSpeed = 1;
        this.pieceAnimationSpeed = Math.min(
            3,
            Math.max(0, this.pieceAnimationSpeed),
        );
    }
}

interface SettingsData {
    logSocket: boolean;
    pieceTheme: string;
    boardTheme: string;
    autoQueen: boolean;
    premoves: boolean;
    showBoardCoords: boolean;
    highlightLastMove: boolean;
    movementMode: MovementMode;
    sounds: boolean;
    soundTheme: SoundTheme;
    showLegalMoves: boolean;
    messageGrouping: boolean;
    dualBoardUI: boolean;
    pieceAnimationSpeed: number;
}

function getCookie(name: string): string | undefined {
    if (!globalThis.document) return undefined;

    try {
        const prefix = `${encodeURIComponent(name)}=`;
        const cookie = globalThis.document.cookie
            .split(";")
            .map((entry) => entry.trim())
            .find((entry) => entry.startsWith(prefix));

        if (!cookie) return undefined;

        return decodeURIComponent(cookie.slice(prefix.length));
    } catch {
        return undefined;
    }
}

function setCookie(name: string, value: string): void {
    if (!globalThis.document) return;

    try {
        globalThis.document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
            value,
        )}; Max-Age=${cookieMaxAgeSeconds}; Path=/; SameSite=Lax`;
    } catch {
        // Ignore unavailable cookies; defaults still keep the app usable.
    }
}

function getLocalStorageItem(key: string): string | undefined {
    try {
        return globalThis.localStorage?.getItem(key) || undefined;
    } catch {
        return undefined;
    }
}
