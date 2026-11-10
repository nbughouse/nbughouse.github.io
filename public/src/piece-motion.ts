import type { BoardPosition, Move, Piece } from "@shared/chess";

export interface PieceTarget {
    pos: BoardPosition;
    piece: Piece;
    square: HTMLElement;
    hidden: boolean;
}

interface PieceView {
    target: PieceTarget;
    originalPiece: Piece;
    element: HTMLElement;
    animation?: Animation;
}

function samePosition(a: BoardPosition, b: BoardPosition): boolean {
    return a.row === b.row && a.col === b.col;
}

function samePiece(a: Piece, b: Piece): boolean {
    return a.type === b.type && a.color === b.color &&
        a.combinedWith === b.combinedWith;
}

/** Keeps a piece's displayed position separate from its logical target. */
export class BoardPieceRenderer {
    private views: PieceView[] = [];

    constructor(
        private createElement: (piece: Piece) => HTMLElement,
        private updateElement: (element: HTMLElement, piece: Piece) => void,
    ) {}

    render(
        targets: PieceTarget[],
        duration: number,
        move?: Move,
        suppressTravel = false,
    ): void {
        const available = new Set(this.views);
        const matches = new Map<PieceTarget, PieceView>();
        const assign = (target: PieceTarget, view: PieceView | undefined) => {
            if (!view) return;
            matches.set(target, view);
            available.delete(view);
        };

        // Chess clones retain piece identity, including both castling pieces.
        for (const target of targets)
            assign(target, Array.from(available).find(
                (view) => view.target.piece === target.piece ||
                    view.originalPiece === target.piece,
            ));

        // Fresh optimistic promotion/drop objects and their confirmations can
        // still describe exactly the same target. They must not replay motion.
        for (const target of targets) {
            if (matches.has(target)) continue;
            assign(target, Array.from(available).find((view) =>
                samePosition(view.target.pos, target.pos) &&
                samePiece(view.target.piece, target.piece),
            ));
        }

        // Promotion and combination create a new piece object. Preserve the
        // moving view before matching unchanged destination-square contents.
        if (move?.from.loc === "board" && move.to.loc === "board") {
            const { from, to } = move;
            const target = targets.find((target) => samePosition(target.pos, to));
            const source = Array.from(available).find(
                (view) => samePosition(view.target.pos, from),
            );
            if (target && !matches.has(target) && source &&
                source.target.piece.color === target.piece.color)
                assign(target, source);
        }

        // Combining a pocket piece changes the existing destination's artwork.
        if (move?.from.loc === "pocket" && move.to.loc === "board") {
            const { to } = move;
            const target = targets.find((target) => samePosition(target.pos, to));
            if (target?.piece.combinedWith && !matches.has(target))
                assign(target, Array.from(available).find((view) =>
                    samePosition(view.target.pos, to) &&
                    view.target.piece.color === target.piece.color,
                ));
        }

        // Reconcile queue cancellation and duck placement, which can replace
        // objects while moving them. Prefer the nearest compatible old view.
        for (const target of targets) {
            if (matches.has(target)) continue;
            const candidates = Array.from(available).filter(
                (view) => samePiece(view.target.piece, target.piece),
            );
            const distance = (view: PieceView) =>
                Math.hypot(view.target.pos.row - target.pos.row,
                    view.target.pos.col - target.pos.col);
            candidates.sort((a, b) => distance(a) - distance(b));
            assign(target, candidates[0]);
        }

        // Read all displayed positions before changing any square's contents.
        const origins = new Map(Array.from(matches.values(), (view) =>
            [view, view.element.getBoundingClientRect()] as const,
        ));
        for (const view of available) {
            this.stop(view);
            view.element.remove();
        }

        const motions: { view: PieceView; origin: DOMRect }[] = [];
        this.views = targets.map((target) => {
            let view = matches.get(target);
            if (!view) {
                const element = this.createElement(target.piece);
                element.addEventListener("dragstart", (event) => event.preventDefault());
                target.square.append(element);
                view = { target, element, originalPiece: target.piece };
            } else {
                const moved = view.target.square !== target.square ||
                    !samePosition(view.target.pos, target.pos);
                const changedPiece = !samePiece(view.target.piece, target.piece);
                if (moved || duration <= 0) this.stop(view);
                if (changedPiece) {
                    this.updateElement(view.element, target.piece);
                    if (view.animation) view.element.classList.add("animating");
                }
                if (view.element.parentElement !== target.square)
                    target.square.append(view.element);

                if (moved && duration > 0 && !suppressTravel)
                    motions.push({ view, origin: origins.get(view)! });
                view.target = target;
            }
            view.element.dataset.targetRow = target.pos.row.toString();
            view.element.dataset.targetCol = target.pos.col.toString();
            view.element.style.opacity = target.hidden ? "0" : "";
            return view;
        });

        // Finish all reparenting first (also handles Chess960 king/rook swaps).
        // Web Animations applies the origin synchronously, before a frame can
        // paint at the destination. Retargeting starts at the displayed origin.
        for (const { view, origin } of motions) {
            const destination = view.element.getBoundingClientRect();
            const dx = origin.left - destination.left;
            const dy = origin.top - destination.top;
            if (!dx && !dy) continue;
            view.element.classList.add("animating");
            const animation = view.element.animate([
                { transform: `translate(${dx}px, ${dy}px)` },
                { transform: "translate(0, 0)" },
            ], { duration, easing: "cubic-bezier(0.2, 0, 0, 1)" });
            view.animation = animation;
            animation.onfinish = () => {
                if (view.animation === animation) this.stop(view);
            };
        }
    }

    clear(): void {
        for (const view of this.views) {
            this.stop(view);
            view.element.remove();
        }
        this.views = [];
    }

    private stop(view: PieceView): void {
        if (view.animation) {
            view.animation.onfinish = null;
            view.animation.cancel();
            view.animation = undefined;
        }
        view.element.classList.remove("animating");
    }
}
