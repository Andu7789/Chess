// Generates tactical puzzles by letting Stockfish play imperfect games against itself and
// harvesting positions where one side blunders and the other has a single winning reply.
//
// Usage: node scripts/gen-puzzles.mjs <outFile.jsonl> <targetCount> [seed]
import fs from 'node:fs';
import { Chess } from 'chess.js';
import { createEngine, toCp } from './uci-node.mjs';
import { detectMotifs, materialCount } from '../src/chess/tactics.ts';

const [, , outFile = 'puzzles.jsonl', targetArg = '100', seedArg = '1'] = process.argv;
const target = Number(targetArg);
// mulberry32: small, decent-quality seeded PRNG
let seed = (Number(seedArg) * 2654435761) >>> 0;
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const engine = await createEngine();
const out = fs.createWriteStream(outFile, { flags: 'a' });
const seen = new Set();
let found = 0;

const ANALYSIS = { depth: 12, multipv: 2 };
const WIN = 250; // cp the solver must be ahead by after the blunder
const GAP = 220; // best move must beat the 2nd best by this much

function isUnique(lines) {
  if (!lines.length) return false;
  const best = toCp(lines[0].score);
  if (best < WIN) return false;
  if (lines.length < 2) return true; // only legal move
  const second = toCp(lines[1].score);
  if (lines[0].score.mate !== undefined && lines[0].score.mate > 0) {
    // mate: alternative must not also be a mate
    const m2 = lines[1].score.mate;
    return !(m2 !== undefined && m2 > 0 && m2 <= lines[0].score.mate);
  }
  return best - second >= GAP && second < WIN + 150;
}

async function buildSolution(fen, firstLines) {
  const chess = new Chess(fen);
  const solution = [];
  let lines = firstLines;
  for (let step = 0; step < 4; step++) {
    const mv = lines[0].pv[0];
    chess.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] });
    solution.push(mv);
    if (chess.isGameOver()) break;
    // opponent best reply
    const opp = await engine.analyse(chess.fen(), { depth: 12, multipv: 1 });
    const reply = opp.bestmove;
    const replyChess = new Chess(chess.fen());
    replyChess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
    if (replyChess.isGameOver()) break;
    const next = await engine.analyse(replyChess.fen(), ANALYSIS);
    // Continue only while the solver still has a single clearly-best move,
    // and the line isn't just "already winning, anything works".
    const matePuzzle = firstLines[0].score.mate !== undefined;
    if (!isUnique(next.lines)) break;
    if (!matePuzzle && step >= 1) break;
    chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
    solution.push(reply);
    lines = next.lines;
  }
  return { solution, final: chess };
}

function rate({ mateIn, playerMoves, firstIsForcing, shallowFinds, themes }) {
  let r = 700;
  if (mateIn === 1) r = 550;
  r += (playerMoves - 1) * 260;
  if (!firstIsForcing) r += 180;
  if (!shallowFinds) r += 280;
  if (themes.includes('sacrifice')) r += 150;
  if (themes.includes('discoveredAttack') || themes.includes('skewer')) r += 80;
  r += Math.round((rand() - 0.5) * 120);
  return Math.max(400, Math.min(2300, Math.round(r / 10) * 10));
}

async function pickMove(fen, ply) {
  // Opening: random among decent moves. Later: mostly good, sometimes a slip.
  if (ply < 2) {
    // fully random first moves give every game a different opening
    const legal = new Chess(fen).moves({ verbose: true });
    return legal[Math.floor(rand() * legal.length)].lan;
  }
  if (ply < 8) {
    const a = await engine.analyse(fen, { depth: 6, multipv: 4 });
    const ok = a.lines.filter((l) => toCp(l.score) > toCp(a.lines[0].score) - 60);
    return ok[Math.floor(rand() * ok.length)].pv[0];
  }
  const a = await engine.analyse(fen, { depth: 5 + Math.floor(rand() * 4), multipv: 5 });
  const r = rand();
  const idx = r < 0.62 ? 0 : Math.min(a.lines.length - 1, 1 + Math.floor(rand() * (a.lines.length - 1)));
  return { move: a.lines[idx].pv[0], lines: a.lines }.move;
}

while (found < target) {
  await engine.newGame();
  const game = new Chess();
  let prevFen = null;
  let prevEval = null; // eval (side to move) of the previous position
  let prevMove = null;
  for (let ply = 0; ply < 140 && !game.isGameOver(); ply++) {
    const fen = game.fen();
    const a = await engine.analyse(fen, ANALYSIS);
    const evalHere = a.lines.length ? toCp(a.lines[0].score) : 0;
    if (ply >= 10 && prevFen && prevEval !== null && prevEval > -180 && prevEval < 300 && isUnique(a.lines)) {
      const key = fen.split(' ').slice(0, 4).join(' ');
      if (!seen.has(key)) {
        seen.add(key);
        const { solution, final } = await buildSolution(fen, a.lines);
        const playerMoves = solution.filter((_, i) => i % 2 === 0);
        const themes = new Set();
        const tmp = new Chess(fen);
        solution.forEach((m, i) => {
          if (i % 2 === 0) detectMotifs(tmp.fen(), m).forEach((t) => themes.add(t));
          tmp.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
        });
        let mateIn;
        if (final.isCheckmate()) {
          mateIn = playerMoves.length;
          themes.add(`mateIn${mateIn}`);
          const kSq = final.findPiece({ type: 'k', color: final.turn() })[0];
          const rank = kSq[1];
          if ((final.turn() === 'w' && rank === '1') || (final.turn() === 'b' && rank === '8')) {
            const lastPiece = final.get(solution[solution.length - 1].slice(2, 4));
            if (lastPiece && 'rq'.includes(lastPiece.type)) themes.add('backRankMate');
          }
        }
        const mat = materialCount(fen);
        if (mat.w + mat.b <= 26) themes.add('endgame');
        else if (ply < 24) themes.add('opening');
        else themes.add('middlegame');
        const first = new Chess(fen).move({
          from: solution[0].slice(0, 2),
          to: solution[0].slice(2, 4),
          promotion: solution[0][4],
        });
        const firstIsForcing = !!(first.captured || first.san.includes('+'));
        const shallow = await engine.analyse(fen, { depth: 3, multipv: 1 });
        const shallowFinds = shallow.bestmove === solution[0];
        const hasMotif = [...themes].some((t) =>
          ['fork', 'pin', 'skewer', 'discoveredAttack', 'discoveredCheck', 'hangingPiece', 'promotion', 'sacrifice'].includes(t) || t.startsWith('mate'),
        );
        if (!hasMotif) themes.add('advantage');
        const puzzle = {
          id: `g${seedArg}-${found}`,
          fen: prevFen,
          moves: [prevMove, ...solution],
          themes: [...themes],
          rating: rate({ mateIn, playerMoves: playerMoves.length, firstIsForcing, shallowFinds, themes: [...themes] }),
        };
        const firstMate = a.lines[0].score.mate;
        const incompleteMate = firstMate !== undefined && firstMate <= 4 && !final.isCheckmate();
        // Must end on the solver's move.
        if (solution.length % 2 === 1 && !incompleteMate) {
          out.write(JSON.stringify(puzzle) + '\n');
          found++;
          if (found % 10 === 0) console.log(`[${seedArg}] ${found}/${target}`);
          break; // one puzzle per game keeps variety high
        }
      }
    }
    prevFen = fen;
    prevEval = evalHere;
    const mv = await pickMove(fen, ply);
    prevMove = mv;
    game.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] });
  }
}
out.end();
engine.quit();
process.exit(0);
