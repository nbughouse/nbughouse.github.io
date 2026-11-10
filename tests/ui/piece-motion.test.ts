import assert from "node:assert/strict";
import test from "node:test";
import { Color, createPosition, PieceType, type Chess, type Move, type Piece } from "../../shared/src/chess";
import { BoardPieceRenderer, type PieceTarget } from "../../public/src/piece-motion";
import { gameFor, move } from "../helpers";

// A deterministic layout/animation clock lets us inspect motion between frames
// without a server, browser timing, or waiting for real animation durations.
class TestAnimation {
    onfinish: (() => void) | null = null;
    cancelled = false;
    progress = 0;
    constructor(readonly frames: Keyframe[]) {}
    cancel(): void { this.cancelled = true; }
}

class TestElement {
    parentElement: TestElement | null = null;
    children: TestElement[] = [];
    dataset: Record<string, string> = {};
    style = { opacity: "" };
    animations: TestAnimation[] = [];
    classList = {
        values: new Set<string>(),
        add(name: string) { this.values.add(name); },
        remove(name: string) { this.values.delete(name); },
        contains(name: string) { return this.values.has(name); },
    };
    constructor(readonly left = 0, readonly top = 0) {}
    addEventListener(): void {}
    append(element: TestElement): void {
        element.remove();
        this.children.push(element);
        element.parentElement = this;
    }
    remove(): void {
        if (this.parentElement)
            this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
        this.parentElement = null;
    }
    getBoundingClientRect(): DOMRect {
        let left = this.parentElement?.left ?? this.left;
        let top = this.parentElement?.top ?? this.top;
        const animation = [...this.animations].reverse().find((animation) => !animation.cancelled);
        if (animation) {
            const offset = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(String(animation.frames[0].transform))!;
            left += Number(offset[1]) * (1 - animation.progress);
            top += Number(offset[2]) * (1 - animation.progress);
        }
        return { left, top } as DOMRect;
    }
    animate(frames: Keyframe[]): Animation {
        const animation = new TestAnimation(frames);
        this.animations.push(animation);
        return animation as unknown as Animation;
    }
    get element(): HTMLElement { return this as unknown as HTMLElement; }
}

function fixture() {
    const squares = Array.from({ length: 8 }, (_, row) =>
        Array.from({ length: 8 }, (_, col) => new TestElement(col * 100, row * 100)));
    const elements: TestElement[] = [];
    const appearances: Piece[] = [];
    const renderer = new BoardPieceRenderer(() => {
        const element = new TestElement();
        elements.push(element);
        return element.element;
    }, (_element, piece) => appearances.push(piece));
    function targets(chess: Chess, flipped = false): PieceTarget[] {
        return chess.board.flatMap((rank, row) => rank.flatMap((piece, col) => piece ? [{
            pos: { loc: "board" as const, row, col }, piece,
            square: squares[flipped ? 7 - row : row][flipped ? 7 - col : col].element,
            hidden: false,
        }] : []));
    }
    return { squares, elements, appearances, renderer, targets };
}

test("click move starts at its displayed source; server confirmation and redraws preserve that animation", () => {
    const f = fixture();
    const game = gameFor("default", false);
    const action = move(6, 4, 4, 4);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300);
    const pawn = f.squares[6][4].children[0];
    game.matches[0].queued.moves.push(action);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
    assert.equal(f.squares[4][4].children[0], pawn);
    assert.equal(pawn.animations.length, 1);
    assert.deepEqual(pawn.getBoundingClientRect(), { left: 400, top: 600 });
    assert.equal(pawn.dataset.targetRow, "4");

    pawn.animations[0].progress = 0.4;
    const displayed = pawn.getBoundingClientRect();
    game.matches[0].queued.moves.shift();
    game.doMove(0, action);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300);
    assert.equal(pawn.animations.length, 1);
    assert.equal(pawn.animations[0].cancelled, false);
    assert.deepEqual(pawn.getBoundingClientRect(), displayed);
    assert.equal(f.elements.length, 32);
});

