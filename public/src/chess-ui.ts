import {
    type BoardPosition,
    type Chess,
    Color,
    createPosition,
    type Move,
    MoveType,
    type Piece,
    PieceType,
    type Position,
    positionsEqual,
} from "@shared/chess";
import { RoomStatus } from "@shared/room";
import { playSound } from "./game-ui";
import { visualFlipped } from "./match-ui";
import { gs } from "./session";
import { getAssetPath } from "./app-paths";
import { boardThemes } from "./settings";
import { refreshMenuBackground } from "./menu-background";

// MARK: Global Variables

let selected:
    | {
          boardID: number;
          pos: Position;
          piece: Piece;
          justSelected: boolean;
          dragElement: HTMLElement | undefined;
      }
    | undefined;

let pendingPromotion:
    | {
          dialog: HTMLDivElement;
          callback: (pieceType: PieceType) => void;
          onCancel: () => void;
          cleanup: () => void;
      }
    | undefined;

interface BoardMarks {
    marked: boolean[][];
    premoved: boolean[][];
    arrows: BoardArrow[];
}

interface VisualChessState {
    chess: Chess;
    marks: BoardMarks;
}

const visualChessStates: Map<number, VisualChessState> = new Map();
const lastMoves: Map<number, Move> = new Map();
const lastMoveAnimationSerials: Map<number, number> = new Map();
const animatedMoveSerials: Map<number, number> = new Map();
const suppressedMoveAnimations: Map<number, string[]> = new Map();
const lastMoveAnimationPieces: Map<
    number,
    {
        from?: Piece;
        to?: Piece;
        suppressTravel: boolean;
    }
> = new Map();
let nextMoveAnimationSerial = 1;

interface BoardArrow {
    from: BoardPosition;
    to: BoardPosition;
}

let rightDragStart:
    | {
          boardID: number;
          pos: BoardPosition;
      }
    | undefined;

// MARK: Visual Chess State

function resetMarks(matchIndex: number): void {
    visualChessStates.get(matchIndex)!.marks = {
        marked: Array.from({ length: 8 }, () =>
            Array.from({ length: 8 }, () => false),
        ),
        premoved: Array.from({ length: 8 }, () =>
            Array.from({ length: 8 }, () => false),
        ),
        arrows: [],
    };
}

function updateVisualChessState(matchIndex: number): void {
    const match = gs.room.game.matches[matchIndex];
    const chess = gs.room.game.getFinalChess(matchIndex);
    const previousState = visualChessStates.get(matchIndex);

    if (previousState && match.queued.moves.length === 0) {
        visualChessStates.set(matchIndex, {
            chess,
            marks: {
                marked: previousState.marks.marked,
                premoved: Array.from({ length: 8 }, () =>
                    Array.from({ length: 8 }, () => false),
                ),
                arrows: previousState.marks.arrows,
            },
        });

        return;
    }

    const marks: BoardMarks = {
        marked:
            previousState?.marks.marked ||
            Array.from({ length: 8 }, () =>
                Array.from({ length: 8 }, () => false),
            ),
        premoved: Array.from({ length: 8 }, () =>
            Array.from({ length: 8 }, () => false),
        ),
        arrows: previousState?.marks.arrows || [],
    };

    for (let index = 0; index < match.queued.moves.length; index++) {
        const move = gs.room.game.matches[matchIndex].queued.moves[index];

        if (
            index === 0 &&
            gs.room.game.matches[matchIndex].chess.turn ===
                gs.room.game.matches[matchIndex].chess.getPiece(move.from)!
                    .color
        )
            continue;

        if (move.from.loc === "board")
            marks.premoved[move.from.row][move.from.col] = true;

        if (move.to.loc === "board")
            marks.premoved[move.to.row][move.to.col] = true;
    }

    visualChessStates.set(matchIndex, {
        chess,
        marks,
    });
}

function getVisualChess(matchIndex: number): VisualChessState {
    if (!visualChessStates.has(matchIndex)) updateVisualChessState(matchIndex);

    return visualChessStates.get(matchIndex)!;
}

// MARK: Utility Functions

function isFlipped(id: number): boolean {
    return gs.room.game.matches[id].flipped !== visualFlipped;
}

function isMyPiece(boardID: number, piece: Piece): boolean {
    return (
        gs.room.status === RoomStatus.PLAYING &&
        gs.room.game.matches[boardID].getPlayer(piece.color)?.id ===
            gs.player.id
    );
}

function getPieceClassNames(piece: Piece): string[] {
    const pieceClassByType: Record<PieceType, string> = {
        [PieceType.KING]: "king",
        [PieceType.QUEEN]: "queen",
        [PieceType.ROOK]: "rook",
        [PieceType.BISHOP]: "bishop",
        [PieceType.KNIGHT]: "knight",
        [PieceType.PAWN]: "pawn",
        [PieceType.PROMOTED_QUEEN]: "queen",
    };

    const classNames = [
        "piece",
        pieceClassByType[piece.type],
        piece.color === Color.WHITE ? "white" : "black",
    ];
    if (piece.combinedWith) classNames.push("accolade-piece");
    return classNames;
}

