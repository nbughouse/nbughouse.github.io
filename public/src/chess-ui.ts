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
import { playSound } from "./sound-ui";
import { visualFlipped } from "./match-ui";
import { gs } from "./session";
import { getAssetPath } from "./app-paths";
import { boardThemes } from "./settings";
import { BoardPieceRenderer, type PieceTarget } from "./piece-motion";

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
const boardPieceRenderers = new Map<number, {
    board: HTMLElement;
    renderer: BoardPieceRenderer;
}>();
const visualMoves = new Map<number, { move: Move; suppressTravel: boolean }>();
const cooldownRefreshTimers: Map<number, number> = new Map();

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

function clearManualAnnotations(matchIndex: number): void {
    const marks = visualChessStates.get(matchIndex)?.marks;
    if (!marks) return;

    marks.marked = Array.from({ length: 8 }, () =>
        Array.from({ length: 8 }, () => false),
    );
    marks.arrows = [];
    updateAnnotations(matchIndex);
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
        piece.type !== PieceType.DUCK &&
        !getVisualChess(boardID).chess.duckPending &&
        gs.room.status === RoomStatus.PLAYING &&
        gs.room.game.matches[boardID].getPlayer(piece.color)?.id ===
            gs.player.id
    );
}

function canUsePositionNow(boardID: number, pos: Position): boolean {
    if (!gs.room.game.getMoveRules().turnless) return true;
    return getVisualChess(boardID).chess.canMoveFrom(pos, Date.now());
}

function getPieceClassNames(piece: Piece): string[] {
    const pieceClassByType: Record<PieceType, string> = {
        [PieceType.DUCK]: "duck",
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

function updatePieceElement(element: HTMLElement, piece: Piece): void {
    const replacement = createPieceElement(piece);
    element.className = replacement.className;
    element.dataset.pieceType = piece.type;
    element.dataset.pieceColor = piece.color.toString();
    if (piece.combinedWith) element.dataset.combinedWith = piece.combinedWith;
    else delete element.dataset.combinedWith;
    element.replaceChildren(...Array.from(replacement.childNodes));

    const duration = getPieceAnimationDuration();
    const badge = element.querySelector<HTMLElement>(".accolade-badge");
    if (badge && duration > 0)
        badge.animate([
            { transform: "scale(0.25) rotate(-14deg)", opacity: 0 },
            { transform: "scale(1) rotate(0)", opacity: 1 },
        ], { duration, easing: "cubic-bezier(0.2, 0.9, 0.25, 1.35)" });
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

function syncSquareCooldownOverlay(
    square: HTMLElement,
    readyAt: number,
    duration: number,
): void {
    let overlay = square.querySelector<HTMLElement>(
        ":scope > .cooldown-overlay",
    );

    if (readyAt <= Date.now()) {
        overlay?.remove();
        return;
    }

    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "cooldown-overlay";
        overlay.setAttribute("aria-hidden", "true");
        square.append(overlay);
    }

    const remaining = readyAt - Date.now();
    const progress = Number.isFinite(readyAt)
        ? Math.min(1, Math.max(0, remaining / Math.max(1, duration)))
        : 1;

    overlay.style.transition = "none";
    overlay.style.transform = `scaleY(${progress})`;

    if (!Number.isFinite(readyAt)) return;

    // Commit the current fill before starting the drain toward zero.
    void overlay.offsetHeight;
    overlay.style.transition = `transform ${Math.max(0, remaining)}ms linear`;
    overlay.style.transform = "scaleY(0)";
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
    ] as const;

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
    if (!canUsePositionNow(id, pos)) return;

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

function executeMove(
    id: number,
    move: Move,
    premove: boolean,
    suppressTravel = false,
): void {
    const board = getVisualChess(id).chess;
    const rules = gs.room.game.getMoveRules();
    if (rules.turnless) premove = false;

    const color = selected?.piece.color ?? board.turn;
    if (!premove) gs.socket.emit("move-board", id, color, move);

    gs.room.game.matches[id].queued.color = color;
    gs.room.game.matches[id].queued.moves.push(move);
    visualMoves.set(id, { move, suppressTravel });

    playMoveSound(board.getLegalMoveType(move, premove, rules));

    dropSelectedPiece();
    selected = undefined;
    updateUIChess(id);
}

function attemptMove(id: number, to: Position): boolean {
    if (!selected || selected.boardID !== id) return false;

    const move: Move = {
        from: selected.pos,
        to,
    };

    const board = getVisualChess(id).chess;
    const rules = gs.room.game.getMoveRules();
    const premove =
        !rules.turnless && board.turn !== board.getPiece(move.from)?.color;

    if (rules.duck && premove) return false;
    if (premove && !gs.settings.premoves) return false;
    if (!canUsePositionNow(id, move.from)) return false;
    if (!board.isLegal(move, premove, rules)) return false;

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

    const duckPending = !!gs.room.game.getMoveRules().duck && chess.duckPending;
    const canPlaceDuck = duckPending && gs.room.status === RoomStatus.PLAYING &&
        gs.room.game.matches[id].getPlayer(chess.turn)?.id === gs.player.id;
    boardElement.classList.toggle("duck-placement", canPlaceDuck);
    let prompt = boardElement.querySelector<HTMLElement>(".duck-placement-prompt");
    if (duckPending) {
        if (!prompt) {
            prompt = document.createElement("div");
            prompt.className = "duck-placement-prompt";
            prompt.setAttribute("role", "status");
            boardElement.append(prompt);
        }
        prompt.textContent = `${chess.turn === Color.WHITE ? "White" : "Black"}: place the duck`;
    } else prompt?.remove();

    const squares = boardElement.querySelectorAll(`.square`);
    const flipped = isFlipped(id);
    const targets: PieceTarget[] = [];

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
            const isMyPiece = piece.type !== PieceType.DUCK && !duckPending &&
                gs.room.status === RoomStatus.PLAYING &&
                gs.room.game.matches[id].getPlayer(piece.color)?.id ===
                    gs.player.id;
            const cooling = !canUsePositionNow(id, pos);

            const canMoveNow =
                isMyPiece &&
                !cooling &&
                (gs.room.game.getMoveRules().turnless ||
                    isMyTurn ||
                    (!gs.room.game.getMoveRules().duck && gs.settings.premoves));
            element.style.cursor =
                canMoveNow && gs.settings.movementMode !== "click"
                    ? "grab"
                    : "default";
            element.classList.toggle("cooling", cooling);
            syncSquareCooldownOverlay(
                element,
                chess.getBoardCooldown(pos),
                gs.room.game.config.pieceCooldown * 1000,
            );

            const hidden = Boolean(
                selected &&
                    selected.dragElement &&
                    selected.boardID === id &&
                    positionsEqual(selected.pos, pos),
            );
            targets.push({ pos, piece, square: element, hidden });
        } else {
            element.style.cursor = canPlaceDuck ? "pointer" : "default";
            element.classList.remove("cooling");
            syncSquareCooldownOverlay(element, 0, 0);
        }
    }

    let rendered = boardPieceRenderers.get(id);
    if (rendered?.board !== boardElement) {
        rendered?.renderer.clear();
        rendered = {
            board: boardElement,
            renderer: new BoardPieceRenderer(createPieceElement, updatePieceElement),
        };
        boardPieceRenderers.set(id, rendered);
    }
    const visualMove = visualMoves.get(id);
    visualMoves.delete(id);
    rendered.renderer.render(targets, getPieceAnimationDuration(),
        visualMove?.move, visualMove?.suppressTravel);

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
    scheduleCooldownRefresh(id);
}

