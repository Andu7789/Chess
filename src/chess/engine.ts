// Browser wrapper around the Stockfish (lite, single-threaded) web worker.
// Commands are serialised through a queue so callers can simply `await`.

export type Score = { cp: number; mate?: undefined } | { mate: number; cp?: undefined };
export interface PvLine {
  depth: number;
  score: Score;
  pv: string[];
}
export interface AnalysisResult {
  lines: PvLine[];
  bestmove: string;
}
export interface AnalyseOptions {
  depth?: number;
  movetime?: number;
  multipv?: number;
  /** extra setoption commands to send before searching */
  options?: Record<string, string | number | boolean>;
}

type Job = () => Promise<void>;

export class Engine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private queue: Job[] = [];
  private running = false;
  private ready: Promise<void>;
  private currentOptions = new Map<string, string>();

  constructor() {
    this.worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`);
    this.worker.onmessage = (e: MessageEvent) => {
      const line = String(e.data);
      for (const l of [...this.listeners]) l(line);
    };
    this.ready = (async () => {
      this.send('uci');
      await this.waitFor((l) => l === 'uciok');
      this.send('setoption name Hash value 16');
      this.send('isready');
      await this.waitFor((l) => l === 'readyok');
    })();
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private waitFor(pred: (l: string) => boolean, collect?: (l: string) => void): Promise<string> {
    return new Promise((resolve) => {
      const fn = (line: string) => {
        collect?.(line);
        if (pred(line)) {
          this.listeners.delete(fn);
          resolve(line);
        }
      };
      this.listeners.add(fn);
    });
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
      void this.pump();
    });
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    await this.ready;
    while (this.queue.length) {
      const job = this.queue.shift()!;
      await job();
    }
    this.running = false;
  }

  private setOption(name: string, value: string | number | boolean) {
    const v = String(value);
    if (this.currentOptions.get(name) === v) return;
    this.currentOptions.set(name, v);
    this.send(`setoption name ${name} value ${v}`);
  }

  /** Drop any queued (not yet started) jobs. */
  clearQueue() {
    this.queue.length = 0;
  }

  newGame(): Promise<void> {
    return this.enqueue(async () => {
      this.send('ucinewgame');
      this.send('isready');
      await this.waitFor((l) => l === 'readyok');
    });
  }

  analyse(fen: string, opts: AnalyseOptions = {}): Promise<AnalysisResult> {
    return this.enqueue(async () => {
      const multipv = opts.multipv ?? 1;
      const limit = opts.options?.UCI_LimitStrength ?? false;
      this.setOption('UCI_LimitStrength', limit);
      for (const [k, v] of Object.entries(opts.options ?? {})) this.setOption(k, v);
      this.setOption('MultiPV', multipv);
      this.send(`position fen ${fen}`);
      const lines: Record<number, PvLine> = {};
      const collect = (line: string) => {
        if (!line.startsWith('info') || !line.includes(' pv ')) return;
        const mpv = Number(/ multipv (\d+)/.exec(line)?.[1] ?? 1);
        const cp = / score cp (-?\d+)/.exec(line);
        const mate = / score mate (-?\d+)/.exec(line);
        const depth = Number(/ depth (\d+)/.exec(line)?.[1] ?? 0);
        const pv = line.split(' pv ')[1].trim().split(' ');
        lines[mpv] = { depth, score: mate ? { mate: Number(mate[1]) } : { cp: Number(cp?.[1] ?? 0) }, pv };
      };
      this.send(opts.movetime ? `go movetime ${opts.movetime}` : `go depth ${opts.depth ?? 12}`);
      const best = await this.waitFor((l) => l.startsWith('bestmove'), collect);
      const bestmove = best.split(' ')[1];
      const out = Object.keys(lines)
        .map(Number)
        .sort((a, b) => a - b)
        .map((k) => lines[k]);
      return { lines: out, bestmove };
    });
  }

  terminate() {
    this.worker.terminate();
  }
}

/** Score in centipawns from side-to-move's perspective; mates mapped to large values. */
export function scoreToCp(s: Score): number {
  if (s.mate !== undefined) return s.mate > 0 ? 10000 - s.mate * 10 : -10000 - s.mate * 10;
  return s.cp;
}

/** Lichess-style win probability (0-100) for the side whose cp score this is. */
export function winPercent(cp: number): number {
  const c = Math.max(-1500, Math.min(1500, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

let shared: { play?: Engine; analysis?: Engine } = {};
/** Engine used for the computer opponent. */
export function playEngine(): Engine {
  return (shared.play ??= new Engine());
}
/** Engine used for coaching, hints and reviews. */
export function analysisEngine(): Engine {
  return (shared.analysis ??= new Engine());
}
export function resetEngines() {
  shared.play?.terminate();
  shared.analysis?.terminate();
  shared = {};
}