test("rapid retargeting and queue cancellation continue from the current displayed position", () => {
    const f = fixture();
    const game = gameFor("default", false);
    const first = move(6, 4, 4, 4);
    const second = move(4, 4, 3, 4);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300);
    const pawn = f.squares[6][4].children[0];
    game.matches[0].queued.moves.push(first);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, first);
    pawn.animations[0].progress = 0.5;
    const staleFinish = pawn.animations[0].onfinish!;
    const displayed = pawn.getBoundingClientRect();
    game.matches[0].queued.moves.push(second);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, second);
    assert.deepEqual(pawn.getBoundingClientRect(), displayed);
    assert.equal(pawn.animations[0].cancelled, true);
    assert.equal(pawn.animations.length, 2);
    staleFinish();
    assert.equal(pawn.animations[1].cancelled, false);
    assert.equal(pawn.classList.contains("animating"), true);

    pawn.animations[1].progress = 0.5;
    const beforeCancel = pawn.getBoundingClientRect();
    game.matches[0].queued.moves.length = 0;
    f.renderer.render(f.targets(game.getFinalChess(0)), 300);
    assert.equal(f.squares[6][4].children[0], pawn);
    assert.deepEqual(pawn.getBoundingClientRect(), beforeCancel);
    pawn.animations[2].progress = 1;
    pawn.animations[2].onfinish!();
    assert.equal(pawn.classList.contains("animating"), false);
    assert.deepEqual(pawn.getBoundingClientRect(), { left: 400, top: 600 });
});

test("drag moves settle immediately and their confirmations never replay travel", () => {
    const f = fixture();
    const game = gameFor("default", false);
    const action = move(6, 4, 4, 4);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300);
    const pawn = f.squares[6][4].children[0];
    game.matches[0].queued.moves.push(action);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, action, true);
    game.matches[0].queued.moves.shift();
    game.doMove(0, action);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
    assert.equal(pawn.animations.length, 0);
    assert.equal(f.squares[4][4].children[0], pawn);
});

for (const promotion of [undefined, PieceType.QUEEN, PieceType.KNIGHT]) {
    test(`promotion to ${promotion ?? "default queen"} preserves the pawn view and does not replay on confirmation`, () => {
        const f = fixture();
        const game = gameFor("default");
        game.matches[0].chess.board[1][0] = { type: PieceType.PAWN, color: Color.WHITE };
        const action: Move = { ...move(1, 0, 0, 0), promotion };
        f.renderer.render(f.targets(game.getFinalChess(0)), 300);
        const pawn = f.squares[1][0].children[0];
        game.matches[0].queued.moves.push(action);
        f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
        game.matches[0].queued.moves.shift();
        game.doMove(0, action);
        f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
        assert.equal(f.squares[0][0].children[0], pawn);
        assert.equal(pawn.animations.length, 1);
        assert.equal(f.appearances.length, 1);
    });
}

test("cancelled promotion returns the same view to the pawn's original square", () => {
    const f = fixture();
    const game = gameFor("default");
    game.matches[0].chess.board[1][0] = { type: PieceType.PAWN, color: Color.WHITE };
    const action: Move = { ...move(1, 0, 0, 0), promotion: PieceType.QUEEN };
    f.renderer.render(f.targets(game.getFinalChess(0)), 300);
    const pawn = f.squares[1][0].children[0];
    game.matches[0].queued.moves.push(action);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
    pawn.animations[0].progress = 0.5;
    const displayed = pawn.getBoundingClientRect();
    game.matches[0].queued.moves.length = 0;
    f.renderer.render(f.targets(game.getFinalChess(0)), 300);
    assert.deepEqual(f.squares[1][0].children, [pawn]);
    assert.deepEqual(pawn.getBoundingClientRect(), displayed);
    assert.equal(f.appearances[1].type, PieceType.PAWN);
});

test("pocket drops retain one view when confirmed, including accolade artwork changes", () => {
    for (const combined of [false, true]) {
        const f = fixture();
        const game = gameFor(combined ? "accolade" : "default");
        const chess = game.matches[0].chess;
        chess.whitePocket.set(PieceType.KNIGHT, 1);
        if (combined) chess.board[4][4] = { type: PieceType.BISHOP, color: Color.WHITE };
        const action: Move = {
            from: createPosition(Color.WHITE, PieceType.KNIGHT),
            to: createPosition(4, 4),
        };
        f.renderer.render(f.targets(game.getFinalChess(0)), 300);
        const existing = f.squares[4][4].children[0];
        game.matches[0].queued.moves.push(action);
        f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
        const dropped = f.squares[4][4].children[0];
        game.matches[0].queued.moves.shift();
        game.doMove(0, action);
        f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
        assert.deepEqual(f.squares[4][4].children, [dropped]);
        assert.equal(dropped.animations.length, 0);
        if (combined) {
            assert.equal(dropped, existing);
            assert.equal(f.appearances.length, 1);
        }
    }
});

