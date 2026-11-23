// Minimal promise-based UCI wrapper around the Node build of stockfish.js.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
const require = createRequire(import.meta.url);

export async function createEngine() {
  const listeners = new Set();
  const enginePath = require('stockfish').findEngine('lite-single');
  const child = spawn(process.execPath, [enginePath], { stdio: ['pipe', 'pipe', 'inherit'] });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    for (const l of [...listeners]) l(line);
  });
  const sf = { processCommand: (c) => child.stdin.write(c + '\n'), terminate: () => child.kill() };
  const waitFor = (pred, collect) =>
    new Promise((resolve) => {
      const fn = (line) => {
        if (collect) collect(line);
        if (pred(line)) {
          listeners.delete(fn);
          resolve(line);
        }
      };
      listeners.add(fn);
    });
  const send = (cmd) => sf.processCommand(cmd);

  send('uci');
  await waitFor((l) => l === 'uciok');
  send('setoption name Hash value 32');
  send('isready');
  await waitFor((l) => l === 'readyok');

  /** Analyse a position; returns multipv lines [{score:{cp|mate}, pv:[uci...]}] sorted by multipv. */
  async function analyse(fen, { depth = 12, multipv = 1, nodes } = {}) {
    if (process.env.SFDEBUG) console.error("FEN", fen);
    send(`setoption name MultiPV value ${multipv}`);
    send(`position fen ${fen}`);
    const lines = {};
    const collect = (line) => {
      if (!line.startsWith('info') || !line.includes(' pv ')) return;
      const mpv = Number(/ multipv (\d+)/.exec(line)?.[1] ?? 1);
      const cp = /score cp (-?\d+)/.exec(line);
      const mate = /score mate (-?\d+)/.exec(line);
      const pv = line.split(' pv ')[1].trim().split(' ');
      const d = Number(/ depth (\d+)/.exec(line)?.[1] ?? 0);
      lines[mpv] = { depth: d, score: mate ? { mate: Number(mate[1]) } : { cp: Number(cp?.[1] ?? 0) }, pv };
    };
    send(nodes ? `go nodes ${nodes}` : `go depth ${depth}`);
    const best = await waitFor((l) => l.startsWith('bestmove'), collect);
    const out = Object.keys(lines)
      .map(Number)
      .sort((a, b) => a - b)
      .map((k) => lines[k]);
    return { lines: out, bestmove: best.split(' ')[1] };
  }

  async function newGame() {
    send('ucinewgame');
    send('isready');
    await waitFor((l) => l === 'readyok');
  }

  return { analyse, newGame, quit: () => sf.terminate?.() };
}

/** Convert a score to centipawns from side-to-move perspective (mate => large). */
export function toCp(score) {
  if (score.mate !== undefined) return score.mate > 0 ? 100000 - score.mate * 100 : -100000 - score.mate * 100;
  return score.cp;
}
