import { Chess, Color, PieceType, type Move, type MoveRules, type BoardPosition } from "./chess";
import { botPromotion } from "./bots";

export function squareName(position: BoardPosition): string {
    return `${"abcdefgh"[position.col]}${8 - position.row}`;
}

/** Full snapshots are needed because transfers can change pockets between turns. */
export function botFen(chess: Chess): string {
    const ranks = chess.board.map(row => {
        let rank = "";
        let empty = 0;
        for (const piece of row) {
            if (!piece) { empty++; continue; }
            if (empty) { rank += empty; empty = 0; }
            const symbol = piece.type === PieceType.PROMOTED_QUEEN ? "Q" : piece.type;
            rank += piece.color === Color.WHITE ? symbol : symbol.toLowerCase();
            if (piece.type === PieceType.PROMOTED_QUEEN) rank += "~";
        }
        return rank + (empty || "");
    });
    let pocket = "";
    for (const color of [Color.WHITE, Color.BLACK])
        for (const [type, count] of chess.getPocket(color))
            pocket += (color === Color.WHITE ? type : type.toLowerCase()).repeat(count);
    const castling = `${chess.whiteCastleShort ? "K" : ""}${chess.whiteCastleLong ? "Q" : ""}${chess.blackCastleShort ? "k" : ""}${chess.blackCastleLong ? "q" : ""}` || "-";
    return `${ranks.join("/")}[${pocket}] ${chess.turn === Color.WHITE ? "w" : "b"} ${castling} ${chess.enPassantTarget ? squareName(chess.enPassantTarget) : "-"} 0 1`;
}

export function moveUci(move: Move): string {
    if (move.to.loc !== "board") throw new Error("Invalid bot destination");
    const from = move.from.loc === "board" ? squareName(move.from) : `${move.from.type}@`;
    return from + squareName(move.to) + (move.promotion?.toLowerCase() ?? "");
}

/** Constrain engine root moves to this app's legal moves, including real drops. */
export function botLegalMoves(chess: Chess, rules: MoveRules): Map<string, Move> {
    const legal = new Map<string, Move>();
    const add = (move: Move) => {
        if (chess.isLegal(move, false, rules)) legal.set(moveUci(move), move);
    };
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const to: BoardPosition = { loc: "board", row, col };
        for (let fromRow = 0; fromRow < 8; fromRow++) for (let fromCol = 0; fromCol < 8; fromCol++) {
            const piece = chess.board[fromRow][fromCol];
            if (!piece || piece.color !== chess.turn) continue;
            // Use standard king-destination castling notation, not king-to-rook aliases.
            if (chess.board[row][col]?.color === chess.turn) continue;
            const move: Move = { from: { loc: "board", row: fromRow, col: fromCol }, to };
            if (piece.type === PieceType.PAWN && (row === 0 || row === 7)) {
                for (const type of ["q", "r", "b", "n"]) add({ ...move, promotion: botPromotion(type) });
            } else add(move);
        }
        for (const [type, count] of chess.getPocket(chess.turn))
            if (count > 0) add({ from: { loc: "pocket", type, color: chess.turn }, to });
    }
    return legal;
}
