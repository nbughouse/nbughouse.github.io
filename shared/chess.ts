export interface SerializedChess {
    board: Board;
    whitePocket: Record<PieceType, number>;
    blackPocket: Record<PieceType, number>;
    turn: Color;
    whiteCastleShort: boolean;
    whiteCastleLong: boolean;
    blackCastleShort: boolean;
    blackCastleLong: boolean;
    enPassantTarget: BoardPosition | undefined;
}

export class Chess {
    board: Board = [];
    whitePocket: Map<PieceType, number> = new Map();
    blackPocket: Map<PieceType, number> = new Map();
    turn: Color = Color.WHITE;
    whiteCastleShort: boolean = true;
    whiteCastleLong: boolean = true;
    blackCastleShort: boolean = true;
    blackCastleLong: boolean = true;
    enPassantTarget: BoardPosition | undefined = undefined;

    constructor() {
        this.reset();
    }

    clone(): Chess {
        const chess = new Chess();
        chess.board = this.board.map((row) => [...row]);
        chess.whitePocket = new Map(this.whitePocket);
        chess.blackPocket = new Map(this.blackPocket);
        chess.turn = this.turn;
        chess.whiteCastleShort = this.whiteCastleShort;
        chess.whiteCastleLong = this.whiteCastleLong;
        chess.blackCastleShort = this.blackCastleShort;
        chess.blackCastleLong = this.blackCastleLong;
        chess.enPassantTarget = this.enPassantTarget;
        return chess;
    }

    serialize(): SerializedChess {
        return {
            board: this.board,
            whitePocket: Object.fromEntries(this.whitePocket) as Record<
                PieceType,
                number
            >,
            blackPocket: Object.fromEntries(this.blackPocket) as Record<
                PieceType,
                number
            >,
            turn: this.turn,
            whiteCastleShort: this.whiteCastleShort,
            whiteCastleLong: this.whiteCastleLong,
            blackCastleShort: this.blackCastleShort,
            blackCastleLong: this.blackCastleLong,
            enPassantTarget: this.enPassantTarget,
        };
    }

    static deserialize(data: SerializedChess): Chess {
        const chess = new Chess();
        chess.board = data.board;
        chess.whitePocket = new Map();
        for (const [key, value] of Object.entries(data.whitePocket))
            chess.whitePocket.set(key as PieceType, value);

        chess.blackPocket = new Map();
        for (const [key, value] of Object.entries(data.blackPocket))
            chess.blackPocket.set(key as PieceType, value);

        chess.turn = data.turn;
        chess.whiteCastleShort = data.whiteCastleShort;
        chess.whiteCastleLong = data.whiteCastleLong;
        chess.blackCastleShort = data.blackCastleShort;
        chess.blackCastleLong = data.blackCastleLong;
        chess.enPassantTarget = data.enPassantTarget;
        return chess;
    }

    reset(): void {
        this.whitePocket = new Map();
        this.blackPocket = new Map();
        this.turn = Color.WHITE;
        this.whiteCastleShort = true;
        this.whiteCastleLong = true;
        this.blackCastleShort = true;
        this.blackCastleLong = true;
        this.enPassantTarget = undefined;
        this.board = createEmptyBoard();

        const backRank: PieceType[] = [
            PieceType.ROOK,
            PieceType.KNIGHT,
            PieceType.BISHOP,
            PieceType.QUEEN,
            PieceType.KING,
            PieceType.BISHOP,
            PieceType.KNIGHT,
            PieceType.ROOK,
        ];

        for (let index = 0; index < 8; index++) {
            this.board[0][index] = {
                type: backRank[index],
                color: Color.BLACK,
            };
            this.board[1][index] = { type: PieceType.PAWN, color: Color.BLACK };
            this.board[6][index] = { type: PieceType.PAWN, color: Color.WHITE };
            this.board[7][index] = {
                type: backRank[index],
                color: Color.WHITE,
            };
        }

        this.whitePocket = new Map();
        this.blackPocket = new Map();
    }

    getPocket(color: Color): Map<PieceType, number> {
        return color ? this.whitePocket : this.blackPocket;
    }

