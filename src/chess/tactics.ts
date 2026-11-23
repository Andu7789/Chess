// Static (engine-free) tactical helpers shared by the app and the puzzle generator.
// Keep this file free of non-erasable TypeScript syntax so Node can run it directly.
import { Chess } from 'chess.js';
import type { Color, PieceSymbol, Square } from 'chess.js';

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const FILES = 'abcdefgh';
export const ALL_SQUARES: Square[] = [];
for (let r = 8; r >= 1; r--) for (let f = 0; f < 8; f++) ALL_SQUARES.push((FILES[f] + r) as Square);

export function sqToXY(sq: Square): [number, number] {
  return [FILES.indexOf(sq[0]), Number(sq[1]) - 1];
}
export function xyToSq(x: number, y: number): Square | null {
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  return (FILES[x] + (y + 1)) as Square;
}

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Squares attacked by the piece on `sq` (ignores pins/legality, includes own-piece "defence"). */
export function attacksFrom(chess: Chess, sq: Square): Square[] {
  const piece = chess.get(sq);
  if (!piece) return [];
  const [x, y] = sqToXY(sq);
  const out: Square[] = [];
  const add = (dx: number, dy: number) => {
    const s = xyToSq(x + dx, y + dy);
    if (s) out.push(s);
  };
  const ray = (dx: number, dy: number) => {
    let cx = x + dx;
    let cy = y + dy;
    for (;;) {
      const s = xyToSq(cx, cy);
      if (!s) return;
      out.push(s);
      if (chess.get(s)) return;
      cx += dx;
      cy += dy;
    }
  };
  switch (piece.type) {
    case 'p': {
      const d = piece.color === 'w' ? 1 : -1;
      add(-1, d);
      add(1, d);
      break;
    }
    case 'n':
      for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(dx, dy);
      break;
    case 'k':
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) add(dx, dy);
      break;
    case 'b':
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ray(dx, dy);
      break;
    case 'r':
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ray(dx, dy);
      break;
    case 'q':
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) ray(dx, dy);
      break;
  }
  return out;
}

function attackersOf(chess: Chess, sq: Square, by: Color): Square[] {
  return chess.attackers(sq, by);
}

/** Cheapest attacker value of `by` on `sq` (Infinity if none). */
function cheapestAttacker(chess: Chess, sq: Square, by: Color): number {
  let min = Infinity;
  for (const a of attackersOf(chess, sq, by)) {
    const p = chess.get(a);
    if (p) min = Math.min(min, PIECE_VALUE[p.type]);
  }
  return min;
}

export interface HangingPiece {
  square: Square;
  type: PieceSymbol;
  color: Color;
  reason: 'undefended' | 'cheaper-attacker';
}

/**
 * Pieces of `color` that are en prise: attacked and either undefended or attacked by a cheaper piece.
 * Kings are ignored.
 */
export function hangingPieces(fen: string, color: Color): HangingPiece[] {
  const chess = new Chess(fen);
  const out: HangingPiece[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue;
      const enemy = other(color);
      const attackers = attackersOf(chess, p.square, enemy);
      if (!attackers.length) continue;
      const defenders = attackersOf(chess, p.square, color);
      if (!defenders.length) out.push({ square: p.square, type: p.type, color, reason: 'undefended' });
      else if (cheapestAttacker(chess, p.square, enemy) < PIECE_VALUE[p.type])
        out.push({ square: p.square, type: p.type, color, reason: 'cheaper-attacker' });
    }
  }
  return out;
}

/** All squares attacked by `color`. */
export function attackedSquares(fen: string, color: Color): Set<Square> {
  const chess = new Chess(fen);
  const set = new Set<Square>();
  for (const row of chess.board())
    for (const p of row) if (p && p.color === color) for (const s of attacksFrom(chess, p.square)) set.add(s);
  return set;
}