export function createPieceElement(piece: Piece): HTMLDivElement {
    const element = document.createElement("div");
    element.className = getPieceClassNames(piece).join(" ");
    element.dataset.pieceType = piece.type;
    element.dataset.pieceColor = piece.color.toString();
    if (piece.combinedWith) element.dataset.combinedWith = piece.combinedWith;

    if (piece.combinedWith) {
        const badgeType =
            piece.combinedWith === PieceType.PROMOTED_QUEEN
                ? PieceType.QUEEN
                : piece.combinedWith;
        const badge = document.createElement("div");
        badge.className = getPieceClassNames({
            type: badgeType,
            color: piece.color,
        })
            .filter((className) => className !== "piece")
            .concat("accolade-badge")
            .join(" ");
        badge.setAttribute("aria-hidden", "true");
        element.append(badge);
    }

    return element;
}

function pieceElementMatches(element: HTMLElement, piece: Piece): boolean {
    return (
        element.dataset.pieceType === piece.type &&
        element.dataset.pieceColor === piece.color.toString() &&
        (element.dataset.combinedWith || undefined) === piece.combinedWith
    );
}

function syncSquareLabel(
    square: HTMLElement,
    className: "rank-label" | "file-label",
    text: string | undefined,
): void {
    const existing = square.querySelector<HTMLElement>(
        `:scope > .${className}`,
    );

    if (text === undefined) {
        existing?.remove();
        return;
    }

    if (existing) {
        existing.textContent = text;
        return;
    }

    const label = document.createElement("div");
    label.className = className;
    label.textContent = text;
    square.prepend(label);
}

function syncSquarePiece(
    square: HTMLElement,
    piece: Piece | undefined,
    hidden: boolean,
    replaceAnimating: boolean,
): void {
    const elements = Array.from(
        square.querySelectorAll<HTMLElement>(":scope > .piece"),
    );
    let element = elements[0];

    if (!piece) {
        for (const current of elements) current.remove();
        return;
    }

    if (
        !element ||
        !pieceElementMatches(element, piece) ||
        (replaceAnimating &&
            (element.classList.contains("animating") ||
                element.classList.contains("accolade-combine-result")))
    ) {
        for (const current of elements) current.remove();
        element = createPieceElement(piece);
        element.addEventListener("dragstart", () => false);
        square.append(element);
    }

    element.style.opacity = hidden ? "0" : "";
}

function setPositionToElement(element: HTMLElement, id: number, pos: Position) {
    element.dataset.id = id.toString();
    element.dataset.loc = pos.loc;
    if (pos.loc === "board") {
        element.dataset.row = pos.row.toString();
        element.dataset.col = pos.col.toString();
    } else {
        element.dataset.color = pos.color.toString();
        element.dataset.type = pos.type;
    }
}

function getPositionFromElement(element: HTMLElement): {
    pos: Position;
    id: number;
} {
    return {
        pos:
            element.dataset.loc === "board"
                ? createPosition(
                      Number.parseInt(element.dataset.row || "0"),
                      Number.parseInt(element.dataset.col || "0"),
                  )
                : createPosition(
                      Number.parseInt(element.dataset.color || "0"),
                      element.dataset.type as PieceType,
                  ),
        id: Number.parseInt(element.dataset.id || "0"),
    };
}

function getSquareElement(id: number, pos: BoardPosition): HTMLElement {
    return document.querySelector(
        `.square[data-id="${id}"][data-row="${pos.row}"][data-col="${pos.col}"]`,
    ) as HTMLDivElement;
}

function getPieceElement(id: number, pos: Position): HTMLElement {
    if (pos.loc === "board") {
        const square = getSquareElement(id, pos);
        return square.querySelector(".piece") as HTMLElement;
    }

    return document.querySelector(
        `.piece[data-id="${id}"][data-loc="pocket"][data-type="${pos.type}"][data-color="${pos.color}"]`,
    ) as HTMLElement;
}

// MARK: Element Creation

export function createBoardElement(id: number): HTMLDivElement {
    const board = document.createElement("div");

    board.className = "board";
    board.dataset.id = id.toString();
    applyBoardTheme(board);

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement("div");

            square.className = `square ${
                (row + col) % 2 === 0 ? "light" : "dark"
            }`;
            square.style.setProperty("--board-rank", row.toString());
            square.style.setProperty("--board-file", col.toString());
            setPositionToElement(square, id, createPosition(row, col));

            square.addEventListener("mousedown", handleSquareMouseDown);
            square.addEventListener("mouseup", handleSquareMouseUp);
            square.addEventListener("contextmenu", handleSquareRightClick);

            board.append(square);
        }
    }

    const arrows = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrows.classList.add("arrow-annotations");
    arrows.setAttribute("viewBox", "0 0 100 100");
    arrows.setAttribute("preserveAspectRatio", "none");
    board.append(arrows);

    return board;
}

export function applyAllChessSettings(): void {
    applyPieceAnimationSpeed();
    applyPieceTheme();
    for (const board of document.querySelectorAll(".board"))
        applyBoardTheme(board as HTMLElement);
    refreshMenuBackground();
    if (gs.room) {
        for (let index = 0; index < gs.room.game.matches.length; index++)
            updateUIChess(index);
    }
}

export function applyPieceAnimationSpeed(): void {
    const speed = gs.settings.pieceAnimationSpeed;
    const duration = speed > 0 ? Math.round(300 / speed) : 0;
    document.documentElement.style.setProperty(
        "--piece-animation-duration",
        `${duration}ms`,
    );
}