test("duck relocation follows its new target once across confirmation", () => {
    const f = fixture();
    const game = gameFor("duck");
    const chess = game.matches[0].chess;
    chess.board[4][4] = { type: PieceType.DUCK, color: Color.WHITE };
    chess.duckPending = true;
    const action: Move = {
        from: createPosition(Color.WHITE, PieceType.DUCK),
        to: createPosition(3, 3),
    };
    f.renderer.render(f.targets(game.getFinalChess(0)), 300);
    const duck = f.squares[4][4].children[0];
    game.matches[0].queued.moves.push(action);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
    game.matches[0].queued.moves.shift();
    game.doMove(0, action);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
    assert.deepEqual(f.squares[3][3].children, [duck]);
    assert.equal(duck.animations.length, 1);
});

test("Chess960 king/rook swaps retain both identities and animate each once", () => {
    const f = fixture();
    const game = gameFor("960");
    const chess = game.matches[0].chess;
    chess.board[7][7] = undefined;
    chess.board[7][5] = { type: PieceType.KING, color: Color.WHITE };
    chess.board[7][6] = { type: PieceType.ROOK, color: Color.WHITE };
    chess.whiteCastleShort = true;
    chess.whiteCastleShortRookCol = 6;
    const action = move(7, 5, 7, 6);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300);
    const king = f.squares[7][5].children[0];
    const rook = f.squares[7][6].children[0];
    game.matches[0].queued.moves.push(action);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
    game.matches[0].queued.moves.shift();
    game.doMove(0, action);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
    assert.deepEqual(f.squares[7][6].children, [king]);
    assert.deepEqual(f.squares[7][5].children, [rook]);
    assert.equal(king.animations.length, 1);
    assert.equal(rook.animations.length, 1);
});

test("accolade combines the moving view only once across optimistic and confirmed states", () => {
    const f = fixture();
    const game = gameFor("accolade");
    game.matches[0].chess.board[4][4] = { type: PieceType.KNIGHT, color: Color.WHITE };
    game.matches[0].chess.board[2][5] = { type: PieceType.BISHOP, color: Color.WHITE };
    const action = move(4, 4, 2, 5);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300);
    const knight = f.squares[4][4].children[0];
    const bishop = f.squares[2][5].children[0];
    game.matches[0].queued.moves.push(action);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
    game.matches[0].queued.moves.shift();
    game.doMove(0, action);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300, action);
    assert.deepEqual(f.squares[2][5].children, [knight]);
    assert.equal(bishop.parentElement, null);
    assert.equal(knight.animations.length, 1);
    assert.equal(f.appearances.length, 1);
});

test("captures cancel the removed piece's motion; board flips preserve the surviving piece", () => {
    const f = fixture();
    const game = gameFor("default");
    const chess = game.matches[0].chess;
    chess.board[4][4] = { type: PieceType.ROOK, color: Color.WHITE };
    chess.board[2][4] = { type: PieceType.ROOK, color: Color.BLACK };
    f.renderer.render(f.targets(chess), 300);
    const white = f.squares[4][4].children[0];
    const black = f.squares[2][4].children[0];
    chess.board[3][4] = chess.board[2][4];
    chess.board[2][4] = undefined;
    f.renderer.render(f.targets(chess), 300);
    chess.board[3][4] = chess.board[4][4];
    chess.board[4][4] = undefined;
    f.renderer.render(f.targets(chess), 300);
    assert.equal(black.parentElement, null);
    assert.equal(black.animations[0].cancelled, true);
    assert.deepEqual(f.squares[3][4].children, [white]);
    const displayed = white.getBoundingClientRect();
    f.renderer.render(f.targets(chess, true), 300);
    assert.deepEqual(f.squares[4][3].children, [white]);
    assert.deepEqual(white.getBoundingClientRect(), displayed);
});

test("zero duration settles active motion and clearing removes animations and views", () => {
    const f = fixture();
    const game = gameFor("default", false);
    f.renderer.render(f.targets(game.getFinalChess(0)), 300);
    const pawn = f.squares[6][4].children[0];
    game.matches[0].queued.moves.push(move(6, 4, 4, 4));
    f.renderer.render(f.targets(game.getFinalChess(0)), 300);
    f.renderer.render(f.targets(game.getFinalChess(0)), 0);
    assert.equal(pawn.animations[0].cancelled, true);
    assert.deepEqual(pawn.getBoundingClientRect(), { left: 400, top: 400 });
    f.renderer.clear();
    assert.ok(f.elements.every((element) => !element.parentElement));
});
