export interface SerializedChess {
    board: Board;
    whitePocket: Record<PieceType, number>;
    blackPocket: Record<PieceType, number>;
    turn: Color;
    whiteCastleShort: boolean;
    whiteCastleLong: boolean;
    blackCastleShort: boolean;
    blackCastleLong: boolean;
    whiteCastleShortRookCol?: number;
    whiteCastleLongRookCol?: number;
    blackCastleShortRookCol?: number;
    blackCastleLongRookCol?: number;
    enPassantTarget: BoardPosition | undefined;
}

export interface MoveRules {
    allowKingCapture?: boolean;
    forcePocketKingDrop?: boolean;
    accolade?: boolean;
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
    whiteCastleShortRookCol: number = 7;
    whiteCastleLongRookCol: number = 0;
    blackCastleShortRookCol: number = 7;
    blackCastleLongRookCol: number = 0;
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
        chess.whiteCastleShortRookCol = this.whiteCastleShortRookCol;
        chess.whiteCastleLongRookCol = this.whiteCastleLongRookCol;
        chess.blackCastleShortRookCol = this.blackCastleShortRookCol;
        chess.blackCastleLongRookCol = this.blackCastleLongRookCol;
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
            whiteCastleShortRookCol: this.whiteCastleShortRookCol,
            whiteCastleLongRookCol: this.whiteCastleLongRookCol,
            blackCastleShortRookCol: this.blackCastleShortRookCol,
            blackCastleLongRookCol: this.blackCastleLongRookCol,
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
        chess.whiteCastleShortRookCol = data.whiteCastleShortRookCol ?? 7;
        chess.whiteCastleLongRookCol = data.whiteCastleLongRookCol ?? 0;
        chess.blackCastleShortRookCol = data.blackCastleShortRookCol ?? 7;
        chess.blackCastleLongRookCol = data.blackCastleLongRookCol ?? 0;
        chess.enPassantTarget = data.enPassantTarget;
        return chess;
    }

    reset(backRank: PieceType[] = defaultBackRank()): void {
        this.whitePocket = new Map();
        this.blackPocket = new Map();
        this.turn = Color.WHITE;
        this.whiteCastleShort = true;
        this.whiteCastleLong = true;
        this.blackCastleShort = true;
        this.blackCastleLong = true;
        const castleRookCols = getCastleRookCols(backRank);
        this.whiteCastleShortRookCol = castleRookCols.short;
        this.whiteCastleLongRookCol = castleRookCols.long;
        this.blackCastleShortRookCol = castleRookCols.short;
        this.blackCastleLongRookCol = castleRookCols.long;
        this.enPassantTarget = undefined;
        this.board = createEmptyBoard();

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

    resetRandom(): void {
        this.reset(randomBackRank());
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
        if (piece.combinedWith) {
            this.addToPocket({ type: PieceType.KNIGHT, color: piece.color });
            this.addToPocket({ type: piece.combinedWith, color: piece.color });
            return;
        }

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

        if (isKnightMove(from, to)) return pieceHasKnightMovement(piece);

        switch (getNonKnightPieceType(piece)) {
            case PieceType.PAWN: {
                const direction = piece.color ? -1 : 1;
                return (
                    Math.abs(from.col - to.col) === 1 &&
                    to.row - from.row === direction
                );
            }
            case PieceType.KNIGHT:
                return false;
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
        if (!this.hasCastleRight(color, side)) return false;

        // Check if king and rook are in place
        const row = color ? 7 : 0;
        const kingPos = this.findKing(color);
        if (!kingPos || kingPos.row !== row) return false;

        const kingCol = kingPos.col;
        const rookCol = this.getCastleRookCol(color, side);
        const king = this.board[row][kingCol];
        const rook = this.board[row][rookCol];

        if (!king || king.type !== PieceType.KING || king.color !== color)
            return false;

        if (!rook || rook.type !== PieceType.ROOK || rook.color !== color)
            return false;

        if (this.isInCheck(color)) return false;

        const enemyColor = invertColor(color);
        const kingDestinationCol = side === CastleMove.SHORT ? 6 : 2;
        const rookDestinationCol = side === CastleMove.SHORT ? 5 : 3;

        for (const col of colsBetween(kingCol, rookCol)) {
            if (this.board[row][col]) return false;
        }

        for (const col of colsBetweenInclusive(kingCol, kingDestinationCol)) {
            const occupiedByCastlingRook = col === rookCol;
            if (
                col !== kingCol &&
                !occupiedByCastlingRook &&
                this.board[row][col]
            )
                return false;

            if (this.isSquareAttacked({ loc: "board", row, col }, enemyColor))
                return false;
        }

        for (const col of colsBetweenInclusive(rookCol, rookDestinationCol)) {
            if (
                col !== rookCol &&
                col !== kingCol &&
                this.board[row][col]
            )
                return false;
        }

        return true;
    }

    private hasCastleRight(color: Color, side: CastleMove): boolean {
        if (color)
            return side === CastleMove.SHORT
                ? this.whiteCastleShort
                : this.whiteCastleLong;

        return side === CastleMove.SHORT
            ? this.blackCastleShort
            : this.blackCastleLong;
    }

    private getCastleRookCol(color: Color, side: CastleMove): number {
        if (color)
            return side === CastleMove.SHORT
                ? this.whiteCastleShortRookCol
                : this.whiteCastleLongRookCol;

        return side === CastleMove.SHORT
            ? this.blackCastleShortRookCol
            : this.blackCastleLongRookCol;
    }

    private getCastleSideForMove(
        piece: Piece,
        from: BoardPosition,
        to: BoardPosition,
    ): CastleMove | undefined {
        if (piece.type !== PieceType.KING || from.row !== to.row) return;

        const homeRank = piece.color ? 7 : 0;
        if (from.row !== homeRank) return;

        if (to.col === 6 && from.col !== to.col) return CastleMove.SHORT;
        if (to.col === 2 && from.col !== to.col) return CastleMove.LONG;

        if (
            to.col === this.getCastleRookCol(piece.color, CastleMove.SHORT) &&
            from.col !== to.col
        )
            return CastleMove.SHORT;

        if (
            to.col === this.getCastleRookCol(piece.color, CastleMove.LONG) &&
            from.col !== to.col
        )
            return CastleMove.LONG;
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
        if (isKnightMove(from, to)) return pieceHasKnightMovement(piece);

        switch (getNonKnightPieceType(piece)) {
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

            case PieceType.KNIGHT:
                return false;

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

                const side = this.getCastleSideForMove(piece, from, to);
                if (side) return premove || this.canCastle(piece.color, side);

                return false;
            }

            default: {
                return false;
            }
        }
    }

    getLegalMoveType(
        move: Move,
        premove = false,
        rules: MoveRules = {},
    ): MoveType {
        if (!this.isLegal(move, premove, rules)) return MoveType.ILLEGAL;

        if (premove) return MoveType.PREMOVE;
        if (move.to.loc === "pocket") return MoveType.NORMAL;
        if (move.from.loc === "pocket") return MoveType.NORMAL;

        const piece = this.board[move.from.row][move.from.col];
        const captured = this.board[move.to.row][move.to.col];

        if (
            rules.accolade &&
            piece &&
            captured &&
            canCombinePieces(piece, captured)
        )
            return MoveType.NORMAL;

        if (piece && this.getCastleSideForMove(piece, move.from, move.to))
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
        rules: MoveRules = {},
    ): boolean {
        const piece = this.board[from.row][from.col];
        if (!piece) return false;

        const targetPiece = this.board[to.row][to.col];
        const castleSide = this.getCastleSideForMove(piece, from, to);
        if (
            targetPiece?.type === PieceType.KING &&
            !rules.allowKingCapture
        )
            return false;

        // In premove mode, skip turn and friendly fire checks
        if (!premove) {
            if (this.turn !== piece.color) return false;

            if (
                targetPiece &&
                targetPiece.color === piece.color &&
                !(
                    castleSide &&
                    targetPiece.type === PieceType.ROOK &&
                    to.col === this.getCastleRookCol(piece.color, castleSide)
                ) &&
                !(rules.accolade && canCombinePieces(piece, targetPiece))
            )
                return false;
        }

        // Check if movement pattern is valid
        if (!this.isValidMovementPattern(piece, from, to, premove))
            return false;

        // In premove mode, skip check validation
        if (premove) return true;
        if (castleSide) return true;
        if (rules.allowKingCapture) return true;

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

        this.board[to.row][to.col] =
            rules.accolade && targetPiece
                ? combinePieces(piece, targetPiece) ?? piece
                : piece;
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
        rules: MoveRules = {},
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

        const targetPiece = this.board[to.row][to.col];
        const droppedPiece = { type: from.type, color: from.color };
        if (
            targetPiece &&
            !(rules.accolade && canCombinePieces(droppedPiece, targetPiece))
        )
            return false;
        if (rules.allowKingCapture) return true;

        this.board[to.row][to.col] = targetPiece
            ? combinePieces(droppedPiece, targetPiece)
            : droppedPiece;

        const inCheck = this.isInCheck(from.color);

        this.board[to.row][to.col] = targetPiece;

        return !inCheck;
    }

    isLegal(move: Move, premove = false, rules: MoveRules = {}): boolean {
        if (move.to.loc === "pocket") return true;
        if (
            !premove &&
            rules.forcePocketKingDrop &&
            this.getPocket(this.turn).has(PieceType.KING) &&
            !(
                move.from.loc === "pocket" &&
                move.from.color === this.turn &&
                move.from.type === PieceType.KING
            )
        )
            return false;

        return move.from.loc === "pocket"
            ? this.isLegalDrop(move.from, move.to, premove, rules)
            : this.isLegalMove(move.from, move.to, premove, rules);
    }

    doMove(move: Move, premove = false, rules: MoveRules = {}): MoveResult {
        if (move.to.loc === "pocket") return {};

        const from = move.from;
        const to = move.to;

        if (from.loc === "pocket") {
            const droppedPiece: Piece = {
                type: from.type,
                color: from.color,
            };
            const targetPiece = this.board[to.row][to.col];
            this.board[to.row][to.col] =
                rules.accolade && targetPiece
                    ? combinePieces(droppedPiece, targetPiece) ?? droppedPiece
                    : droppedPiece;

            this.removeFromPocket(from.type, from.color);
            this.enPassantTarget = undefined;

            if (!premove) this.turn = invertColor(this.turn);
            return {};
        }

        const piece = this.board[from.row][from.col];
        if (!piece) return {};

        const targetPiece = this.board[to.row][to.col];
        const castleSide = this.getCastleSideForMove(piece, from, to);
        const combining =
            rules.accolade && targetPiece
                ? canCombinePieces(piece, targetPiece)
                : false;
        let captured =
            castleSide
                ? undefined
                : targetPiece?.type === PieceType.PROMOTED_QUEEN
                ? {
                      type: PieceType.PAWN,
                      color: targetPiece.color,
                  }
                : combining
                  ? undefined
                  : targetPiece;

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
            castleSide
        ) {
            const row = from.row;
            const side = castleSide;
            const kingToCol = side === CastleMove.SHORT ? 6 : 2;
            const rookFromCol = this.getCastleRookCol(piece.color, side);
            const rookToCol = side === CastleMove.SHORT ? 5 : 3;
            const rook = this.board[row][rookFromCol];

            this.board[row][from.col] = undefined;
            this.board[row][rookFromCol] = undefined;

            this.board[row][kingToCol] = piece;
            this.board[row][rookToCol] = rook;
        } else {
            // Normal move
            this.board[to.row][to.col] =
                combining && targetPiece
                    ? combinePieces(piece, targetPiece)
                    : piece;
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
                if (from.row === 7 && from.col === this.whiteCastleShortRookCol)
                    this.whiteCastleShort = false;
                else if (
                    from.row === 7 &&
                    from.col === this.whiteCastleLongRookCol
                )
                    this.whiteCastleLong = false;
            } else if (
                from.row === 0 &&
                from.col === this.blackCastleShortRookCol
            ) {
                this.blackCastleShort = false;
            } else if (
                from.row === 0 &&
                from.col === this.blackCastleLongRookCol
            ) {
                this.blackCastleLong = false;
            }
        }

        // If a rook is captured, remove castling rights
        if (captured && captured.type === PieceType.ROOK) {
            if (captured.color) {
                if (to.row === 7 && to.col === this.whiteCastleShortRookCol)
                    this.whiteCastleShort = false;
                else if (
                    to.row === 7 &&
                    to.col === this.whiteCastleLongRookCol
                )
                    this.whiteCastleLong = false;
            } else if (
                to.row === 0 &&
                to.col === this.blackCastleShortRookCol
            ) {
                this.blackCastleShort = false;
            } else if (
                to.row === 0 &&
                to.col === this.blackCastleLongRookCol
            ) {
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
    /** Original non-knight component of an Accolade combined piece. */
    combinedWith?: PieceType;
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

function defaultBackRank(): PieceType[] {
    return [
        PieceType.ROOK,
        PieceType.KNIGHT,
        PieceType.BISHOP,
        PieceType.QUEEN,
        PieceType.KING,
        PieceType.BISHOP,
        PieceType.KNIGHT,
        PieceType.ROOK,
    ];
}

function getCastleRookCols(backRank: PieceType[]): {
    short: number;
    long: number;
} {
    const kingCol = backRank.indexOf(PieceType.KING);
    const rookCols = backRank.flatMap((piece, col) =>
        piece === PieceType.ROOK ? [col] : [],
    );
    let long = 0;
    for (const col of rookCols) {
        if (col < kingCol) long = col;
    }

    return {
        short: rookCols.find((col) => col > kingCol) ?? 7,
        long,
    };
}

function colsBetween(firstCol: number, secondCol: number): number[] {
    const start = Math.min(firstCol, secondCol) + 1;
    const end = Math.max(firstCol, secondCol);
    const cols: number[] = [];
    for (let col = start; col < end; col++) cols.push(col);
    return cols;
}

function colsBetweenInclusive(firstCol: number, secondCol: number): number[] {
    const step = firstCol <= secondCol ? 1 : -1;
    const cols: number[] = [];
    for (let col = firstCol; col !== secondCol + step; col += step)
        cols.push(col);
    return cols;
}

function randomBackRank(): PieceType[] {
    const rank = Array<PieceType | undefined>(8);
    const darkBishopCol = randomItem([0, 2, 4, 6]);
    const lightBishopCol = randomItem([1, 3, 5, 7]);
    rank[darkBishopCol] = PieceType.BISHOP;
    rank[lightBishopCol] = PieceType.BISHOP;

    const queenCol = randomItem(emptyCols(rank));
    rank[queenCol] = PieceType.QUEEN;

    for (let index = 0; index < 2; index++) {
        const knightCol = randomItem(emptyCols(rank));
        rank[knightCol] = PieceType.KNIGHT;
    }

    const [leftRookCol, kingCol, rightRookCol] = emptyCols(rank);
    rank[leftRookCol] = PieceType.ROOK;
    rank[kingCol] = PieceType.KING;
    rank[rightRookCol] = PieceType.ROOK;

    return rank as PieceType[];
}

function emptyCols(rank: Array<PieceType | undefined>): number[] {
    return rank.flatMap((piece, col) => (piece ? [] : [col]));
}

function randomItem<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
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

// Move Types: Aligns with sound
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

const accoladePartnerTypes = new Set<PieceType>([
    PieceType.BISHOP,
    PieceType.ROOK,
    PieceType.QUEEN,
    PieceType.PROMOTED_QUEEN,
]);

function canCombinePieces(first: Piece, second: Piece): boolean {
    if (first.color !== second.color) return false;
    if (first.combinedWith || second.combinedWith) return false;

    return (
        (first.type === PieceType.KNIGHT &&
            accoladePartnerTypes.has(second.type)) ||
        (second.type === PieceType.KNIGHT &&
            accoladePartnerTypes.has(first.type))
    );
}

function combinePieces(first: Piece, second: Piece): Piece | undefined {
    if (!canCombinePieces(first, second)) return undefined;
    const partner =
        first.type === PieceType.KNIGHT ? second.type : first.type;
    return {
        type: PieceType.KNIGHT,
        color: first.color,
        combinedWith: partner,
    };
}

function pieceHasKnightMovement(piece: Piece): boolean {
    return piece.type === PieceType.KNIGHT || piece.combinedWith !== undefined;
}

function getNonKnightPieceType(piece: Piece): PieceType {
    return piece.combinedWith ?? piece.type;
}

function isKnightMove(from: BoardPosition, to: BoardPosition): boolean {
    const dr = Math.abs(from.row - to.row);
    const dc = Math.abs(from.col - to.col);
    return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
}