function getPieceAnimationDuration(): number {
    const speed = gs.settings.pieceAnimationSpeed;
    return speed > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? Math.round(300 / speed) : 0;
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
            const pos: Position = {
                loc: "pocket",
                type: pieceType,
                color,
            };
            const cooling = !canUsePositionNow(boardID, pos);
            pieceElement.classList.toggle("cooling", cooling);

            const pieceView = createPieceElement({ type: pieceType, color });

            setPositionToElement(pieceView, boardID, pos);
            pieceView.addEventListener("dragstart", () => false);

            if (isMyPiece && !cooling) {
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

function scheduleCooldownRefresh(boardID: number): void {
    window.clearTimeout(cooldownRefreshTimers.get(boardID));
    cooldownRefreshTimers.delete(boardID);

    const chess = gs.room.game.matches[boardID]?.chess;
    if (!chess) return;

    const now = Date.now();
    let nextReadyAt = Infinity;
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const readyAt = chess.boardCooldowns[row][col];
            if (readyAt > now && readyAt < nextReadyAt) nextReadyAt = readyAt;
        }
    }

    for (const readyAt of [chess.whitePocketCooldown, chess.blackPocketCooldown])
        if (readyAt > now && readyAt < nextReadyAt) nextReadyAt = readyAt;

    if (!Number.isFinite(nextReadyAt)) return;

    cooldownRefreshTimers.set(
        boardID,
        window.setTimeout(() => {
            cooldownRefreshTimers.delete(boardID);
            updateUIChess(boardID);
        }, Math.max(0, nextReadyAt - now) + 25),
    );
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
    if (chess.duckPending && gs.room.game.getMoveRules().duck &&
        gs.room.status === RoomStatus.PLAYING &&
        gs.room.game.matches[id].getPlayer(chess.turn)?.id === gs.player.id &&
        gs.settings.showLegalMoves) {
        for (let row = 0; row < 8; row++)
            for (let col = 0; col < 8; col++)
                if (!chess.getPiece(createPosition(row, col)))
                    annotateSquare(id, row, col, ["legal-move"]);
    }
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

    const rules = gs.room.game.getMoveRules();
    const premove =
        !rules.turnless && chess.getPiece(pos)?.color !== chess.turn;

    if (
        gs.settings.showLegalMoves &&
        canUsePositionNow(id, pos) &&
        (!premove || gs.settings.premoves)
    ) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const move = { from: pos, to: createPosition(r, c) };
                if (chess.isLegal(move, premove, rules))
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
    const tileLength = 12.5;
    const startOffset = tileLength * 0.35;
    const shaftWidth = tileLength * 0.25;
    const headWidth = tileLength * 0.55;
    const headLength = tileLength * 0.4;

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
        const startX = from.x + unitX * startOffset;
        const startY = from.y + unitY * startOffset;
        const shaftHalfWidth = shaftWidth / 2;
        const headHalfWidth = headWidth / 2;
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
                    startX + normalX * shaftHalfWidth,
                    startY + normalY * shaftHalfWidth,
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
                    startX - normalX * shaftHalfWidth,
                    startY - normalY * shaftHalfWidth,
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
    lastMoves.set(boardID, move);
    visualMoves.set(boardID, { move, suppressTravel: false });
}