    getPiece(pos: Position): Piece | undefined {
        if (pos.loc === "board") {
            return this.board[pos.row][pos.col];
        } else {
            const pocket = this.getPocket(pos.color);
            const count = pocket.get(pos.type) || 0;
            return count > 0 ? { type: pos.type, color: pos.color } : undefined;
        }
    }

    addToPocket(piece: Piece): void {
        const pocket = this.getPocket(piece.color);
        const typeToAdd =
            piece.type === PieceType.PROMOTED_QUEEN
                ? PieceType.PAWN
                : piece.type;
        pocket.set(typeToAdd, (pocket.get(typeToAdd) || 0) + 1);
    }

    removeFromPocket(pieceType: PieceType, color: Color): boolean {
        const pocket = this.getPocket(color);
        const count = pocket.get(pieceType) || 0;
        if (count === 0) return false;
        pocket.set(pieceType, count - 1);
        if (count === 1) pocket.delete(pieceType);
        return true;
    }

    private findKing(color: Color): BoardPosition | undefined {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (
                    piece &&
                    piece.type === PieceType.KING &&
                    piece.color === color
                )
                    return { loc: "board", row, col };
            }
        }
        return undefined;
    }

    private isSquareAttacked(pos: BoardPosition, color: Color): boolean {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (
                    piece &&
                    piece.color === color &&
                    this.canPieceAttack({ loc: "board", row, col }, pos)
                )
                    return true;
            }
        }
        return false;
    }

    private canPieceAttack(from: BoardPosition, to: BoardPosition): boolean {
        const piece = this.board[from.row][from.col];
        if (!piece) return false;

        switch (piece.type) {
            case PieceType.PAWN: {
                const direction = piece.color ? -1 : 1;
                return (
                    Math.abs(from.col - to.col) === 1 &&
                    to.row - from.row === direction
                );
            }
            case PieceType.KNIGHT: {
                const dr = Math.abs(from.row - to.row);
                const dc = Math.abs(from.col - to.col);
                return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
            }
            case PieceType.BISHOP: {
                return this.isDiagonalPath(from, to);
            }
            case PieceType.ROOK: {
                return this.isStraightPath(from, to);
            }
            case PieceType.PROMOTED_QUEEN:
            case PieceType.QUEEN: {
                return (
                    this.isDiagonalPath(from, to) ||
                    this.isStraightPath(from, to)
                );
            }
            case PieceType.KING: {
                return (
                    Math.abs(from.row - to.row) <= 1 &&
                    Math.abs(from.col - to.col) <= 1
                );
            }
            default: {
                return false;
            }
        }
    }

    private isInCheck(color: Color): boolean {
        const kingPos = this.findKing(color);
        if (!kingPos) return false;
        return this.isSquareAttacked(
            kingPos,
            color ? Color.BLACK : Color.WHITE,
        );
    }

    private isPathClear(from: BoardPosition, to: BoardPosition): boolean {
        const rowStep = to.row > from.row ? 1 : to.row < from.row ? -1 : 0;
        const colStep = to.col > from.col ? 1 : to.col < from.col ? -1 : 0;

        let currentRow = from.row + rowStep;
        let currentCol = from.col + colStep;

        while (currentRow !== to.row || currentCol !== to.col) {
            if (this.board[currentRow][currentCol]) return false;
            currentRow += rowStep;
            currentCol += colStep;
        }

        return true;
    }

    private isDiagonalPath(from: BoardPosition, to: BoardPosition): boolean {
        return (
            Math.abs(from.row - to.row) === Math.abs(from.col - to.col) &&
            this.isPathClear(from, to)
        );
    }

    private isStraightPath(from: BoardPosition, to: BoardPosition): boolean {
        return (
            (from.row === to.row || from.col === to.col) &&
            this.isPathClear(from, to)
        );
    }

    private canCastle(color: Color, side: CastleMove): boolean {
        // Check if castling rights exist
        if (color) {
            if (side === CastleMove.SHORT && !this.whiteCastleShort)
                return false;
            if (side === CastleMove.LONG && !this.whiteCastleLong) return false;
        } else {
            if (side === CastleMove.SHORT && !this.blackCastleShort)
                return false;
            if (side === CastleMove.LONG && !this.blackCastleLong) return false;
        }

        // Check if king and rook are in place
        const row = color ? 7 : 0;
        const kingCol = 4;
        const rookCol = side === CastleMove.SHORT ? 7 : 0;
        const king = this.board[row][kingCol];
        const rook = this.board[row][rookCol];

        if (!king || king.type !== PieceType.KING || king.color !== color)
            return false;

        if (!rook || rook.type !== PieceType.ROOK || rook.color !== color)
            return false;

        if (this.isInCheck(color)) return false;

        // Check if squares are empty and not under attack
        const start = Math.min(kingCol, rookCol) + 1;
        const end = Math.max(kingCol, rookCol);
        const enemyColor = invertColor(color);
        const kingDestinationCol = side === CastleMove.SHORT ? 6 : 2;
        const step = side === CastleMove.SHORT ? 1 : -1;

        for (
            let col = kingCol;
            col !== kingDestinationCol + step;
            col += step
        ) {
            if (
                (col >= start && col < end && this.board[row][col]) ||
                this.isSquareAttacked({ loc: "board", row, col }, enemyColor)
            )
                return false;
        }
        return true;
    }

    private isEnPassantMove(from: BoardPosition, to: BoardPosition): boolean {
        if (!this.enPassantTarget) return false;
        const piece = this.board[from.row][from.col];
        if (!piece || piece.type !== PieceType.PAWN) return false;
        return (
            to.row === this.enPassantTarget.row &&
            to.col === this.enPassantTarget.col
        );
    }

    private isValidMovementPattern(
        piece: Piece,
        from: BoardPosition,
        to: BoardPosition,
        premove: boolean,
    ): boolean {
        switch (piece.type) {
            case PieceType.PAWN: {
                const direction = piece.color ? -1 : 1;

                // Forward moves
                if (from.col === to.col) {
                    // One square forward
                    if (to.row - from.row === direction)
                        return premove || !this.board[to.row][to.col];

                    // Two squares forward from starting position
                    if (to.row - from.row === 2 * direction) {
                        const startRow = piece.color ? 6 : 1;
                        if (from.row !== startRow) return false;

                        if (premove) return true;

                        const middleRow = from.row + direction;
                        return (
                            !this.board[middleRow][to.col] &&
                            !this.board[to.row][to.col]
                        );
                    }

                    return false;
                }

                // Diagonal captures
                if (
                    Math.abs(from.col - to.col) === 1 &&
                    to.row - from.row === direction
                ) {
                    if (premove) return true;
                    const targetPiece = this.board[to.row][to.col];
                    return !!targetPiece || this.isEnPassantMove(from, to);
                }

                return false;
            }

            case PieceType.KNIGHT: {
                const dr = Math.abs(from.row - to.row);
                const dc = Math.abs(from.col - to.col);
                return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
            }

            case PieceType.BISHOP: {
                const isDiagonal =
                    Math.abs(from.row - to.row) ===
                        Math.abs(from.col - to.col) && from.row !== to.row;
                return premove ? isDiagonal : this.isDiagonalPath(from, to);
            }

            case PieceType.ROOK: {
                const isStraight =
                    (from.row === to.row || from.col === to.col) &&
                    !(from.row === to.row && from.col === to.col);
                return premove ? isStraight : this.isStraightPath(from, to);
            }

            case PieceType.PROMOTED_QUEEN:
            case PieceType.QUEEN: {
                const isDiagonal =
                    Math.abs(from.row - to.row) === Math.abs(from.col - to.col);
                const isStraight = from.row === to.row || from.col === to.col;
                const notSameSquare = !(
                    from.row === to.row && from.col === to.col
                );

                if (premove) return (isDiagonal || isStraight) && notSameSquare;

                return (
                    this.isDiagonalPath(from, to) ||
                    this.isStraightPath(from, to)
                );
            }

            case PieceType.KING: {
                const rowDiff = Math.abs(from.row - to.row);
                const colDiff = Math.abs(from.col - to.col);

                // Normal king move
                if (rowDiff <= 1 && colDiff <= 1 && rowDiff + colDiff > 0)
                    return true;

                // Castling
                if (from.row === to.row && Math.abs(from.col - to.col) === 2) {
                    const homeRank = piece.color ? 7 : 0;
                    if (from.row !== homeRank || from.col !== 4) return false;

                    const side =
                        to.col > from.col ? CastleMove.SHORT : CastleMove.LONG;

                    // Check castling rights
                    if (piece.color) {
                        if (side === CastleMove.SHORT && !this.whiteCastleShort)
                            return false;

                        if (side === CastleMove.LONG && !this.whiteCastleLong)
                            return false;
                    } else {
                        if (side === CastleMove.SHORT && !this.blackCastleShort)
                            return false;

                        if (side === CastleMove.LONG && !this.blackCastleLong)
                            return false;
                    }

                    return premove || this.canCastle(piece.color, side);
                }

                return false;
            }

            default: {
                return false;
            }
        }
    }

    getLegalMoveType(move: Move, premove = false): MoveType {
        if (!this.isLegal(move, premove)) return MoveType.ILLEGAL;

        if (premove) return MoveType.PREMOVE;
        if (move.to.loc === "pocket") return MoveType.NORMAL;
        if (move.from.loc === "pocket") return MoveType.NORMAL;

        const piece = this.board[move.from.row][move.from.col];
        const captured = this.board[move.to.row][move.to.col];

        if (
            piece?.type === PieceType.KING &&
            Math.abs(move.from.col - move.to.col) === 2
        )
            return MoveType.CASTLE;

        if (
            piece?.type === PieceType.PAWN &&
            move.to.row === (piece.color ? 0 : 7)
        )
            return MoveType.PROMOTION;

        if (
            captured ||
            (piece?.type === PieceType.PAWN &&
                this.isEnPassantMove(move.from, move.to))
        )
            return MoveType.CAPTURE;

        return MoveType.NORMAL;
    }

    private isLegalMove(
        from: BoardPosition,
        to: BoardPosition,
        premove: boolean = false,
    ): boolean {
        const piece = this.board[from.row][from.col];
        if (!piece) return false;

        // In premove mode, skip turn and friendly fire checks
        if (!premove) {
            if (this.turn !== piece.color) return false;

            const targetPiece = this.board[to.row][to.col];
            if (targetPiece && targetPiece.color === piece.color) return false;
        }

        // Check if movement pattern is valid
        if (!this.isValidMovementPattern(piece, from, to, premove))
            return false;

        // In premove mode, skip check validation
        if (premove) return true;

        // Simulate the move to check if it leaves the king in check
        const originalPiece = this.board[to.row][to.col];
        let capturedEnPassantPiece: Piece | undefined;

        // Handle en passant capture in simulation
        if (piece.type === PieceType.PAWN && this.isEnPassantMove(from, to)) {
            const captureRow = from.row;
            const captureCol = to.col;
            capturedEnPassantPiece = this.board[captureRow][captureCol];
            this.board[captureRow][captureCol] = undefined;
        }

        this.board[to.row][to.col] = piece;
        this.board[from.row][from.col] = undefined;

        const inCheck = this.isInCheck(piece.color);

        // Restore board state
        this.board[from.row][from.col] = piece;
        this.board[to.row][to.col] = originalPiece;

        if (capturedEnPassantPiece) {
            const captureRow = from.row;
            const captureCol = to.col;
            this.board[captureRow][captureCol] = capturedEnPassantPiece;
        }

        return !inCheck;
    }

    private isLegalDrop(
        from: PocketPosition,
        to: BoardPosition,
        premove: boolean = false,
    ): boolean {
        // Check if piece is in pocket
        const pocket = this.getPocket(from.color);
        if ((pocket.get(from.type) ?? 0) <= 0) return false;

        // Pawns can't be dropped on back rank
        if (from.type === PieceType.PAWN && (to.row === 0 || to.row === 7))
            return false;

        // In premove mode, skip turn and check validation
        if (premove) return true;

        if (this.turn !== from.color) return false;

        if (this.board[to.row][to.col]) return false;

        this.board[to.row][to.col] = { type: from.type, color: from.color };

        const inCheck = this.isInCheck(from.color);

        this.board[to.row][to.col] = undefined;

        return !inCheck;
    }

    isLegal(move: Move, premove = false): boolean {
        if (move.to.loc === "pocket") return true;
        return move.from.loc === "pocket"
            ? this.isLegalDrop(move.from, move.to, premove)
            : this.isLegalMove(move.from, move.to, premove);
    }

    doMove(move: Move, premove = false): MoveResult {
        if (move.to.loc === "pocket") return {};

        const from = move.from;
        const to = move.to;

        if (from.loc === "pocket") {
            this.board[to.row][to.col] = {
                type: from.type,
                color: from.color,
            };

            this.removeFromPocket(from.type, from.color);
            this.enPassantTarget = undefined;

            if (!premove) this.turn = invertColor(this.turn);
            return {};
        }

        const piece = this.board[from.row][from.col];
        if (!piece) return {};

        let captured =
            this.board[to.row][to.col]?.type === PieceType.PROMOTED_QUEEN
                ? {
                      type: PieceType.PAWN,
                      color: piece.color,
                  }
                : this.board[to.row][to.col];

        // Handle en passant capture
        if (piece.type === PieceType.PAWN && this.isEnPassantMove(from, to)) {
            const captureRow = from.row;
            const captureCol = to.col;
            captured = this.board[captureRow][captureCol];
            this.board[captureRow][captureCol] = undefined;
        }

        // Handle castling
        if (
            piece.type === PieceType.KING &&
            Math.abs(from.col - to.col) === 2 &&
            from.row === to.row
        ) {
            const row = from.row;
            const side = to.col > from.col ? CastleMove.SHORT : CastleMove.LONG;
            const rookFromCol = side === CastleMove.SHORT ? 7 : 0;
            const rookToCol = side === CastleMove.SHORT ? 5 : 3;

            // Move king
            this.board[to.row][to.col] = piece;
            this.board[from.row][from.col] = undefined;

            // Move rook
            const rook = this.board[row][rookFromCol];
            this.board[row][rookToCol] = rook;
            this.board[row][rookFromCol] = undefined;
        } else {
            // Normal move
            this.board[to.row][to.col] = piece;
            this.board[from.row][from.col] = undefined;
        }

        // Set en passant target if pawn moved two squares
        if (
            piece.type === PieceType.PAWN &&
            Math.abs(to.row - from.row) === 2
        ) {
            const enPassantRow = (from.row + to.row) / 2;
            this.enPassantTarget = {
                loc: "board",
                row: enPassantRow,
                col: to.col,
            };
        } else {
            this.enPassantTarget = undefined;
        }

        let promoted: PieceType | undefined;

        // Pawn promotion - handle underpromotion
        if (piece.type === PieceType.PAWN && to.row === (piece.color ? 0 : 7)) {
            const promotionType = move.promotion || PieceType.QUEEN;

            // Use PROMOTED_QUEEN for queen promotions to distinguish from original queens
            const actualType =
                promotionType === PieceType.QUEEN
                    ? PieceType.PROMOTED_QUEEN
                    : promotionType;

            this.board[to.row][to.col] = {
                type: actualType,
                color: piece.color,
            };

            promoted = promotionType;
        }

        // Update castling rights
        if (piece.type === PieceType.KING) {
            if (piece.color) {
                this.whiteCastleShort = false;
                this.whiteCastleLong = false;
            } else {
                this.blackCastleShort = false;
                this.blackCastleLong = false;
            }
        }

        if (piece.type === PieceType.ROOK) {
            if (piece.color) {
                if (from.row === 7 && from.col === 7)
                    this.whiteCastleShort = false;
                else if (from.row === 7 && from.col === 0)
                    this.whiteCastleLong = false;
            } else if (from.row === 0 && from.col === 7) {
                this.blackCastleShort = false;
            } else if (from.row === 0 && from.col === 0) {
                this.blackCastleLong = false;
            }
        }

        // If a rook is captured, remove castling rights
        if (captured && captured.type === PieceType.ROOK) {
            if (captured.color) {
                if (to.row === 7 && to.col === 7) this.whiteCastleShort = false;
                else if (to.row === 7 && to.col === 0)
                    this.whiteCastleLong = false;
            } else if (to.row === 0 && to.col === 7) {
                this.blackCastleShort = false;
            } else if (to.row === 0 && to.col === 0) {
                this.blackCastleLong = false;
            }
        }

        if (!premove) this.turn = invertColor(this.turn);
        return { captured, promoted };
    }

    isCheckmate(): boolean {
        if (!this.isInCheck(this.turn)) return false;

        // Try all possible moves for the current player
        for (let fromRow = 0; fromRow < 8; fromRow++) {
            for (let fromCol = 0; fromCol < 8; fromCol++) {
                const piece = this.board[fromRow][fromCol];
                if (!piece || piece.color !== this.turn) continue;

                // Try moving this piece to all squares
                for (let toRow = 0; toRow < 8; toRow++) {
                    for (let toCol = 0; toCol < 8; toCol++) {
                        const from: Position = {
                            loc: "board",
                            row: fromRow,
                            col: fromCol,
                        };
                        const to: Position = {
                            loc: "board",
                            row: toRow,
                            col: toCol,
                        };

                        // Found a legal move, not checkmate
                        if (this.isLegalMove(from, to)) return false;
                    }
                }
            }
        }

        const testDropPiece = { type: PieceType.QUEEN, color: this.turn };

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if (this.board[row][col]) continue;

                this.board[row][col] = testDropPiece;
                if (!this.isInCheck(this.turn)) {
                    this.board[row][col] = undefined;
                    return false;
                }

                this.board[row][col] = undefined;
            }
        }

        return true;
    }
}

