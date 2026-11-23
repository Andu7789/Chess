import { Chess } from 'chess.js';
import type { Color, Square } from 'chess.js';
import { analysisEngine, scoreToCp, winPercent } from './engine';
import type { Mark } from '../board3d/Board3D';
import { detectMotifs, hangingPieces, PIECE_NAME, PIECE_VALUE, other } from './tactics';
import { explainMistake } from './analysis';

export interface MoveCheck {
  /** win% the move throws away */
  winLoss: number;
  severity: 'ok' | 'inaccuracy' | 'mistake' | 'blunder';
  explanation: string;
  bestSan: string;
}

/** Evaluate a candidate move by comparing engine evals before and after. */
export async function checkMove(fen: string, uci: string, depth = 10): Promise<MoveCheck> {
  const engine = analysisEngine();
  const before = await engine.analyse(fen, { depth });
  const c = new Chess(fen);
  const mover = c.turn();
  const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  if (c.isCheckmate()) return { winLoss: 0, severity: 'ok', explanation: '', bestSan: mv.san };
  const after = await engine.analyse(c.fen(), { depth });
  const bCp = before.lines.length ? scoreToCp(before.lines[0].score) : 0;
  const aCp = after.lines.length ? -scoreToCp(after.lines[0].score) : 0;
  const winLoss = Math.max(0, winPercent(bCp) - winPercent(aCp));
  const severity = winLoss >= 25 ? 'blunder' : winLoss >= 14 ? 'mistake' : winLoss >= 7 ? 'inaccuracy' : 'ok';
  let bestSan = '';
  try {
    const b = new Chess(fen);
    bestSan = b.move({ from: before.bestmove.slice(0, 2), to: before.bestmove.slice(2, 4), promotion: before.bestmove[4] }).san;
  } catch {
    /* ignore */
  }
  return {
    winLoss,
    severity,
    explanation: severity === 'ok' ? '' : explainMistake(c.fen(), after.lines[0]?.pv, mover),
    bestSan,
  };
}

export interface Hint {
  level: 1 | 2 | 3;
  text: string;
  marks?: Mark[];
  arrow?: { from: Square; to: Square };
}

/** Three-stage hint for the side to move. */
export async function getHints(fen: string): Promise<Hint[]> {
  const engine = analysisEngine();
  const r = await engine.analyse(fen, { depth: 12 });
  const best = r.bestmove;
  const c = new Chess(fen);
  const from = best.slice(0, 2) as Square;
  const to = best.slice(2, 4) as Square;
  const piece = c.get(from);
  const target = c.get(to);
  const motifs = detectMotifs(fen, best);
  const after = new Chess(fen);
  const mv = after.move({ from, to, promotion: best[4] });
  const myHanging = hangingPieces(fen, c.turn()).filter((h) => h.type !== 'p');

  let nudge: string;
  if (motifs.includes('mate')) nudge = 'There is a checkmate on the board! Look at every check.';
  else if (target && motifs.includes('hangingPiece')) nudge = 'Something of theirs is unprotected. Can you grab it?';
  else if (motifs.includes('fork')) nudge = 'Look for a move that attacks two things at once (a fork).';
  else if (motifs.includes('pin')) nudge = 'Can you pin a piece to something more valuable behind it?';
  else if (motifs.includes('skewer')) nudge = 'Look for a skewer: attack a big piece with something behind it.';
  else if (motifs.includes('discoveredAttack') || motifs.includes('discoveredCheck'))
    nudge = 'Moving one piece out of the way could unleash another one.';
  else if (myHanging.length && from === myHanging[0].square)
    nudge = `Your ${PIECE_NAME[myHanging[0].type]} on ${myHanging[0].square} is in danger. Look after it!`;
  else if (mv.san.includes('+')) nudge = 'Checks are forcing. Consider giving a check.';
  else if (target) nudge = 'Look at the captures available to you.';
  else if (mv.san === 'O-O' || mv.san === 'O-O-O') nudge = 'Think about king safety.';
  else if (piece && (piece.type === 'n' || piece.type === 'b') && c.history().length < 20)
    nudge = 'Develop your pieces toward the centre.';
  else nudge = 'Which of your pieces is doing the least? Find it a better square.';

  return [
    { level: 1, text: nudge },
    {
      level: 2,
      text: `Move your ${piece ? PIECE_NAME[piece.type] : 'piece'} on ${from}.`,
      marks: [{ square: from, color: '#43d17a', kind: 'ring' }],
    },
    { level: 3, text: `The best move is ${mv.san}.`, arrow: { from, to } },
  ];
}

/** Short commentary describing what the opponent's last move threatens. */
export function describeThreats(fenAfterOpponentMove: string, lastUci: string | null): string | null {
  const c = new Chess(fenAfterOpponentMove);
  const me = c.turn();
  if (c.isCheckmate()) return null;
  if (c.inCheck()) return 'You are in check! You must deal with it: move the king, block, or capture the checker.';
  const hanging = hangingPieces(fenAfterOpponentMove, me)
    .filter((h) => h.type !== 'p')
    .sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type]);
  if (lastUci) {
    // reconstruct what they did
    const motifsTo = lastUci.slice(2, 4) as Square;
    const piece = c.get(motifsTo);
    if (hanging.length && piece) {
      const h = hanging[0];
      const attackedByMover = c.attackers(h.square, other(me)).includes(motifsTo);
      if (attackedByMover)
        return `Their ${PIECE_NAME[piece.type]} is now attacking your ${PIECE_NAME[h.type]} on ${h.square}.`;
    }
  }
  if (hanging.length) {
    const h = hanging[0];
    return `Careful: your ${PIECE_NAME[h.type]} on ${h.square} is ${h.reason === 'undefended' ? 'undefended and under attack' : 'attacked by a cheaper piece'}.`;
  }
  const theirs = hangingPieces(fenAfterOpponentMove, other(me)).filter((h) => h.type !== 'p');
  if (theirs.length) return `Opportunity: their ${PIECE_NAME[theirs[0].type]} on ${theirs[0].square} looks loose…`;
  return null;
}

/** Board markers for the danger overlay. */
export function dangerMarks(fen: string, me: Color): Mark[] {
  const marks: Mark[] = [];
  for (const h of hangingPieces(fen, me)) marks.push({ square: h.square, color: '#ff3b3b', kind: 'ring' });
  for (const h of hangingPieces(fen, other(me))) marks.push({ square: h.square, color: '#2fd36b', kind: 'ring' });
  return marks;
}