export function clearLastMoves(): void {
    lastMoves.clear();
    visualMoves.clear();
    for (const { renderer } of boardPieceRenderers.values()) renderer.clear();
    boardPieceRenderers.clear();
    for (const timer of cooldownRefreshTimers.values())
        window.clearTimeout(timer);
    cooldownRefreshTimers.clear();
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

    clearManualAnnotations(id);

    if (gs.settings.movementMode === "click" && selected?.dragElement)
        dropSelectedPiece();

    const board = getVisualChess(id).chess;
    const targetPiece = board.getPiece(pos);

    event.preventDefault();

    if (event.button !== 0) return;
    if (gs.room.game.getMoveRules().duck && board.duckPending) {
        if (gs.room.status !== RoomStatus.PLAYING ||
            gs.room.game.matches[id].getPlayer(board.turn)?.id !== gs.player.id) return;
        const move = { from: createPosition(board.turn, PieceType.DUCK), to: pos };
        if (board.isLegal(move, false, gs.room.game.getMoveRules())) {
            deselectPiece();
            executeMove(id, move, false);
        }
        return;
    }

    const canSelectTarget =
        targetPiece &&
        isMyPiece(id, targetPiece) &&
        canUsePositionNow(id, pos) &&
        (gs.room.game.getMoveRules().turnless ||
            (!gs.room.game.getMoveRules().duck && gs.settings.premoves) ||
            board.turn === targetPiece.color);

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
    const rules = gs.room.game.getMoveRules();
    const premove =
        !rules.turnless && board.turn !== board.getPiece(move.from)?.color;
    if (rules.duck && premove) {
        dropSelectedPiece();
        return;
    }
    if (premove && !gs.settings.premoves) {
        dropSelectedPiece();
        return;
    }
    if (!canUsePositionNow(id, move.from)) {
        dropSelectedPiece();
        return;
    }
    const result = board.isLegal(move, premove, rules);

    if (result && gs.settings.movementMode !== "click") {
        // Check if this is a promotion move
        if (
            pos.loc === "board" &&
            selected.piece.type === PieceType.PAWN &&
            pos.row === (selected.piece.color ? 0 : 7)
        ) {
            if (gs.settings.autoQueen) {
                move.promotion = PieceType.QUEEN;
                executeMove(id, move, premove, true);
            } else {
                showPromotionDialog(
                    id,
                    pos,
                    selected.piece.color,
                    (pieceType) => {
                        move.promotion = pieceType;
                        executeMove(id, move, premove, true);
                    },
                    deselectPiece,
                );
            }
            return;
        }

        executeMove(id, move, premove, true);
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

    if (gs.room.game.getMoveRules().duck &&
        (getVisualChess(id).chess.duckPending ||
            (pos.loc === "pocket" && pos.color !== getVisualChess(id).chess.turn))) return;

    event.preventDefault();

    clearManualAnnotations(id);

    selectPiece(id, pos);
    if (
        !gs.room.game.getMoveRules().turnless &&
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