function applyPieceTheme(): void {
    let link = document.querySelector(
        "#piece-theme-stylesheet",
    ) as HTMLLinkElement | null;

    if (!link) {
        link = document.createElement("link");
        link.id = "piece-theme-stylesheet";
        link.rel = "stylesheet";
        document.head.append(link);
    }

    link.onload = refreshMenuBackground;
    link.href = getAssetPath(`pieces/${gs.settings.pieceTheme}.css`);
}

function applyBoardTheme(board: HTMLElement): void {
    const theme =
        boardThemes.find((current) => current.id === gs.settings.boardTheme) ||
        boardThemes[0];

    board.classList.toggle("board-image-theme", Boolean(theme.image));
    board.style.setProperty("--board-light", theme.light || "#e9d7b4");
    board.style.setProperty("--board-dark", theme.dark || "#b18967");
    board.style.setProperty(
        "--board-image",
        theme.image ? `url("${getAssetPath(`board/${theme.image}`)}")` : "none",
    );
}

export function createPocketElement(
    id: number,
    side: "top" | "bottom",
): HTMLDivElement {
    const pocket = document.createElement("div");

    pocket.className = "pocket";
    pocket.id = `${side}-pocket-${id}`;
    pocket.dataset.id = id.toString();

    return pocket;
}

// MARK: Promotion Dialog

function showPromotionDialog(
    boardID: number,
    to: BoardPosition,
    color: Color,
    callback: (pieceType: PieceType) => void,
    onCancel: () => void,
): void {
    if (pendingPromotion) return;

    // The drag preview otherwise sits above the chooser while the decision is
    // pending. The selected pawn itself remains selected until choice/cancel.
    dropSelectedPiece();

    // Clean up any dialog left behind by an earlier version of the UI before
    // creating the single active promotion prompt.
    for (const staleDialog of document.querySelectorAll(".promotion-dialog"))
        staleDialog.remove();

    const dialog = document.createElement("div");
    dialog.className = "promotion-dialog";
    dialog.id = `promotion-dialog-${boardID}`;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Choose a promotion piece");
    dialog.setAttribute("aria-modal", "true");

    const visualRow = isFlipped(boardID) ? 7 - to.row : to.row;
    dialog.classList.add(
        visualRow === 0 ? "promotion-dialog-down" : "promotion-dialog-up",
    );

    const positionDialog = () => {
        const square = getSquareElement(boardID, to);
        const bounds = square.getBoundingClientRect();

        dialog.style.setProperty("--promotion-square-size", `${bounds.width}px`);
        dialog.style.left = `${bounds.left}px`;
        if (visualRow === 0) {
            dialog.style.top = `${bounds.top}px`;
            dialog.style.bottom = "auto";
        } else {
            dialog.style.top = "auto";
            dialog.style.bottom = `${window.innerHeight - bounds.bottom}px`;
        }
    };

    const handlePromotionKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        cancelPromotion();
    };
    const cleanup = () => {
        window.removeEventListener("resize", positionDialog);
        window.removeEventListener("scroll", positionDialog, true);
        document.removeEventListener("keydown", handlePromotionKeyDown);
        dialog.remove();
    };

    pendingPromotion = { dialog, callback, onCancel, cleanup };

    const pieces = [
        PieceType.QUEEN,
        PieceType.KNIGHT,
        PieceType.ROOK,
        PieceType.BISHOP,
    ];

    const pieceNames: Record<(typeof pieces)[number], string> = {
        [PieceType.QUEEN]: "queen",
        [PieceType.KNIGHT]: "knight",
        [PieceType.ROOK]: "rook",
        [PieceType.BISHOP]: "bishop",
    };

    for (const pieceType of pieces) {
        const pieceButton = document.createElement("button");
        pieceButton.type = "button";
        pieceButton.className = "promotion-option";
        pieceButton.setAttribute(
            "aria-label",
            `Promote to ${pieceNames[pieceType]}`,
        );
        pieceButton.append(createPieceElement({ type: pieceType, color }));
        pieceButton.addEventListener("click", () => {
            handlePromotionChoice(pieceType);
        });
        dialog.append(pieceButton);
    }

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "promotion-cancel";
    cancelButton.setAttribute("aria-label", "Cancel promotion");
    cancelButton.textContent = "\u00d7";
    cancelButton.addEventListener("click", cancelPromotion);
    dialog.append(cancelButton);

    document.body.append(dialog);
    positionDialog();
    window.addEventListener("resize", positionDialog);
    window.addEventListener("scroll", positionDialog, true);
    document.addEventListener("keydown", handlePromotionKeyDown);
    dialog.querySelector<HTMLButtonElement>("button")?.focus();
}

function handlePromotionChoice(pieceType: PieceType): void {
    const promotion = pendingPromotion;
    if (!promotion) return;

    // Clear the pending state before executing the move. This keeps the modal
    // lifecycle correct even if the callback synchronously updates the board.
    pendingPromotion = undefined;
    promotion.cleanup();
    promotion.callback(pieceType);
}

function cancelPromotion(): void {
    const promotion = pendingPromotion;
    if (!promotion) return;

    pendingPromotion = undefined;
    promotion.cleanup();
    promotion.onCancel();
}

function closePromotionDialog(): void {
    pendingPromotion?.cleanup();
    pendingPromotion = undefined;

    for (const staleDialog of document.querySelectorAll(".promotion-dialog"))
        staleDialog.remove();
}

// MARK: Piece Selection

