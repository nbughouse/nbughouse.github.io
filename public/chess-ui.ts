import type { MoveType } from "../shared/chess";
import {
    type BoardPosition,
    type Chess,
    Color,
    createPosition,
    type Move,
    type Piece,
    PieceType,
    type Position,
    positionsEqual,
} from "../shared/chess";
import { RoomStatus } from "../shared/room";
import { playAudio } from "./game-ui";
import { visualFlipped } from "./match-ui";
import { gs } from "./session";

const PIECE_IMAGES = {
    K: "/pieces/wk.png",
    Q: "/pieces/wq.png",
    R: "/pieces/wr.png",
    B: "/pieces/wb.png",
    N: "/pieces/wn.png",
    P: "/pieces/wp.png",
    k: "/pieces/bk.png",
    q: "/pieces/bq.png",
    r: "/pieces/br.png",
    b: "/pieces/bb.png",
    n: "/pieces/bn.png",
    p: "/pieces/bp.png",
};

// MARK: Global Variables

let selected:
    | {
          boardID: number;
          pos: Position;
          piece: Piece;
          justSelected: boolean;
          dragElement: HTMLImageElement | undefined;
      }
    | undefined;

let promotionCallback: ((pieceType: PieceType) => void) | undefined;

interface BoardMarks {
    marked: boolean[][];
    premoved: boolean[][];
}

interface VisualChessState {
    chess: Chess;
    marks: BoardMarks;
}

const visualChessStates: Map<number, VisualChessState> = new Map();

// MARK: Visual Chess State

