// Turns a puzzle line into plain-English reasoning: why their move was a mistake,
// why each of your moves works, and what you end up winning.
import { Chess } from 'chess.js';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { attacksFrom, materialCount, other, PIECE_NAME, PIECE_VALUE, sqToXY, xyToSq } from './tactics';

export interface ExplainedStep {
  /** index into the puzzle's moves array */
  ply: number;
  san: string;
  uci: string;
  mine: boolean;
  fenAfter: string;
  text: string;
  /** short label such as "Fork" for the step chip */
  tag?: string;
}

export interface PuzzleExplanation {
  intro: string;
  steps: ExplainedStep[];
  summary: string;
  fenStart: string; // position the solver faces
}

const name = (t: PieceSymbol) => PIECE_NAME[t];
const valueText = (t: PieceSymbol) => (t === 'k' ? 'king' : `${name(t)} (${PIECE_VALUE[t]})`);
const article = (t: PieceSymbol) => `${t === 'k' ? 'the' : 'their'} ${name(t)}`;

function move(c: Chess, uci: string) {
  return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

function defenders(c: Chess, sq: Square, color: Color) {
  return c.attackers(sq, color);
}

/** Legal captures on `sq` for the side to move (respects pins, unlike attackers()). */
function legalCaptures(c: Chess, sq: Square) {
  return c.moves({ verbose: true }).filter((m) => m.to === sq);
}

/** Enemy pieces attacked by the piece on `sq` that are worth attacking. */
function valuableTargets(c: Chess, sq: Square) {
  const me = c.get(sq);
  if (!me) return [];
  const enemy = other(me.color);
  return attacksFrom(c, sq)
    .map((s) => ({ sq: s, p: c.get(s) }))
    .filter(({ p }) => p && p.color === enemy && p.type !== 'p')
    .filter(({ sq: s, p }) => p!.type === 'k' || PIECE_VALUE[p!.type] > PIECE_VALUE[me.type] || !defenders(c, s, enemy).length)
    .map(({ sq: s, p }) => ({ sq: s, type: p!.type }));
}

/** First two pieces hit along each line from a slider. */
function lineHits(c: Chess, sq: Square) {
  const piece = c.get(sq);
  if (!piece || !'brq'.includes(piece.type)) return [];
  const [x, y] = sqToXY(sq);
  const dirs: number[][] = [];
  if (piece.type !== 'r') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  if (piece.type !== 'b') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
  const out: { front: { sq: Square; type: PieceSymbol; color: Color }; back: { sq: Square; type: PieceSymbol; color: Color } }[] = [];
  for (const [dx, dy] of dirs) {
    const hits: { sq: Square; type: PieceSymbol; color: Color }[] = [];
    let cx = x + dx;
    let cy = y + dy;
    while (hits.length < 2) {
      const s = xyToSq(cx, cy);
      if (!s) break;
      const p = c.get(s);
      if (p) hits.push({ sq: s, type: p.type, color: p.color });
      cx += dx;
      cy += dy;
    }
    if (hits.length === 2) out.push({ front: hits[0], back: hits[1] });
  }
  return out;
}

function list(items: string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Explain one move by the solver. `nextMine` is the solver's following move, if any. */
function explainMyMove(before: Chess, uci: string, nextMine?: string): { text: string; tag?: string } {
  const me = before.turn();
  const enemy = other(me);
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const mover = before.get(from)!;
  const captured = before.get(to);
  const after = new Chess(before.fen());
  const mv = move(after, uci);
  const parts: string[] = [];
  let tag: string | undefined;

  if (after.isCheckmate()) {
    const k = after.findPiece({ type: 'k', color: enemy })[0];
    return {
      text: `Checkmate! Their king on ${k} is in check and every escape square is either blocked by its own pieces or covered by yours.`,
      tag: 'Mate',
    };
  }

  // What it captures
  if (captured || mv.isEnPassant()) {
    const capType = captured?.type ?? 'p';
    const wasDefended = defenders(before, to, enemy).length > 0;
    if (!wasDefended) {
      parts.push(`Your ${name(mover.type)} takes ${article(capType)} on ${to}, which nothing was protecting, so it's free.`);
      tag = 'Free piece';
    } else if (PIECE_VALUE[capType] > PIECE_VALUE[mover.type]) {
      parts.push(
        `Your ${name(mover.type)} takes ${article(capType)} on ${to}. Even if they take back, you've swapped a ${valueText(mover.type)} for a ${valueText(capType)}.`,
      );
      tag = 'Good trade';
    } else {
      parts.push(`Your ${name(mover.type)} captures ${article(capType)} on ${to}.`);
    }
  }
  // Removing the defender: the captured piece was guarding something you now attack.
  if (captured) {
    const nextTarget = nextMine ? (nextMine.slice(2, 4) as Square) : null;
    const rows = before.board().flat().filter(Boolean);
    rows.sort((a, b) => (a!.square === nextTarget ? -1 : b!.square === nextTarget ? 1 : PIECE_VALUE[b!.type] - PIECE_VALUE[a!.type]));
    for (const row of [rows]) {
      for (const x of row) {
        if (!x || x.color !== enemy || x.type === 'p' || x.type === 'k' || x.square === to) continue;
        if (!before.attackers(x.square, enemy).includes(to)) continue;
        if (!after.attackers(x.square, me).length) continue;
        parts.push(
          `Just as important, their ${name(captured.type)} on ${to} was the piece **guarding** their ${name(x.type)} on ${x.square}. With the guard gone, that ${name(x.type)} is loose (removing the defender).`,
        );
        tag = 'Remove the defender';
        break;
      }
      if (tag === 'Remove the defender') break;
    }
  }
  if (mv.promotion) {
    parts.push(`The pawn reaches the last rank and becomes a ${name(mv.promotion as PieceSymbol)}.`);
    tag ??= 'Promotion';
  }

  // Check
  const check = after.inCheck();
  const piece = after.get(to)!;

  // Is the moved piece simply lost? Then forks/pins with it don't count.
  const caps = legalCaptures(after, to);
  const att = caps.map((m) => m.from);
  const cheapestAtt = caps.length ? Math.min(...caps.map((m) => PIECE_VALUE[m.piece])) : Infinity;
  const safe = !att.length || (defenders(after, to, me).length > 0 && cheapestAtt >= PIECE_VALUE[piece.type]);

  // Fork
  const targets = safe ? valuableTargets(after, to) : [];
  if (targets.length >= 2) {
    const desc = list(targets.map((t) => (t.type === 'k' ? `the king on ${t.sq}` : `the ${name(t.type)} on ${t.sq}`)));
    parts.push(
      `Your ${name(piece.type)} on ${to} now attacks ${desc} at the same time. That's a **fork**: they can only deal with one of them${check ? ', and since it is check they must save the king first' : ''}.`,
    );
    tag = 'Fork';
  } else if (check) {
    parts.push(`It's **check**, so they have no time for anything else: they must get their king out of danger.`);
    tag ??= 'Check';
  }

  // Pins and skewers from the moved piece
  for (const { front, back } of safe ? lineHits(after, to) : []) {
    if (front.color !== enemy || back.color !== enemy) continue;
    if (front.type !== 'p' && PIECE_VALUE[back.type] > PIECE_VALUE[front.type] && PIECE_VALUE[back.type] >= 5) {
      parts.push(
        `It **pins** their ${name(front.type)} on ${front.sq}: if it moves, the ${name(back.type)} on ${back.sq} behind it is exposed${back.type === 'k' ? ' (so it is not even allowed to move)' : ''}.`,
      );
      tag ??= 'Pin';
    } else if (PIECE_VALUE[front.type] >= 9 && PIECE_VALUE[back.type] >= 3 && front.type !== back.type) {
      parts.push(
        `It's a **skewer**: the ${name(front.type)} on ${front.sq} is attacked and has to move, then the ${name(back.type)} on ${back.sq} behind it falls.`,
      );
      tag ??= 'Skewer';
    }
  }

  // Discovered attacks: another of my pieces sees a big target it couldn't see before
  let discovered = false;
  for (const row of after.board()) {
    if (discovered) break;
    for (const p of row) {
      if (discovered) break;
      if (!p || p.color !== me || p.square === to || !'brq'.includes(p.type)) continue;
      const nowAtt = attacksFrom(after, p.square);
      const beforeAtt = new Set(attacksFrom(before, p.square));
      for (const s of nowAtt) {
        if (beforeAtt.has(s)) continue;
        const t = after.get(s);
        if (t && t.color === enemy && (t.type === 'k' || PIECE_VALUE[t.type] >= 3)) {
          parts.push(
            `Moving the ${name(mover.type)} out of the way **uncovers** your ${name(p.type)} on ${p.square}, which now ${t.type === 'k' ? 'gives check' : `attacks the ${name(t.type)} on ${s}`}. Two threats from one move!`,
          );
          tag ??= t.type === 'k' ? 'Discovered check' : 'Discovered attack';
          discovered = true;
          break;
        }
      }
    }
  }

  // Sacrifice
  if (!check && !discovered && targets.length < 2) {
    const capVal = captured ? PIECE_VALUE[captured.type] : 0;
    if (caps.length && PIECE_VALUE[piece.type] >= 3 && capVal < PIECE_VALUE[piece.type] && (!defenders(after, to, me).length || cheapestAtt < PIECE_VALUE[piece.type])) {
      parts.push(`It looks like you're giving your ${name(piece.type)} away, but that's the point: if they take it, they walk into what comes next.`);
      tag ??= 'Sacrifice';
    }
  }

  // Quiet move: explain via the threat it creates
  if (!parts.length) {
    const hit = valuableTargets(after, to);
    if (hit.length) {
      const t = hit[0];
      parts.push(`Your ${name(piece.type)} moves to ${to} and attacks the ${name(t.type)} on ${t.sq}, and it has no good way to escape.`);
      tag = 'Threat';
    } else if (nextMine) {
      const san = (() => {
        try {
          const c2 = new Chess(after.fen());
          // let them "pass" isn't possible; just describe the follow-up square
          return `${name(c2.get(nextMine.slice(0, 2) as Square)?.type ?? 'p')} to ${nextMine.slice(2, 4)}`;
        } catch {
          return nextMine;
        }
      })();
      parts.push(`A quiet but strong move: it sets up the follow-up (${san}) and they can't stop everything.`);
      tag = 'Quiet move';
    } else {
      parts.push(`This improves your position decisively: every other move lets them off the hook.`);
    }
  }
  return { text: parts.join(' '), tag };
}

let lastMoveTo: Square | null = null;
function explainTheirReply(before: Chess, uci: string, nextMine?: string): string {
  const base = explainTheirReplyBase(before, uci);
  if (!nextMine) return base;
  // Deflection: the piece that just moved used to guard the square you strike next.
  const from = uci.slice(0, 2) as Square;
  const strike = nextMine.slice(2, 4) as Square;
  const them = before.turn();
  const guardedBefore = before.attackers(strike, them).includes(from);
  const after = new Chess(before.fen());
  move(after, uci);
  const p = after.get(uci.slice(2, 4) as Square);
  const target = after.get(strike);
  if (guardedBefore && !after.attackers(strike, them).includes(uci.slice(2, 4) as Square) && p)
    return `${base} But that pulls their ${name(p.type)} away from guarding ${strike}${target ? ` (where their ${name(target.type)} is)` : ''}. That's called **deflection**.`;
  return base;
}

function explainTheirReplyBase(before: Chess, uci: string): string {
  const lastTo = lastMoveTo;
  const c = new Chess(before.fen());
  const wasCheck = c.inCheck();
  const to = uci.slice(2, 4) as Square;
  const captured = c.get(to);
  const mv = move(c, uci);
  const p = mv.piece;
  if (wasCheck) {
    if (captured) return `They get out of check by capturing on ${to} with the ${name(p)}.`;
    if (p === 'k') return `Their king has to step aside to ${to}.`;
    return `They block the check with ${mv.san}.`;
  }
  if (captured) return lastTo === to ? `They take back on ${to} with the ${name(p)}.` : `They capture on ${to} with the ${name(p)}.`;
  if (p !== 'k') return `They play ${mv.san}, the best defence available, but it isn't enough.`;
  return `They reply ${mv.san}.`;
}

/** Why their setup move (moves[0]) was a mistake. */
function explainSetup(startFen: string, setup: string, firstMine: string, endsInMate: boolean): string {
  const c = new Chess(startFen);
  const them = c.turn();
  const fromSq = setup.slice(0, 2) as Square;
  const movedType = c.get(fromSq)?.type ?? 'p';
  const mv = move(c, setup);
  const target = c.get(firstMine.slice(2, 4) as Square);
  const after = new Chess(c.fen());
  const reasons: string[] = [];

  if (after.inCheck()) reasons.push('It gives check, but that doesn’t help them.');
  // Did their move stop defending the piece we capture first?
  const firstTo = firstMine.slice(2, 4) as Square;
  if (target && target.color === them) {
    const before = new Chess(startFen);
    const defBefore = before.attackers(firstTo, them);
    const defAfter = after.attackers(firstTo, them);
    if (mv.to === firstTo) {
      reasons.push(`It puts their ${name(mv.piece)} on ${mv.to}, where you can take it${defAfter.length ? '' : ' and nothing protects it'}.`);
    } else if (defBefore.includes(fromSq) && !defAfter.includes(mv.to)) {
      reasons.push(`Their ${name(movedType)} was guarding the ${name(target.type)} on ${firstTo}, and now it isn't.`);
    }
  }
  if (!reasons.length) {
    // Does your first move attack the piece they just moved?
    const probe = new Chess(after.fen());
    try {
      move(probe, firstMine);
      const hits = attacksFrom(probe, firstTo);
      if (hits.includes(mv.to) && mv.piece !== 'p') reasons.push(`It puts their ${name(mv.piece)} on ${mv.to}, where your next move can attack it.`);
    } catch {
      /* ignore */
    }
  }
  if (!reasons.length && target && target.color === them && target.type !== 'p') {
    // The piece you capture first was already under attack before their move: they ignored it.
    const before = new Chess(startFen);
    if (before.attackers(firstTo, other(them)).length)
      reasons.push(`Their ${name(target.type)} on ${firstTo} was already under attack, and this move does nothing about it.`);
  }
  if (!reasons.length && endsInMate) reasons.push('It misses that their king is short of safe squares: there is a forced checkmate.');
  if (!reasons.length && mv.piece === 'k') reasons.push('Their king walks onto a square where it can be trapped.');
  if (!reasons.length) {
    // did it leave something else undefended?
    const loose = after
      .board()
      .flat()
      .filter((p) => p && p.color === them && p.type !== 'k' && p.type !== 'p' && after.attackers(p.square, other(them)).length && !after.attackers(p.square, them).length);
    if (loose.length) reasons.push(`It leaves their ${name(loose[0]!.type)} on ${loose[0]!.square} unprotected.`);
  }
  if (!reasons.length && mv.captured) reasons.push(`They grabbed material, but it opens the door for you.`);
  if (!reasons.length) reasons.push('It overlooks the tactic you are about to play.');
  return `They just played **${mv.san}**. That's a mistake: ${reasons.join(' ')}`;
}

export function explainPuzzle(fen: string, moves: string[]): PuzzleExplanation {
  const c = new Chess(fen);
  const solver = other(c.turn());
  const endCheck = new Chess(fen);
  for (const m of moves) move(endCheck, m);
  const intro = explainSetup(fen, moves[0], moves[1], endCheck.isCheckmate());
  move(c, moves[0]);
  const fenStart = c.fen();
  const matStart = materialCount(fenStart);
  const steps: ExplainedStep[] = [];
  for (let i = 1; i < moves.length; i++) {
    const mine = i % 2 === 1;
    const before = new Chess(c.fen());
    lastMoveTo = i > 0 ? (moves[i - 1].slice(2, 4) as Square) : null;
    const text = mine ? explainMyMove(before, moves[i], moves[i + 2]) : { text: explainTheirReply(before, moves[i], moves[i + 1]) };
    const mv = move(c, moves[i]);
    steps.push({ ply: i, san: mv.san, uci: moves[i], mine, fenAfter: c.fen(), text: text.text, tag: 'tag' in text ? text.tag : undefined });
  }
  // Summary: what the line wins
  let summary: string;
  if (c.isCheckmate()) summary = 'The line ends in **checkmate**: game over.';
  else {
    const matEnd = materialCount(c.fen());
    const opp = other(solver);
    const rawGain = matEnd[solver] - matEnd[opp] - (matStart[solver] - matStart[opp]);
    let gain = rawGain;
    let trap = '';
    // If they can simply take back the piece that moved last, count that.
    const lastSq = moves[moves.length - 1].slice(2, 4) as Square;
    const last = c.get(lastSq);
    if (last && last.color === solver && last.type !== 'k') {
      const caps = c.isGameOver() ? [] : legalCaptures(c, lastSq);
      if (caps.length) {
        const cheapest = Math.min(...caps.map((m) => PIECE_VALUE[m.piece]));
        gain -= c.attackers(lastSq, solver).length ? Math.max(0, PIECE_VALUE[last.type] - cheapest) : PIECE_VALUE[last.type];
        if (gain < 1 && rawGain >= 1) trap = `${name(last.type)} on ${lastSq}`;
      }
    }
    const wonNames: Record<number, string> = { 1: 'a pawn', 2: 'the exchange', 3: 'a whole piece', 5: 'a rook', 6: 'two pieces', 9: 'the queen' };
    if (trap) {
      summary = `You win material (+${rawGain}), and taking your ${trap} back would be a trap for them: the engine shows it runs into a follow-up tactic. Try it on the board to see!`;
    } else if (gain >= 1) {
      const label = wonNames[gain] ?? `${gain} points of material`;
      summary = `Overall you come out **${label} ahead** (+${gain}). With an advantage like that, trade pieces and convert the win.`;
    } else {
      summary =
        'You don’t win material straight away, but the engine rates your position as winning: their pieces are tied up and the threats keep coming. Keep pressing!';
    }
  }
  return { intro, steps, summary, fenStart };
}