function holdPiece(mouseEvent: MouseEvent): void {
    if (!selected) return;

    dropSelectedPiece();

    const pieceImg = getPieceElement(selected.boardID, selected.pos);

    const dragImg = pieceImg.cloneNode(true) as HTMLElement;

    dragImg.classList.add("dragged-piece");
    dragImg.style.width = `${pieceImg.offsetWidth}px`;
    dragImg.style.height = `${pieceImg.offsetHeight}px`;

    const centerOffsetX = pieceImg.offsetWidth / 2;
    const centerOffsetY = pieceImg.offsetHeight / 2;

    dragImg.style.left = `${mouseEvent.clientX - centerOffsetX}px`;
    dragImg.style.top = `${mouseEvent.clientY - centerOffsetY}px`;

    document.body.append(dragImg);
    selected.dragElement = dragImg;

    document.addEventListener("mousemove", handleMouseMove);

    getPieceElement(selected.boardID, selected.pos).style.opacity = "0";
}

function dropSelectedPiece(): void {
    if (!selected?.dragElement) return;

    selected.dragElement.remove();
    selected.dragElement = undefined;

    getPieceElement(selected.boardID, selected.pos).style.opacity = "1";

    document.removeEventListener("mousemove", handleMouseMove);
}

function selectPiece(id: number, pos: Position): void {
    const lastSelected = selected?.pos;
    const justSelected = lastSelected
        ? !positionsEqual(lastSelected, pos)
        : true;

    deselectPiece();

    const piece = getVisualChess(id).chess.getPiece(pos);

    if (!piece) return;

    selected = {
        boardID: id,
        pos,
        piece,
        justSelected,
        dragElement: undefined,
    };

    updateAnnotations(id);
}

function deselectPiece(): void {
    if (!selected) return;

    dropSelectedPiece();

    const { boardID } = selected;

    selected = undefined;
    updateUIChess(boardID);
}

// MARK: Move Execution

function executeMove(id: number, move: Move, premove: boolean): void {
    const board = getVisualChess(id).chess;
    const rules = gs.room.game.getMoveRules();

    if (!premove) gs.socket.emit("move-board", id, selected!.piece.color, move);

    gs.room.game.matches[id].queued.color = selected!.piece.color;
    gs.room.game.matches[id].queued.moves.push(move);

    playMoveSound(board.getLegalMoveType(move, premove, rules));

    deselectPiece();
}

function attemptMove(id: number, to: Position): boolean {
    if (!selected || selected.boardID !== id) return false;

    const move: Move = {
        from: selected.pos,
        to,
    };

    const board = getVisualChess(id).chess;
    const premove = board.turn !== board.getPiece(move.from)?.color;

    if (premove && !gs.settings.premoves) return false;
    if (!board.isLegal(move, premove, gs.room.game.getMoveRules())) return false;

    // Check if this is a promotion move
    if (
        to.loc === "board" &&
        selected.piece.type === PieceType.PAWN &&
        to.row === (selected.piece.color ? 0 : 7)
    ) {
        if (gs.settings.autoQueen) {
            move.promotion = PieceType.QUEEN;
            executeMove(id, move, premove);
        } else {
            showPromotionDialog(
                id,
                to,
                selected.piece.color,
                (pieceType) => {
                    move.promotion = pieceType;
                    executeMove(id, move, premove);
                },
                deselectPiece,
            );
        }
        return true;
    }

    executeMove(id, move, premove);
    return true;
}

// MARK: UI Update Funcs

export function updateUIChess(id: number): void {
    updateVisualChessState(id);

    const chess = getVisualChess(id).chess;
    const boardElement = document.querySelector<HTMLElement>(
        `.board[data-id="${id}"]`,
    );

    if (!boardElement) return;

    const squares = boardElement.querySelectorAll(`.square`);
    const flipped = isFlipped(id);
    const replaceAnimatingPieces =
        lastMoveAnimationSerials.get(id) !== animatedMoveSerials.get(id);

    for (const [index, square] of squares.entries()) {
        const element = square as HTMLElement;

        const visualRow = Math.floor(index / 8);
        const visualCol = index % 8;

        const row = flipped ? 7 - visualRow : visualRow;
        const col = flipped ? 7 - visualCol : visualCol;
        const pos = createPosition(row, col);

        element.style.setProperty("--board-rank", visualRow.toString());
        element.style.setProperty("--board-file", visualCol.toString());
        setPositionToElement(element, id, pos);

        const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

        syncSquareLabel(
            element,
            "rank-label",
            gs.settings.showBoardCoords && visualCol === 0
                ? (8 - row).toString()
                : undefined,
        );
        syncSquareLabel(
            element,
            "file-label",
            gs.settings.showBoardCoords && visualRow === 7
                ? files[col]
                : undefined,
        );

        const piece = chess.getPiece(pos);
        if (piece) {
            const isMyTurn = chess.turn === piece.color;
            const isMyPiece =
                gs.room.status === RoomStatus.PLAYING &&
                gs.room.game.matches[id].getPlayer(piece.color)?.id ===
                    gs.player.id;

            const canMoveNow = isMyPiece && (isMyTurn || gs.settings.premoves);
            element.style.cursor =
                canMoveNow && gs.settings.movementMode !== "click"
                    ? "grab"
                    : "default";

            const hidden = Boolean(
                selected &&
                    selected.dragElement &&
                    selected.boardID === id &&
                    positionsEqual(selected.pos, pos),
            );
            syncSquarePiece(element, piece, hidden, replaceAnimatingPieces);
        } else {
            element.style.cursor = "default";
            syncSquarePiece(element, undefined, false, replaceAnimatingPieces);
        }
    }

    animateLastMove(id);

    const topColor = flipped ? Color.WHITE : Color.BLACK;
    const bottomColor = flipped ? Color.BLACK : Color.WHITE;

    updatePocket("top-pocket", chess.getPocket(topColor), topColor, id);
    updatePocket(
        "bottom-pocket",
        chess.getPocket(bottomColor),
        bottomColor,
        id,
    );

    updateAnnotations(id);
}