function resetMarks(matchIndex: number): void {
    visualChessStates.get(matchIndex)!.marks = {
        marked: Array.from({ length: 8 }, () =>
            Array.from({ length: 8 }, () => false),
        ),
        premoved: Array.from({ length: 8 }, () =>
            Array.from({ length: 8 }, () => false),
        ),
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

function getPieceImagePath(piece: Piece): string {
    /**
     * K, Q, R, B, N, P (excludes Q+).
     */
    const baseKey = piece.type.charAt(0);
    const key = piece.color ? baseKey.toUpperCase() : baseKey.toLowerCase();

    return PIECE_IMAGES[key as keyof typeof PIECE_IMAGES];
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

function getPieceElement(id: number, pos: Position): HTMLImageElement {
    if (pos.loc === "board") {
        const square = getSquareElement(id, pos);
        return square.querySelector("img") as HTMLImageElement;
    }

    return document.querySelector(
        `img[data-id="${id}"][data-loc="pocket"][data-type="${pos.type}"][data-color="${pos.color}"]`,
    ) as HTMLImageElement;
}

// MARK: Element Creation

export function createBoardElement(id: number): HTMLDivElement {
    const board = document.createElement("div");

    board.className = "board";
    board.dataset.id = id.toString();

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement("div");

            square.className = `square ${
                (row + col) % 2 === 0 ? "light" : "dark"
            }`;
            setPositionToElement(square, id, createPosition(row, col));

            square.addEventListener("mousedown", handleSquareMouseDown);
            square.addEventListener("mouseup", handleSquareMouseUp);
            square.addEventListener("contextmenu", handleSquareRightClick);

            board.append(square);
        }
    }

    return board;
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
    color: Color,
    callback: (pieceType: PieceType) => void,
): void {
    promotionCallback = callback;

    const dialog = document.createElement("div");
    dialog.className = "promotion-dialog";
    dialog.id = `promotion-dialog-${boardID}`;

    const pieces = [
        PieceType.QUEEN,
        PieceType.ROOK,
        PieceType.BISHOP,
        PieceType.KNIGHT,
    ];

    for (const pieceType of pieces) {
        const pieceButton = document.createElement("img");
        pieceButton.src = getPieceImagePath({ type: pieceType, color });
        pieceButton.className = "promotion-option";
        pieceButton.addEventListener("click", () => {
            handlePromotionChoice(pieceType);
        });
        dialog.append(pieceButton);
    }

    document.body.append(dialog);
}

function handlePromotionChoice(pieceType: PieceType): void {
    const dialog = document.querySelector(".promotion-dialog");
    if (dialog) dialog.remove();

    if (promotionCallback) {
        promotionCallback(pieceType);
        promotionCallback = undefined;
    }
}

// MARK: Piece Selection

function holdPiece(mouseEvent: MouseEvent): void {
    if (!selected) return;

    dropSelectedPiece();

    const pieceImg = getPieceElement(selected.boardID, selected.pos);

    const dragImg = document.createElement("img");

    dragImg.src = pieceImg.src;
    dragImg.className = "dragged-piece";
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

    if (!premove) gs.socket.emit("move-board", id, selected!.piece.color, move);

    gs.room.game.matches[id].queued.color = selected!.piece.color;
    gs.room.game.matches[id].queued.moves.push(move);

    playMoveSound(board.getLegalMoveType(move, premove));

    deselectPiece();
}

function attemptMove(id: number, to: Position): void {
    if (!selected || selected.boardID !== id) return;

    const move: Move = {
        from: selected.pos,
        to,
    };

    const board = getVisualChess(id).chess;
    const premove = board.turn !== board.getPiece(move.from)?.color;

    if (!board.isLegal(move, premove)) return;

    // Check if this is a promotion move
    if (
        to.loc === "board" &&
        selected.piece.type === PieceType.PAWN &&
        to.row === (selected.piece.color ? 0 : 7)
    ) {
        showPromotionDialog(id, selected.piece.color, (pieceType) => {
            move.promotion = pieceType;
            executeMove(id, move, premove);
        });
        return;
    }

    executeMove(id, move, premove);
}

// MARK: UI Update Funcs

export function updateUIChess(id: number): void {
    updateVisualChessState(id);

    const chess = getVisualChess(id).chess;

    const squares = document.querySelectorAll(`.square[data-id="${id}"]`);
    const flipped = isFlipped(id);

    for (const [index, square] of squares.entries()) {
        const element = square as HTMLElement;

        const visualRow = Math.floor(index / 8);
        const visualCol = index % 8;

        const row = flipped ? 7 - visualRow : visualRow;
        const col = flipped ? 7 - visualCol : visualCol;
        const pos = createPosition(row, col);

        setPositionToElement(element, id, pos);

        element.innerHTML = "";

        const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

        if (visualCol === 0) {
            const rankLabel = document.createElement("div");

            rankLabel.className = "rank-label";
            rankLabel.textContent = (8 - row).toString();
            element.append(rankLabel);
        }

        if (visualRow === 7) {
            const fileLabel = document.createElement("div");
            fileLabel.className = "file-label";
            fileLabel.textContent = files[col];
            element.append(fileLabel);
        }

        const piece = chess.getPiece(pos);
        if (piece) {
            const img = document.createElement("img");

            img.src = getPieceImagePath(piece);
            img.className = "piece";

            const isMyTurn = chess.turn === piece.color;
            const isMyPiece =
                gs.room.status === RoomStatus.PLAYING &&
                gs.room.game.matches[id].getPlayer(piece.color)?.id ===
                    gs.player.id;

            element.style.cursor = isMyTurn && isMyPiece ? "grab" : "default";

            // Hide piece if it's currently selected and being held
            if (
                selected &&
                selected.dragElement &&
                selected.boardID === id &&
                positionsEqual(selected.pos, pos)
            )
                img.style.opacity = "0";

            img.addEventListener("dragstart", () => false);
            element.append(img);
        } else {
            element.style.cursor = "default";
        }
    }

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

function updatePocket(
    id: string,
    pieces: Map<PieceType, number>,
    color: Color,
    boardID: number,
): void {
    const pocket = document.querySelector(`#${id}-${boardID}`) as HTMLElement;

    pocket.innerHTML = "";
    pocket.dataset.id = boardID.toString();

    const pieceOrder = [
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

            const img = document.createElement("img");

            img.src = getPieceImagePath({ type: pieceType, color });
            setPositionToElement(img, boardID, {
                loc: "pocket",
                type: pieceType,
                color,
            });
            img.addEventListener("dragstart", () => false);

            if (isMyPiece) {
                img.style.cursor = "grab";
                img.addEventListener("mousedown", handlePocketMouseDown);
                img.addEventListener("mouseup", handlePocketMouseUp);
            } else {
                img.style.cursor = "default";
            }

            pieceElement.append(img);

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
    const boardElement = document.querySelector(
        `.board[data-id="${id}"]`,
    ) as HTMLElement;
    const squares = boardElement.querySelectorAll(`.square`);

    for (const square of squares) {
        const element = square as HTMLElement;

        element.classList.remove(
            "highlight",
            "legal-move",
            "has-piece",
            "premoved",
            "marked",
        );
    }

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

    // Show legal moves
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const move = { from: pos, to: createPosition(r, c) };
            if (chess.isLegal(move, premove))
                annotateSquare(id, r, c, ["legal-move"]);
        }
    }
}

// MARK: Audio Handlers

function playMoveSound(type: MoveType): void {
    playAudio("move-" + type + ".mp3");
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
    const square = event.currentTarget as HTMLElement;

    const { pos, id } = getPositionFromElement(square);

    const board = getVisualChess(id).chess;
    const targetPiece = board.getPiece(pos);

    event.preventDefault();

    if (selected?.boardID === id) {
        attemptMove(id, pos);
        return;
    }

    if (targetPiece && isMyPiece(id, targetPiece)) {
        selectPiece(id, pos);
        holdPiece(event);
    } else {
        deselectPiece();
    }
}

function handleSquareMouseUp(event: MouseEvent): void {
    const square = event.currentTarget as HTMLElement;
    if (!selected) return;
    const { pos, id } = getPositionFromElement(square);
    if (selected.boardID !== id) return;

    event.preventDefault();

    const move: Move = {
        from: selected.pos,
        to: pos,
    };

    const board = getVisualChess(id).chess;
    const premove = board.turn !== board.getPiece(move.from)?.color;
    const result = board.isLegal(move, premove);

    if (result) {
        // Check if this is a promotion move
        if (
            pos.loc === "board" &&
            selected.piece.type === PieceType.PAWN &&
            pos.row === (selected.piece.color ? 0 : 7)
        ) {
            showPromotionDialog(id, selected.piece.color, (pieceType) => {
                move.promotion = pieceType;
                executeMove(id, move, premove);
            });
            return;
        }

        executeMove(id, move, premove);
    } else if (!selected.justSelected && positionsEqual(selected.pos, pos)) {
        deselectPiece();
    } else {
        dropSelectedPiece();
    }
}

function handleSquareRightClick(event: MouseEvent): void {
    event.preventDefault(); // Prevent the default context menu

    const square = event.currentTarget as HTMLElement;
    const { id, pos } = getPositionFromElement(square);

    if (pos.loc !== "board") return;

    deselectPiece();

    if (gs.room.game.matches[id].queued.moves.length > 0) {
        gs.room.game.matches[id].queued.moves = [];
        resetMarks(id);
        updateUIChess(id);
    } else {
        const marked = getVisualChess(id).marks.marked;
        marked[pos.row][pos.col] = !marked[pos.row][pos.col];
        updateAnnotations(id);
    }
}

function handlePocketMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const { pos, id } = getPositionFromElement(target);

    event.preventDefault();

    selectPiece(id, pos);
    holdPiece(event);
}

function handlePocketMouseUp(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!selected) return;
    const { pos, id } = getPositionFromElement(target);
    if (selected.boardID !== id) return;

    event.preventDefault();

    if (!selected.justSelected && positionsEqual(selected.pos, pos))
        deselectPiece();
    else dropSelectedPiece();
}
