import { getAssetPath } from "./app-paths";
import { sn } from "./session";
import { boardThemes } from "./settings";

const svgNamespace = "http://www.w3.org/2000/svg";
const boardSymbolID = "menu-gallery-board-art";
const boardClipID = "menu-gallery-board-clip";
const pieceScale = 0.941;
const pieceInset = (1 - pieceScale) / 2;
const backRank = [
    "rook",
    "knight",
    "bishop",
    "queen",
    "king",
    "bishop",
    "knight",
    "rook",
] as const;
const pieceTypes = ["pawn", ...new Set(backRank)] as const;
type PieceName = (typeof pieceTypes)[number];

export function initMenuBackground(): void {
    const boardscape = document.querySelector<HTMLElement>("#menu-boardscape");
    if (!boardscape || boardscape.childElementCount > 0) return;

    boardscape.append(createBoardDefinitions());

    const laneCount = 3;
    const boardsPerSequence = 3;

    for (let laneIndex = 0; laneIndex < laneCount; laneIndex++) {
        const lane = document.createElement("div");
        lane.className = `menu-gallery-lane ${
            laneIndex % 2 === 0 ? "moves-up" : "moves-down"
        }`;

        const strip = document.createElement("div");
        strip.className = "menu-gallery-strip";

        const sequence = document.createElement("div");
        sequence.className = "menu-gallery-sequence";

        for (let index = 0; index < boardsPerSequence; index++) {
            sequence.append(createMenuBoardElement());
        }

        strip.append(sequence, sequence.cloneNode(true));
        lane.append(strip);
        boardscape.append(lane);
    }

    refreshMenuBackground();
}

export function refreshMenuBackground(): void {
    const symbol = document.querySelector<SVGSymbolElement>(
        `#${boardSymbolID}`,
    );
    if (!symbol) return;

    symbol.replaceChildren();
    appendBoardArtwork(symbol);
    appendStartingPosition(symbol);
}

function createBoardDefinitions(): SVGSVGElement {
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.classList.add("menu-gallery-definitions");
    svg.setAttribute("aria-hidden", "true");

    const definitions = document.createElementNS(svgNamespace, "defs");
    const clipPath = document.createElementNS(svgNamespace, "clipPath");
    clipPath.id = boardClipID;
    clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");

    const clipRect = document.createElementNS(svgNamespace, "rect");
    clipRect.setAttribute("width", "8");
    clipRect.setAttribute("height", "8");
    clipRect.setAttribute("rx", "0.18");
    clipPath.append(clipRect);

    const symbol = document.createElementNS(svgNamespace, "symbol");
    symbol.id = boardSymbolID;
    symbol.setAttribute("viewBox", "0 0 8 8");
    definitions.append(clipPath, symbol);
    svg.append(definitions);
    return svg;
}

function createMenuBoardElement(): SVGSVGElement {
    const board = document.createElementNS(svgNamespace, "svg");
    board.classList.add("menu-gallery-board");
    board.setAttribute("viewBox", "0 0 8 8");
    board.setAttribute("aria-hidden", "true");
    board.setAttribute("focusable", "false");

    const use = document.createElementNS(svgNamespace, "use");
    use.setAttribute("href", `#${boardSymbolID}`);
    use.setAttribute("clip-path", `url(#${boardClipID})`);
    board.append(use);
    return board;
}

function appendBoardArtwork(symbol: SVGSymbolElement): void {
    const theme =
        boardThemes.find((current) => current.id === sn.settings.boardTheme) ||
        boardThemes[0];

    if (theme.image) {
        const image = document.createElementNS(svgNamespace, "image");
        image.setAttribute("href", getAssetPath(`board/${theme.image}`));
        image.setAttribute("width", "8");
        image.setAttribute("height", "8");
        image.setAttribute("preserveAspectRatio", "none");
        symbol.append(image);
        return;
    }

    const lightSquares = document.createElementNS(svgNamespace, "rect");
    lightSquares.setAttribute("width", "8");
    lightSquares.setAttribute("height", "8");
    lightSquares.setAttribute("fill", theme.light || "#e9d7b4");

    const darkSquares = document.createElementNS(svgNamespace, "path");
    darkSquares.setAttribute("fill", theme.dark || "#b18967");
    darkSquares.setAttribute(
        "d",
        Array.from({ length: 64 }, (_, index) => {
            const row = Math.floor(index / 8);
            const column = index % 8;
            return (row + column) % 2 === 1
                ? `M${column} ${row}h1v1h-1z`
                : "";
        }).join(""),
    );
    symbol.append(lightSquares, darkSquares);
}

function appendStartingPosition(symbol: SVGSymbolElement): void {
    const pieceImages = new Map<string, string>();
    for (const color of ["white", "black"] as const) {
        for (const type of pieceTypes) {
            const href = getPieceImage(type, color);
            if (href) pieceImages.set(`${type}-${color}`, href);
        }
    }

    for (let column = 0; column < 8; column++) {
        appendPiece(
            symbol,
            pieceImages.get(`${backRank[column]}-black`),
            0,
            column,
        );
        appendPiece(symbol, pieceImages.get("pawn-black"), 1, column);
        appendPiece(symbol, pieceImages.get("pawn-white"), 6, column);
        appendPiece(
            symbol,
            pieceImages.get(`${backRank[column]}-white`),
            7,
            column,
        );
    }
}

function appendPiece(
    symbol: SVGSymbolElement,
    href: string | undefined,
    row: number,
    column: number,
): void {
    if (!href) return;

    const image = document.createElementNS(svgNamespace, "image");
    image.setAttribute("href", href);
    image.setAttribute("x", (column + pieceInset).toString());
    image.setAttribute("y", (row + pieceInset).toString());
    image.setAttribute("width", pieceScale.toString());
    image.setAttribute("height", pieceScale.toString());
    symbol.append(image);
}

function getPieceImage(
    type: PieceName,
    color: "white" | "black",
): string | undefined {
    const probe = document.createElement("div");
    probe.className = `piece ${type} ${color}`;
    probe.classList.add("menu-piece-probe");
    document.body.append(probe);

    const backgroundImage = getComputedStyle(probe).backgroundImage;
    probe.remove();

    const match = /^url\(["']?(.*?)["']?\)$/.exec(backgroundImage);
    return match?.[1];
}