function animateLastMove(boardID: number): void {
    const move = lastMoves.get(boardID);
    const serial = lastMoveAnimationSerials.get(boardID);
    if (!move || !serial || animatedMoveSerials.get(boardID) === serial) return;

    animatedMoveSerials.set(boardID, serial);

    const speed = gs.settings.pieceAnimationSpeed;
    if (
        speed <= 0 ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
        return;

    const animationPieces = lastMoveAnimationPieces.get(boardID);
    if (
        animationPieces &&
        move.to.loc === "board" &&
        isAccoladeCombination(animationPieces.from, animationPieces.to)
    ) {
        animateAccoladeCombination(boardID, move, animationPieces, speed);
        return;
    }

    if (move.from.loc !== "board" || move.to.loc !== "board") return;

    const fromSquare = getSquareElement(boardID, move.from);
    const toSquare = getSquareElement(boardID, move.to);
    const pieceElement = toSquare.querySelector(".piece") as HTMLElement | null;
    if (!pieceElement) return;

    const fromRect = fromSquare.getBoundingClientRect();
    const toRect = toSquare.getBoundingClientRect();
    const duration = Math.round(300 / speed);

    pieceElement.classList.add("animating");
    pieceElement.style.setProperty("--piece-move-duration", `${duration}ms`);
    pieceElement.style.transition = "none";
    pieceElement.style.transform = `translate(${fromRect.left - toRect.left}px, ${
        fromRect.top - toRect.top
    }px)`;
    pieceElement.getBoundingClientRect();

    window.requestAnimationFrame(() => {
        pieceElement.style.transition =
            "transform var(--piece-move-duration) cubic-bezier(0.2, 0, 0, 1)";
        pieceElement.style.transform = "translate(0, 0)";
    });

    const cleanup = () => {
        pieceElement.classList.remove("animating");
        pieceElement.style.removeProperty("--piece-move-duration");
        pieceElement.style.transition = "";
        pieceElement.style.transform = "";
    };

    pieceElement.addEventListener("transitionend", cleanup, { once: true });
    window.setTimeout(cleanup, duration + 50);
}

function isAccoladeCombination(from?: Piece, to?: Piece): boolean {
    if (!from || !to || from.color !== to.color) return false;
    if (from.combinedWith || to.combinedWith) return false;

    const partnerTypes = new Set([
        PieceType.BISHOP,
        PieceType.ROOK,
        PieceType.QUEEN,
        PieceType.PROMOTED_QUEEN,
    ]);
    return (
        (from.type === PieceType.KNIGHT && partnerTypes.has(to.type)) ||
        (to.type === PieceType.KNIGHT && partnerTypes.has(from.type))
    );
}

function animateAccoladeCombination(
    boardID: number,
    move: Move,
    pieces: { from?: Piece; to?: Piece; suppressTravel: boolean },
    speed: number,
): void {
    if (move.to.loc !== "board" || !pieces.from || !pieces.to) return;

    const toSquare = getSquareElement(boardID, move.to);
    const result = toSquare.querySelector(
        ":scope > .piece",
    ) as HTMLElement | null;
    if (!result?.classList.contains("accolade-piece")) return;

    const fullDuration = Math.round(360 / speed);
    const revealDuration = Math.round(fullDuration * 0.38);
    const animateTravel = !pieces.suppressTravel && move.from.loc === "board";
    const revealDelay = animateTravel ? fullDuration - revealDuration : 0;

    result.classList.add("accolade-combine-result");
    result.style.setProperty("--accolade-reveal-duration", `${revealDuration}ms`);
    result.style.setProperty("--accolade-reveal-delay", `${revealDelay}ms`);

    const ghosts: HTMLElement[] = [];
    if (animateTravel && move.from.loc === "board") {
        const fromSquare = getSquareElement(boardID, move.from);
        const fromRect = fromSquare.getBoundingClientRect();
        const toRect = toSquare.getBoundingClientRect();
        const movingPiece = createPieceElement(pieces.from);
        const targetPiece = createPieceElement(pieces.to);

        movingPiece.classList.add(
            "accolade-combine-layer",
            "accolade-combine-moving",
        );
        targetPiece.classList.add(
            "accolade-combine-layer",
            "accolade-combine-target",
        );
        movingPiece.style.setProperty(
            "--accolade-from-x",
            `${fromRect.left - toRect.left}px`,
        );
        movingPiece.style.setProperty(
            "--accolade-from-y",
            `${fromRect.top - toRect.top}px`,
        );
        movingPiece.style.setProperty(
            "--accolade-travel-duration",
            `${fullDuration}ms`,
        );
        movingPiece.style.setProperty(
            "--accolade-reveal-duration",
            `${revealDuration}ms`,
        );
        movingPiece.style.setProperty(
            "--accolade-reveal-delay",
            `${revealDelay}ms`,
        );
        targetPiece.style.setProperty(
            "--accolade-reveal-duration",
            `${revealDuration}ms`,
        );
        targetPiece.style.setProperty(
            "--accolade-reveal-delay",
            `${revealDelay}ms`,
        );
        toSquare.append(targetPiece, movingPiece);
        ghosts.push(targetPiece, movingPiece);
    }

    result.getBoundingClientRect();
    window.requestAnimationFrame(() => {
        result.classList.add("accolade-combine-active");
        for (const ghost of ghosts)
            ghost.classList.add("accolade-combine-active");
    });

    const cleanup = () => {
        for (const ghost of ghosts) ghost.remove();
        result.classList.remove(
            "accolade-combine-result",
            "accolade-combine-active",
        );
        result.style.removeProperty("--accolade-reveal-duration");
        result.style.removeProperty("--accolade-reveal-delay");
    };
    const totalDuration = animateTravel ? fullDuration : revealDuration;
    window.setTimeout(cleanup, totalDuration + 60);
}

export function suppressMoveAnimation(boardID: number, move: Move): void {
    const suppressedMoves = suppressedMoveAnimations.get(boardID) || [];
    suppressedMoves.push(getMoveAnimationKey(move));
    suppressedMoveAnimations.set(boardID, suppressedMoves);
}

function shouldSuppressMoveAnimation(boardID: number, move: Move): boolean {
    const suppressedMoves = suppressedMoveAnimations.get(boardID);
    if (!suppressedMoves) return false;

    const key = getMoveAnimationKey(move);
    const index = suppressedMoves.indexOf(key);
    if (index < 0) return false;

    suppressedMoves.splice(index, 1);
    if (suppressedMoves.length === 0) suppressedMoveAnimations.delete(boardID);

    return true;
}

function getMoveAnimationKey(move: Move): string {
    return `${getPositionAnimationKey(move.from)}>${getPositionAnimationKey(
        move.to,
    )}:${move.promotion || ""}`;
}

function getPositionAnimationKey(pos: Position): string {
    return pos.loc === "board"
        ? `b:${pos.row}:${pos.col}`
        : `p:${pos.color}:${pos.type}`;
}

function updatePocket(
    id: string,
    pieces: Map<PieceType, number>,
    color: Color,
    boardID: number,
): void {
    const pocket = document.querySelector<HTMLElement>(`#${id}-${boardID}`);

    if (!pocket) return;

    pocket.innerHTML = "";
    pocket.dataset.id = boardID.toString();

    const pieceOrder = [
        PieceType.KING,
        PieceType.PAWN,
        PieceType.KNIGHT,
        PieceType.BISHOP,
        PieceType.ROOK,
        PieceType.QUEEN,
    ];

    const isMyPiece =
        gs.room.status === RoomStatus.PLAYING &&
        gs.room.game.matches[boardID].getPlayer(color)?.id === gs.player.id;

    for (const pieceType of pieceOrder) {
        const count = pieces.get(pieceType);

        if (count && count > 0) {
            const pieceElement = document.createElement("div");

            pieceElement.className = "pocket-piece";
            pieceElement.dataset.id = boardID.toString();

            const pieceView = createPieceElement({ type: pieceType, color });

            setPositionToElement(pieceView, boardID, {
                loc: "pocket",
                type: pieceType,
                color,
            });
            pieceView.addEventListener("dragstart", () => false);

            if (isMyPiece) {
                pieceView.style.cursor = "grab";
                pieceView.addEventListener("mousedown", handlePocketMouseDown);
                pieceView.addEventListener("mouseup", handlePocketMouseUp);
            } else {
                pieceView.style.cursor = "default";
            }

            pieceElement.append(pieceView);

            if (count > 1) {
                const countBadge = document.createElement("div");

                countBadge.className = "pocket-count";
                countBadge.textContent = count.toString();
                pieceElement.append(countBadge);
            }

            pocket.append(pieceElement);
        }
    }
}

function annotateSquare(
    boardID: number,
    row: number,
    col: number,
    classes: string[],
): void {
    const square = getSquareElement(boardID, { loc: "board", row, col });

    for (const cls of classes) square.classList.add(cls);

    if (classes.includes("legal-move") && square.querySelector(".piece"))
        square.classList.add("has-piece");
}

function updateAnnotations(id: number): void {
    // Clear board highlights
    const boardElement = document.querySelector<HTMLElement>(
        `.board[data-id="${id}"]`,
    );
    if (!boardElement) return;

    const squares = boardElement.querySelectorAll(`.square`);

    for (const square of squares) {
        const element = square as HTMLElement;

        element.classList.remove(
            "highlight",
            "legal-move",
            "has-piece",
            "premoved",
            "marked",
            "last-move",
        );
    }

    updateArrowAnnotations(id);

    // Clear pocket highlights
    const pocketPieces = document.querySelectorAll(`.pocket-piece`);

    for (const piece of pocketPieces) {
        const element = piece as HTMLElement;

        element.classList.remove("highlight");
    }

    const { chess, marks } = getVisualChess(id);
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (marks.premoved[r][c] || marks.marked[r][c])
                annotateSquare(id, r, c, ["premoved"]);
        }
    }

    const lastMove = lastMoves.get(id);
    if (gs.settings.highlightLastMove && lastMove) {
        if (lastMove.from.loc === "board")
            annotateSquare(id, lastMove.from.row, lastMove.from.col, [
                "last-move",
            ]);
        if (lastMove.to.loc === "board")
            annotateSquare(id, lastMove.to.row, lastMove.to.col, ["last-move"]);
    }

    if (!selected || selected.boardID !== id) return;
    const { pos } = selected;

    if (pos.loc === "board") {
        annotateSquare(id, pos.row, pos.col, ["highlight"]);
    } else {
        const pocketImg = getPieceElement(id, pos);
        const pocketPiece = pocketImg.closest(".pocket-piece") as HTMLElement;
        pocketPiece.classList.add("highlight");
    }

    const premove = chess.getPiece(pos)?.color !== chess.turn;

    if (gs.settings.showLegalMoves && (!premove || gs.settings.premoves)) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const move = { from: pos, to: createPosition(r, c) };
                if (chess.isLegal(move, premove, gs.room.game.getMoveRules()))
                    annotateSquare(id, r, c, ["legal-move"]);
            }
        }
    }
}