export function materialCount(fen: string): { w: number; b: number } {
  const chess = new Chess(fen);
  const m = { w: 0, b: 0 };
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'k') m[p.color] += PIECE_VALUE[p.type];
  return m;
}

// ---------- Theme detection for a single move ----------

/** Detects tactical motifs created by a move `uci` played in `fen`. */
export function detectMotifs(fen: string, uci: string): string[] {
  const chess = new Chess(fen);
  const mover = chess.turn();
  const enemy = other(mover);
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const captured = chess.get(to);
  const movingPiece = chess.get(from);
  if (!movingPiece) return [];
  const before = new Chess(fen);
  let mv;
  try {
    mv = chess.move({ from, to, promotion: uci[4] || 'q' });
  } catch {
    return [];
  }
  const themes = new Set<string>();
  if (mv.promotion) themes.add('promotion');
  if (chess.isCheckmate()) themes.add('mate');

  const piece = chess.get(to)!;
  const myValue = PIECE_VALUE[piece.type];

  // Fork: moved piece attacks two or more valuable/undefended enemy targets, and is not trivially lost.
  const targets = attacksFrom(chess, to).filter((s) => {
    const p = chess.get(s);
    if (!p || p.color !== enemy) return false;
    if (p.type === 'k') return true;
    if (p.type === 'p') return false;
    return PIECE_VALUE[p.type] > myValue || !chess.attackers(s, enemy).length;
  });
  if (targets.length >= 2) themes.add('fork');

  // Pin / skewer along the moved slider's lines.
  if ('brq'.includes(piece.type)) {
    const [x, y] = sqToXY(to);
    const dirs: number[][] = [];
    if (piece.type !== 'r') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    if (piece.type !== 'b') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    for (const [dx, dy] of dirs) {
      const hits: { sq: Square; type: PieceSymbol; color: Color }[] = [];
      let cx = x + dx;
      let cy = y + dy;
      while (hits.length < 2) {
        const s = xyToSq(cx, cy);
        if (!s) break;
        const p = chess.get(s);
        if (p) hits.push({ sq: s, type: p.type, color: p.color });
        cx += dx;
        cy += dy;
      }
      if (hits.length === 2 && hits[0].color === enemy && hits[1].color === enemy) {
        const front = PIECE_VALUE[hits[0].type];
        const back = PIECE_VALUE[hits[1].type];
        if (back > front && back >= 5 && front < myValue + 3) themes.add('pin');
        if (front > back && front >= 9 && back >= 3) themes.add('skewer');
      }
    }
  }

  // Discovered attack: another friendly piece now attacks a valuable target it didn't before.
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== mover || p.square === to || !'brq'.includes(p.type)) continue;
      const nowAtt = attacksFrom(chess, p.square);
      const beforeAtt = new Set(attacksFrom(before, p.square));
      for (const s of nowAtt) {
        if (beforeAtt.has(s)) continue;
        const t = chess.get(s);
        if (t && t.color === enemy && (t.type === 'k' || PIECE_VALUE[t.type] >= 5)) {
          themes.add(t.type === 'k' ? 'discoveredCheck' : 'discoveredAttack');
        }
      }
    }
  }

  // Capturing a hanging piece.
  if (captured && captured.type !== 'p') {
    const defended = new Chess(fen).attackers(to, enemy).length > 0;
    if (!defended || PIECE_VALUE[captured.type] > PIECE_VALUE[movingPiece.type]) themes.add('hangingPiece');
  }

  // Sacrifice: moved piece can be captured by a cheaper piece and gains no material immediately.
  if (!chess.isCheckmate()) {
    const capVal = captured ? PIECE_VALUE[captured.type] : 0;
    const attackers = chess.attackers(to, enemy);
    if (attackers.length && myValue >= 3 && capVal < myValue) {
      const cheap = Math.min(...attackers.map((a) => PIECE_VALUE[chess.get(a)!.type]));
      if (cheap < myValue || !chess.attackers(to, mover).length) themes.add('sacrifice');
    }
  }
  return [...themes];
}
