import { Chess } from 'chess.js';
import { playEngine, scoreToCp } from './engine';

export interface Bot {
  id: string;
  name: string;
  elo: number;
  avatar: string;
  blurb: string;
  /** true for the "Rachel" milestone bot */
  isRachel?: boolean;
}

export const BASE_BOTS: Bot[] = [
  { id: 'pip', name: 'Pip the Pawn', elo: 250, avatar: '♟', blurb: 'Just learned how the pieces move. Leaves things hanging a lot.' },
  { id: 'rory', name: 'Rookie Rory', elo: 450, avatar: '🐣', blurb: 'Grabs free pieces when it notices them, which isn’t always.' },
  { id: 'bea', name: 'Bishop Bea', elo: 650, avatar: '🧙', blurb: 'Knows the basics. Watch out for simple forks.' },
  { id: 'ned', name: 'Knightly Ned', elo: 850, avatar: '🐴', blurb: 'Loves a knight fork. Punishes loose pieces.' },
  { id: 'cara', name: 'Castle Cara', elo: 1050, avatar: '🏰', blurb: 'Solid club beginner. Plays sensible openings.' },
  { id: 'quinn', name: 'Queen Quinn', elo: 1250, avatar: '👑', blurb: 'Attacks your king the moment you relax.' },
  { id: 'max', name: 'Maestro Max', elo: 1700, avatar: '🎩', blurb: 'Strong club player. Rarely blunders.' },
  { id: 'gm', name: 'Grandmaster Gus', elo: 2200, avatar: '🦉', blurb: 'Plays like a titled player. Good luck!' },
];

export function rachelBot(elo: number): Bot {
  return {
    id: 'rachel',
    name: 'Rachel',
    elo,
    avatar: '🏆',
    blurb: 'The final boss. Beat this bot and you are ready to take on the real Rachel!',
    isRachel: true,
  };
}

/** Ladder of bots with Rachel inserted at her configured rating. */
export function botLadder(rachelElo: number): Bot[] {
  return [...BASE_BOTS, rachelBot(rachelElo)].sort((a, b) => a.elo - b.elo);
}

function rng() {
  return Math.random();
}

/**
 * Choose a move for a bot of the given strength.
 * Above ~1350 Elo Stockfish's own strength limiter is used; below that, we sample from
 * the engine's top moves and sprinkle in human-like mistakes.
 */
export async function botMove(fen: string, elo: number): Promise<string> {
  const engine = playEngine();
  if (elo >= 1350) {
    const res = await engine.analyse(fen, {
      movetime: elo > 2000 ? 900 : 500,
      options: { UCI_LimitStrength: true, UCI_Elo: Math.min(3190, Math.round(elo)) },
    });
    return res.bestmove;
  }
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  if (legal.length === 1) return legal[0].lan;

  const blunderRate = Math.max(0.02, 0.32 - elo / 3500);
  if (rng() < blunderRate) {
    // A "human" mistake: random move, but prefer not to resign the queen instantly at higher levels
    const pick = legal[Math.floor(rng() * legal.length)];
    return pick.lan;
  }
  const depth = Math.max(1, Math.min(6, Math.round(1 + elo / 280)));
  const res = await engine.analyse(fen, { depth, multipv: 6 });
  if (!res.lines.length) return res.bestmove;
  const best = scoreToCp(res.lines[0].score);
  const pBest = 0.3 + elo / 2200; // 0.41 @250 ... 0.88 @1050
  if (rng() < pBest) return res.lines[0].pv[0];
  const maxLoss = Math.max(60, 700 - elo / 2);
  const candidates = res.lines.filter((l) => best - scoreToCp(l.score) <= maxLoss);
  const pick = candidates[Math.floor(rng() * candidates.length)] ?? res.lines[0];
  return pick.pv[0];
}