function arrowPointsEqual(a: BoardArrow, b: BoardArrow): boolean {
    return positionsEqual(a.from, b.from) && positionsEqual(a.to, b.to);
}

function toggleArrowMark(boardID: number, from: BoardPosition, to: BoardPosition) {
    const arrows = getVisualChess(boardID).marks.arrows;
    const arrow = { from, to };
    const existingIndex = arrows.findIndex((current) =>
        arrowPointsEqual(current, arrow),
    );

    if (existingIndex >= 0) arrows.splice(existingIndex, 1);
    else arrows.push(arrow);
}

function getVisualSquareCenter(
    boardID: number,
    pos: BoardPosition,
): { x: number; y: number } {
    const flipped = isFlipped(boardID);
    const visualRow = flipped ? 7 - pos.row : pos.row;
    const visualCol = flipped ? 7 - pos.col : pos.col;

    return {
        x: (visualCol + 0.5) * 12.5,
        y: (visualRow + 0.5) * 12.5,
    };
}

function updateArrowAnnotations(boardID: number): void {
    const boardElement = document.querySelector(
        `.board[data-id="${boardID}"]`,
    ) as HTMLElement;
    const arrowLayer = boardElement.querySelector(
        ".arrow-annotations",
    ) as SVGSVGElement;

    const existingArrows = arrowLayer.querySelectorAll(".annotation-arrow");
    for (const arrow of existingArrows) arrow.remove();

    for (const arrow of getVisualChess(boardID).marks.arrows) {
        const from = getVisualSquareCenter(boardID, arrow.from);
        const to = getVisualSquareCenter(boardID, arrow.to);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length === 0) continue;

        const unitX = dx / length;
        const unitY = dy / length;
        const normalX = -unitY;
        const normalY = unitX;
        const shaftHalfWidth = 1.3;
        const headLength = Math.min(4.2, length * 0.34);
        const headHalfWidth = headLength;
        const headBaseX = to.x - unitX * headLength;
        const headBaseY = to.y - unitY * headLength;

        const polygon = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "polygon",
        );
        polygon.classList.add("annotation-arrow");
        polygon.setAttribute(
            "points",
            [
                [
                    from.x + normalX * shaftHalfWidth,
                    from.y + normalY * shaftHalfWidth,
                ],
                [
                    headBaseX + normalX * shaftHalfWidth,
                    headBaseY + normalY * shaftHalfWidth,
                ],
                [
                    headBaseX + normalX * headHalfWidth,
                    headBaseY + normalY * headHalfWidth,
                ],
                [to.x, to.y],
                [
                    headBaseX - normalX * headHalfWidth,
                    headBaseY - normalY * headHalfWidth,
                ],
                [
                    headBaseX - normalX * shaftHalfWidth,
                    headBaseY - normalY * shaftHalfWidth,
                ],
                [
                    from.x - normalX * shaftHalfWidth,
                    from.y - normalY * shaftHalfWidth,
                ],
            ]
                .map(([x, y]) => `${x},${y}`)
                .join(" "),
        );
        arrowLayer.append(polygon);
    }
}

