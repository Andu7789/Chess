import raw from './puzzles.json';

export interface Puzzle {
  id: string;
  fen: string;
  /** moves[0] is the opponent's move that sets up the puzzle; then solver/opponent alternate */
  moves: string[];
  themes: string[];
  rating: number;
}

export const PUZZLES: Puzzle[] = (raw as Puzzle[]).slice().sort((a, b) => a.rating - b.rating);

export const THEME_LABELS: Record<string, string> = {
  mate: 'Checkmate',
  mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2',
  mateIn3: 'Mate in 3',
  backRankMate: 'Back-rank mate',
  fork: 'Fork',
  pin: 'Pin',
  skewer: 'Skewer',
  discoveredAttack: 'Discovered attack',
  discoveredCheck: 'Discovered check',
  hangingPiece: 'Free piece',
  sacrifice: 'Sacrifice',
  promotion: 'Promotion',
  advantage: 'Win material',
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
};

export const FILTER_THEMES = ['mate', 'fork', 'pin', 'skewer', 'discoveredAttack', 'hangingPiece', 'sacrifice', 'promotion', 'endgame'];

export function puzzleHasTheme(p: Puzzle, theme: string) {
  if (theme === 'mate') return p.themes.some((t) => t.startsWith('mate'));
  if (theme === 'discoveredAttack') return p.themes.includes('discoveredAttack') || p.themes.includes('discoveredCheck');
  return p.themes.includes(theme);
}

export function puzzleById(id: string) {
  return PUZZLES.find((p) => p.id === id);
}

/** Pick a puzzle near `rating` that hasn't been attempted (or was failed long ago). */
export function pickPuzzle(
  rating: number,
  attempts: Record<string, { solved: boolean; t: number }>,
  theme?: string | null,
  exclude: Set<string> = new Set(),
): Puzzle | undefined {
  let pool = PUZZLES.filter((p) => !exclude.has(p.id) && (!theme || puzzleHasTheme(p, theme)));
  const fresh = pool.filter((p) => !attempts[p.id]);
  if (fresh.length) pool = fresh;
  if (!pool.length) return undefined;
  for (const window of [120, 220, 400, 800, 5000]) {
    const near = pool.filter((p) => Math.abs(p.rating - rating) <= window);
    if (near.length) return near[Math.floor(Math.random() * near.length)];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