export enum Color {
    WHITE = 1,
    BLACK = 0,
}

export function invertColor(color: Color): Color {
    return color ? Color.BLACK : Color.WHITE;
}

export interface BoardPosition {
    loc: "board";
    row: number;
    col: number;
}

export interface PocketPosition {
    loc: "pocket";
    color: Color;
    type: PieceType;
}

export type Position = BoardPosition | PocketPosition;

export function createPosition(row: number, col: number): BoardPosition;
export function createPosition(color: Color, type: PieceType): PocketPosition;
export function createPosition(
    a: number | Color,
    b: number | PieceType,
): Position {
    return typeof b === "number"
        ? { loc: "board", row: a, col: b as number }
        : { loc: "pocket", color: a, type: b as PieceType };
}

export function positionsEqual(a: Position, b: Position): boolean {
    if (a.loc !== b.loc) return false;
    if (a.loc === "board" && b.loc === "board")
        return a.row === b.row && a.col === b.col;

    if (a.loc === "pocket" && b.loc === "pocket")
        return a.color === b.color && a.type === b.type;

    return false;
}

export enum PieceType {
    KING = "K",
    QUEEN = "Q",
    ROOK = "R",
    BISHOP = "B",
    KNIGHT = "N",
    PAWN = "P",
    PROMOTED_QUEEN = "Q+",
}

export interface Piece {
    type: PieceType;
    color: Color;
}

export type Board = (Piece | undefined)[][];

function createEmptyBoard(): Board {
    const board: Board = [];
    for (let row = 0; row < 8; row++) {
        board[row] = [];
        for (let col = 0; col < 8; col++) board[row][col] = undefined;
    }
    return board;
}

export interface Move {
    from: Position;
    to: Position;
    promotion?: PieceType;
}

export interface MoveResult {
    captured?: Piece;
    promoted?: PieceType;
}

// Move Types: Aligns with audio
export enum MoveType {
    ILLEGAL = "illegal",
    NORMAL = "normal",
    CAPTURE = "capture",
    CASTLE = "castle",
    PROMOTION = "promote",
    PREMOVE = "premove",
}

export enum CastleMove {
    LONG = "long",
    SHORT = "short",
}