// MARK: Audio Handlers

function playMoveSound(type: MoveType): void {
    switch (type) {
        case MoveType.CAPTURE:
            playSound("capture");
            break;
        case MoveType.CASTLE:
            playSound("castle");
            break;
        case MoveType.NORMAL:
        case MoveType.PROMOTION:
        case MoveType.PREMOVE:
            playSound("move");
            break;
    }
}

export function rememberLastMove(boardID: number, move: Move): void {
    const chess = gs.room.game.matches[boardID]?.chess;
    const fromPiece = chess?.getPiece(move.from);
    const toPiece = chess?.getPiece(move.to);
    const suppressTravel = shouldSuppressMoveAnimation(boardID, move);

    lastMoves.set(boardID, move);
    lastMoveAnimationPieces.set(boardID, {
        from: fromPiece ? { ...fromPiece } : undefined,
        to: toPiece ? { ...toPiece } : undefined,
        suppressTravel,
    });
    const serial = nextMoveAnimationSerial++;
    lastMoveAnimationSerials.set(boardID, serial);
    if (suppressTravel && !isAccoladeCombination(fromPiece, toPiece)) {
        animatedMoveSerials.set(boardID, serial);
        return;
    }

    animatedMoveSerials.delete(boardID);
}

export function clearLastMoves(): void {
    lastMoves.clear();
    lastMoveAnimationSerials.clear();
    animatedMoveSerials.clear();
    suppressedMoveAnimations.clear();
    lastMoveAnimationPieces.clear();
    closePromotionDialog();
}

