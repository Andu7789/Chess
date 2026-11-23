// Validates every lesson: FEN legality, puzzle move legality, and (with Stockfish) that the
// expected moves are actually good. Usage: node scripts/validate-lessons.mjs
import { Chess } from 'chess.js';
import { createEngine, toCp } from './uci-node.mjs';
import { LESSONS } from '../src/data/lessons.ts';

const engine = await createEngine();
let problems = 0;
const warn = (lesson, i, msg) => {
  problems++;
  console.log(`✗ [${lesson.id} step ${i + 1}] ${msg}`);
};

function load(fen, lax) {
  return new Chess(fen, lax ? { skipValidation: true } : undefined);
}

for (const lesson of LESSONS) {
  for (const [i, step] of lesson.steps.entries()) {
    try {
      if (step.kind === 'info' || step.kind === 'quiz') {
        if (step.fen) load(step.fen, true);
        if (step.kind === 'quiz' && (step.answer < 0 || step.answer >= step.options.length)) warn(lesson, i, 'bad answer index');
      } else if (step.kind === 'collect') {
        // BFS over positions of the single white piece (turn forced back to white)
        const startFen = step.fen;
        const want = new Set(step.stars);
        // check reachability greedily in order
        let fen = startFen;
        let total = 0;
        for (const star of step.stars) {
          const seen = new Map([[fen, 0]]);
          const q = [fen];
          let found = null;
          while (q.length && !found) {
            const f = q.shift();
            const c = load(f, true);
            for (const m of c.moves({ verbose: true })) {
              const c2 = load(f, true);
              c2.move(m);
              const parts = c2.fen().split(' ');
              parts[1] = 'w';
              parts[3] = '-';
              const nf = parts.join(' ');
              if (seen.has(nf)) continue;
              seen.set(nf, seen.get(f) + 1);
              if (m.to === star) {
                found = nf;
                break;
              }
              q.push(nf);
            }
          }
          if (!found) {
            warn(lesson, i, `star ${star} unreachable`);
            break;
          }
          total += seen.get(found);
          fen = found;
        }
        if (total > step.par) warn(lesson, i, `par ${step.par} too low (greedy path ${total})`);
        void want;
      } else if (step.kind === 'puzzle') {
        if (step.moves.length % 2 === 0) warn(lesson, i, 'puzzle must end with the player move');
        const c = load(step.fen);
        for (const [mi, mv] of step.moves.entries()) {
          const alts = mv.split('|');
          if (mi % 2 === 0) {
            // player move: evaluate alternatives
            const fen = c.fen();
            const res = await engine.analyse(fen, { depth: 14, multipv: 1 });
            const best = toCp(res.lines[0].score);
            for (const alt of alts) {
              const cc = new Chess(fen);
              cc.move({ from: alt.slice(0, 2), to: alt.slice(2, 4), promotion: alt[4] });
              if (cc.isCheckmate()) continue;
              const after = await engine.analyse(cc.fen(), { depth: 14 });
              const v = -toCp(after.lines[0]?.score ?? { cp: 0 });
              if (best - v > 120 && !(best > 450 && v > 450))
                warn(lesson, i, `move ${alt} is ${best - v}cp worse than best ${res.bestmove} (best ${best}, this ${v})`);
            }
          } else {
            const fen = c.fen();
            const res = await engine.analyse(fen, { depth: 12 });
            if (res.bestmove !== alts[0]) console.log(`  · [${lesson.id} ${i + 1}] reply ${alts[0]} (engine prefers ${res.bestmove})`);
          }
          c.move({ from: alts[0].slice(0, 2), to: alts[0].slice(2, 4), promotion: alts[0][4] });
        }
        if (step.acceptAnyMate && !c.isCheckmate()) warn(lesson, i, 'acceptAnyMate but line does not end in mate');
      } else if (step.kind === 'goal') {
        load(step.fen);
        const res = await engine.analyse(step.fen, { depth: 18 });
        const v = toCp(res.lines[0].score);
        if (v < 400) warn(lesson, i, `goal position eval only ${v}`);
      }
    } catch (e) {
      warn(lesson, i, `error: ${e.message}`);
    }
  }
}
console.log(problems ? `\n${problems} problem(s)` : '\nAll lessons valid ✓');
engine.quit();
process.exit(problems ? 1 : 0);
