import { Chess } from 'chess.js';
import type { Color } from 'chess.js';
import { analysisEngine, scoreToCp, winPercent } from './engine';
import { detectMotifs, hangingPieces, PIECE_NAME } from './tactics';

export type MoveClass = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'book';

export interface ReviewedMove {
  ply: number;
  san: string;
  uci: string;
  color: Color;
  fenBefore: string;
  fenAfter: string;
  /** eval in cp from White's perspective, before and after */
  evalBefore: number;
  evalAfter: number;
  bestUci: string;
  bestSan: string;
  /** win-percentage lost by the mover */
  winLoss: number;
  cls: MoveClass;
  accuracy: number;
  comment: string;
}

export interface GameReview {
  moves: ReviewedMove[];
  accuracy: { w: number; b: number };
  counts: Record<Color, Record<MoveClass, number>>;
  keyMoments: number[]; // indices into moves for the reviewed player's worst moves
}

export function classify(winLoss: number, isBest: boolean, ply: number): MoveClass {
  if (isBest) return ply < 8 ? 'book' : 'best';
  if (winLoss >= 25) return 'blunder';
  if (winLoss >= 14) return 'mistake';
  if (winLoss >= 7) return 'inaccuracy';
  return 'good';
}

export function moveAccuracy(winLoss: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, winLoss)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

function uciToSan(fen: string, uci: string): string {
  try {
    const c = new Chess(fen);
    return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return uci;
  }
}

/** Plain-English explanation of why a move was bad, using the engine's refutation. */
export function explainMistake(fenAfter: string, refutation: string[] | undefined, mover: Color): string {
  const parts: string[] = [];
  const hanging = hangingPieces(fenAfter, mover).filter((h) => h.type !== 'p');
  if (refutation?.length) {
    const replySan = uciToSan(fenAfter, refutation[0]);
    const motifs = detectMotifs(fenAfter, refutation[0]);
    const c = new Chess(fenAfter);
    const target = c.get(refutation[0].slice(2, 4) as never);
    if (motifs.includes('mate')) return `This allows checkmate with ${replySan}.`;
    if (target && target.color === mover)
      parts.push(`Your opponent can capture your ${PIECE_NAME[target.type]} with ${replySan}.`);
    else if (motifs.includes('fork')) parts.push(`It allows a fork with ${replySan}.`);
    else if (motifs.includes('pin')) parts.push(`It allows a pin with ${replySan}.`);
    else if (motifs.includes('skewer')) parts.push(`It allows a skewer with ${replySan}.`);
    else if (motifs.includes('discoveredAttack') || motifs.includes('discoveredCheck'))
      parts.push(`It allows a discovered attack with ${replySan}.`);
    else parts.push(`The strongest reply is ${replySan}.`);
  }
  if (hanging.length && !parts.some((p) => p.includes('capture')))
    parts.push(`Your ${PIECE_NAME[hanging[0].type]} on ${hanging[0].square} is left unprotected.`);
  return parts.join(' ');
}

/**
 * Analyse every move of a game.
 * @param onProgress called with (done, total)
 */
export async function reviewGame(
  pgnOrMoves: string[],
  startFen: string | undefined,
  player: Color,
  onProgress?: (done: number, total: number) => void,
  depth = 11,
): Promise<GameReview> {
  const engine = analysisEngine();
  const chess = new Chess(startFen);
  const fens: string[] = [chess.fen()];
  const played: { san: string; uci: string; color: Color }[] = [];
  for (const san of pgnOrMoves) {
    const m = chess.move(san);
    played.push({ san: m.san, uci: m.lan, color: m.color });
    fens.push(chess.fen());
  }
  // Evaluate every position (White's perspective)
  const evals: number[] = [];
  const bests: string[] = [];
  const pvs: string[][] = [];
  for (let i = 0; i < fens.length; i++) {
    const c = new Chess(fens[i]);
    if (c.isCheckmate()) {
      evals.push(c.turn() === 'w' ? -10000 : 10000);
      bests.push('');
      pvs.push([]);
    } else if (c.isDraw() || c.isStalemate()) {
      evals.push(0);
      bests.push('');
      pvs.push([]);
    } else {
      const r = await engine.analyse(fens[i], { depth });
      const cp = r.lines.length ? scoreToCp(r.lines[0].score) : 0;
      evals.push(c.turn() === 'w' ? cp : -cp);
      bests.push(r.bestmove);
      pvs.push(r.lines[0]?.pv ?? []);
    }
    onProgress?.(i + 1, fens.length);
  }

  const moves: ReviewedMove[] = played.map((m, i) => {
    const sign = m.color === 'w' ? 1 : -1;
    const before = winPercent(sign * evals[i]);
    const after = winPercent(sign * evals[i + 1]);
    const winLoss = Math.max(0, before - after);
    const isBest = m.uci === bests[i];
    const cls = classify(winLoss, isBest, i);
    let comment = '';
    if (cls === 'blunder' || cls === 'mistake' || cls === 'inaccuracy') {
      comment = explainMistake(fens[i + 1], pvs[i + 1], m.color);
    }
    return {
      ply: i,
      san: m.san,
      uci: m.uci,
      color: m.color,
      fenBefore: fens[i],
      fenAfter: fens[i + 1],
      evalBefore: evals[i],
      evalAfter: evals[i + 1],
      bestUci: bests[i],
      bestSan: bests[i] ? uciToSan(fens[i], bests[i]) : '',
      winLoss,
      cls,
      accuracy: moveAccuracy(winLoss),
      comment,
    };
  });

  const empty = (): Record<MoveClass, number> => ({ best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, book: 0 });
  const counts = { w: empty(), b: empty() };
  const acc = { w: [] as number[], b: [] as number[] };
  for (const m of moves) {
    counts[m.color][m.cls]++;
    acc[m.color].push(m.accuracy);
  }
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
  const keyMoments = moves
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.color === player && (m.cls === 'blunder' || m.cls === 'mistake'))
    .sort((a, b) => b.m.winLoss - a.m.winLoss)
    .slice(0, 3)
    .map(({ i }) => i)
    .sort((a, b) => a - b);
  return { moves, accuracy: { w: avg(acc.w), b: avg(acc.b) }, counts, keyMoments };
}