// MARK: Mouse Handlers

function handleMouseMove(event: MouseEvent): void {
    if (!selected?.dragElement) return;

    event.preventDefault();

    const centerOffsetX = selected.dragElement.offsetWidth / 2;
    const centerOffsetY = selected.dragElement.offsetHeight / 2;

    selected.dragElement.style.left = `${event.clientX - centerOffsetX}px`;
    selected.dragElement.style.top = `${event.clientY - centerOffsetY}px`;
}

function handleSquareMouseDown(event: MouseEvent): void {
    if (pendingPromotion) return;

    const square = event.currentTarget as HTMLElement;

    const { pos, id } = getPositionFromElement(square);

    if (event.button === 2) {
        event.preventDefault();
        if (pos.loc === "board") rightDragStart = { boardID: id, pos };
        deselectPiece();
        return;
    }

    if (gs.settings.movementMode === "click" && selected?.dragElement)
        dropSelectedPiece();

    const board = getVisualChess(id).chess;
    const targetPiece = board.getPiece(pos);

    event.preventDefault();

    const canSelectTarget =
        targetPiece &&
        isMyPiece(id, targetPiece) &&
        (gs.settings.premoves || board.turn === targetPiece.color);

    if (selected?.boardID === id) {
        const moved =
            gs.settings.movementMode !== "drag" && attemptMove(id, pos);
        if (moved) return;

        if (canSelectTarget) {
            selectPiece(id, pos);
            if (gs.settings.movementMode !== "click") holdPiece(event);
        } else {
            deselectPiece();
        }
        return;
    }

    if (canSelectTarget) {
        selectPiece(id, pos);
        if (gs.settings.movementMode !== "click") holdPiece(event);
    } else {
        deselectPiece();
    }
}

function handleSquareMouseUp(event: MouseEvent): void {
    if (pendingPromotion) return;

    const square = event.currentTarget as HTMLElement;
    const { pos, id } = getPositionFromElement(square);

    if (event.button === 2) {
        event.preventDefault();
        if (pos.loc === "board") finishRightAnnotation(id, pos);
        return;
    }

    if (!selected) return;
    if (selected.boardID !== id) return;

    event.preventDefault();

    const move: Move = {
        from: selected.pos,
        to: pos,
    };

    const board = getVisualChess(id).chess;
    const premove = board.turn !== board.getPiece(move.from)?.color;
    if (premove && !gs.settings.premoves) {
        dropSelectedPiece();
        return;
    }
    const result = board.isLegal(move, premove, gs.room.game.getMoveRules());

    if (result && gs.settings.movementMode !== "click") {
        // Check if this is a promotion move
        if (
            pos.loc === "board" &&
            selected.piece.type === PieceType.PAWN &&
            pos.row === (selected.piece.color ? 0 : 7)
        ) {
            if (gs.settings.autoQueen) {
                move.promotion = PieceType.QUEEN;
                suppressMoveAnimation(id, move);
                executeMove(id, move, premove);
            } else {
                showPromotionDialog(
                    id,
                    pos,
                    selected.piece.color,
                    (pieceType) => {
                        move.promotion = pieceType;
                        suppressMoveAnimation(id, move);
                        executeMove(id, move, premove);
                    },
                    deselectPiece,
                );
            }
            return;
        }

        suppressMoveAnimation(id, move);
        executeMove(id, move, premove);
    } else if (!selected.justSelected && positionsEqual(selected.pos, pos)) {
        deselectPiece();
    } else {
        dropSelectedPiece();
    }
}

function handleSquareRightClick(event: MouseEvent): void {
    event.preventDefault(); // Prevent the default context menu
}

function finishRightAnnotation(id: number, pos: BoardPosition): void {
    if (gs.room.game.matches[id].queued.moves.length > 0) {
        gs.room.game.matches[id].queued.moves = [];
        resetMarks(id);
        updateUIChess(id);
    } else if (
        rightDragStart?.boardID === id &&
        positionsEqual(rightDragStart.pos, pos)
    ) {
        const marked = getVisualChess(id).marks.marked;
        marked[pos.row][pos.col] = !marked[pos.row][pos.col];
        updateAnnotations(id);
    } else if (rightDragStart?.boardID === id) {
        toggleArrowMark(id, rightDragStart.pos, pos);
        updateAnnotations(id);
    }

    rightDragStart = undefined;
}

function handlePocketMouseDown(event: MouseEvent): void {
    if (pendingPromotion) return;

    const target = event.target as HTMLElement;
    const { pos, id } = getPositionFromElement(target);

    event.preventDefault();

    selectPiece(id, pos);
    if (
        !gs.settings.premoves &&
        getVisualChess(id).chess.turn !== selected?.piece.color
    ) {
        deselectPiece();
        return;
    }
    if (gs.settings.movementMode !== "click") holdPiece(event);
}

function handlePocketMouseUp(event: MouseEvent): void {
    if (pendingPromotion) return;

    const target = event.target as HTMLElement;
    if (!selected) return;
    const { pos, id } = getPositionFromElement(target);
    if (selected.boardID !== id) return;

    event.preventDefault();

    if (!selected.justSelected && positionsEqual(selected.pos, pos))
        deselectPiece();
    else dropSelectedPiece();
}
