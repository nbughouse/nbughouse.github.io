import { getAssetPath } from "./app-paths";
import { sn } from "./session";
import { boardThemes } from "./settings";

const svgNamespace = "http://www.w3.org/2000/svg";
const pieceScale = 0.941;
const pieceInset = (1 - pieceScale) / 2;
let boardClipIndex = 0;
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

    const laneCount = 3;
    const boardsPerSequence = 3;

    for (let laneIndex = 0; laneIndex < laneCount; laneIndex++) {
        const lane = document.createElement("div");
        lane.className = `menu-gallery-lane ${
            laneIndex % 2 === 0 ? "moves-up" : "moves-down"
        }`;

        const strip = document.createElement("div");
        strip.className = "menu-gallery-strip";

        strip.append(
            createBoardSequence(boardsPerSequence),
            createBoardSequence(boardsPerSequence),
        );
        lane.append(strip);
        boardscape.append(lane);
    }

    refreshMenuBackground();
}

export function refreshMenuBackground(): void {
    const pieceImages = getPieceImages();
    for (const board of document.querySelectorAll<SVGSVGElement>(
        ".menu-gallery-board",
    )) {
        board.replaceChildren();
        const content = appendBoardClip(board);
        appendBoardArtwork(content);
        appendStartingPosition(content, pieceImages);
    }
}

function createBoardSequence(boardCount: number): HTMLDivElement {
    const sequence = document.createElement("div");
    sequence.className = "menu-gallery-sequence";
    for (let index = 0; index < boardCount; index++) {
        sequence.append(createMenuBoardElement());
    }
    return sequence;
}

function createMenuBoardElement(): SVGSVGElement {
    const board = document.createElementNS(svgNamespace, "svg");
    board.classList.add("menu-gallery-board");
    board.setAttribute("viewBox", "0 0 8 8");
    board.setAttribute("aria-hidden", "true");
    board.setAttribute("focusable", "false");
    return board;
}

function appendBoardClip(board: SVGSVGElement): SVGGElement {
    const clipID = `menu-gallery-board-clip-${boardClipIndex++}`;
    const definitions = document.createElementNS(svgNamespace, "defs");
    const clipPath = document.createElementNS(svgNamespace, "clipPath");
    clipPath.id = clipID;

    const clipRect = document.createElementNS(svgNamespace, "rect");
    clipRect.setAttribute("width", "8");
    clipRect.setAttribute("height", "8");
    clipRect.setAttribute("rx", "0.18");
    clipPath.append(clipRect);
    definitions.append(clipPath);

    const content = document.createElementNS(svgNamespace, "g");
    content.setAttribute("clip-path", `url(#${clipID})`);
    board.append(definitions, content);
    return content;
}

function appendBoardArtwork(board: SVGGElement): void {
    const theme =
        boardThemes.find((current) => current.id === sn.settings.boardTheme) ||
        boardThemes[0];

    if (theme.image) {
        const image = document.createElementNS(svgNamespace, "image");
        image.setAttribute("href", getAssetPath(`board/${theme.image}`));
        image.setAttribute("width", "8");
        image.setAttribute("height", "8");
        image.setAttribute("preserveAspectRatio", "none");
        board.append(image);
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
    board.append(lightSquares, darkSquares);
}

function appendStartingPosition(
    board: SVGGElement,
    pieceImages: ReadonlyMap<string, string>,
): void {
    for (let column = 0; column < 8; column++) {
        appendPiece(
            board,
            pieceImages.get(`${backRank[column]}-black`),
            0,
            column,
        );
        appendPiece(board, pieceImages.get("pawn-black"), 1, column);
        appendPiece(board, pieceImages.get("pawn-white"), 6, column);
        appendPiece(
            board,
            pieceImages.get(`${backRank[column]}-white`),
            7,
            column,
        );
    }
}

function appendPiece(
    board: SVGGElement,
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
    image.setAttribute("preserveAspectRatio", "xMidYMid meet");
    board.append(image);
}

function getPieceImages(): Map<string, string> {
    const images = new Map<string, string>();
    const probe = document.createElement("div");
    probe.classList.add("menu-piece-probe");
    document.body.append(probe);

    for (const color of ["white", "black"] as const) {
        for (const type of pieceTypes) {
            probe.className = `menu-piece-probe piece ${type} ${color}`;
            const backgroundImage = getComputedStyle(probe).backgroundImage;
            const match = /^url\(["']?(.*?)["']?\)$/.exec(backgroundImage);
            if (match) images.set(`${type}-${color}`, match[1]);
        }
    }

    probe.remove();
    return images;
}
