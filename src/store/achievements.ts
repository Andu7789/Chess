import type { ProgressState } from './progress';
import { startOfWeek, streak } from './progress';
import { LESSONS, UNITS } from '../data/lessons';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  check: (s: ProgressState) => boolean;
}

const solvedCount = (s: ProgressState) => Object.values(s.puzzleAttempts).filter((p) => p.solved).length;
const unitDone = (s: ProgressState, unitId: string) =>
  LESSONS.filter((l) => l.unit === unitId).every((l) => s.lessons[l.id]?.completed);

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_lesson', name: 'First Steps', desc: 'Complete your first lesson', icon: '📘', check: (s) => Object.keys(s.lessons).length >= 1 },
  ...UNITS.map((u) => ({
    id: `unit_${u.id}`,
    name: `${u.title} Graduate`,
    desc: `Finish every lesson in “${u.title}”`,
    icon: u.icon,
    check: (s: ProgressState) => unitDone(s, u.id),
  })),
  { id: 'first_puzzle', name: 'Puzzle Solver', desc: 'Solve your first puzzle', icon: '🧩', check: (s) => solvedCount(s) >= 1 },
  { id: 'puzzles_25', name: 'Pattern Spotter', desc: 'Solve 25 puzzles', icon: '🔍', check: (s) => solvedCount(s) >= 25 },
  { id: 'puzzles_100', name: 'Tactics Machine', desc: 'Solve 100 puzzles', icon: '⚙️', check: (s) => solvedCount(s) >= 100 },
  { id: 'rush_10', name: 'Speed Demon', desc: 'Score 10+ in Puzzle Rush', icon: '⚡', check: (s) => s.rushBest >= 10 },
  { id: 'rush_20', name: 'Lightning Brain', desc: 'Score 20+ in Puzzle Rush', icon: '🌩️', check: (s) => s.rushBest >= 20 },
  { id: 'first_win', name: 'Winner!', desc: 'Win a rated game against any bot', icon: '🥇', check: (s) => s.games.some((g) => g.rated && g.result === 'win') },
  { id: 'beat_bea', name: 'Bishop Basher', desc: 'Beat Bishop Bea in a rated game', icon: '🧙', check: (s) => s.beatenBots.includes('bea') },
  { id: 'beat_cara', name: 'Castle Crasher', desc: 'Beat Castle Cara in a rated game', icon: '🏰', check: (s) => s.beatenBots.includes('cara') },
  { id: 'beat_quinn', name: 'Queen Slayer', desc: 'Beat Queen Quinn in a rated game', icon: '👑', check: (s) => s.beatenBots.includes('quinn') },
  { id: 'beat_rachel', name: 'RACHEL DEFEATED', desc: 'Beat the Rachel bot. Now go challenge the real one!', icon: '🏆', check: (s) => s.beatenBots.includes('rachel') },
  { id: 'reviewer', name: 'Student of the Game', desc: 'Review 5 of your games', icon: '🔬', check: (s) => s.games.filter((g) => g.reviewed).length >= 5 },
  { id: 'clean_game', name: 'Clean Sheet', desc: 'Play a reviewed game with zero blunders', icon: '🧼', check: (s) => s.games.some((g) => g.reviewed && g.blunders === 0 && g.moves.length >= 30) },
  { id: 'accuracy_80', name: 'Sharpshooter', desc: 'Reach 80% accuracy in a game', icon: '🎯', check: (s) => s.games.some((g) => (g.accuracy ?? 0) >= 80 && g.moves.length >= 30) },
  { id: 'streak_3', name: 'On a Roll', desc: 'Practise 3 days in a row', icon: '🔥', check: (s) => streak(s.activity).best >= 3 },
  { id: 'streak_7', name: 'Week Warrior', desc: 'Practise 7 days in a row', icon: '📅', check: (s) => streak(s.activity).best >= 7 },
  { id: 'rating_700', name: 'Rising Star', desc: 'Reach a 700 rating', icon: '⭐', check: (s) => s.rating >= 700 },
  { id: 'rating_1000', name: 'Four Digits', desc: 'Reach a 1000 rating', icon: '🌟', check: (s) => s.rating >= 1000 },
  { id: 'rating_rachel', name: 'Rachel Rated', desc: 'Reach Rachel’s rating', icon: '💫', check: (s) => s.rating >= s.settings.rachelRating },
];

export function evaluateAchievements(s: ProgressState) {
  for (const a of ACHIEVEMENTS) if (!s.achievements[a.id] && a.check(s)) s.unlock(a.id);
}

// ---------- Weekly targets ----------

export interface WeeklyTarget {
  id: string;
  text: string;
  goal: number;
  progress: (s: ProgressState, since: number) => number;
}

const TARGET_POOL: WeeklyTarget[] = [
  {
    id: 'puzzles40',
    text: 'Solve 40 puzzles',
    goal: 40,
    progress: (s, since) => s.activity.filter((a) => a.t >= since && a.type === 'puzzle' && a.success).length,
  },
  {
    id: 'wins2',
    text: 'Win 2 rated games',
    goal: 2,
    progress: (s, since) => s.games.filter((g) => g.date >= since && g.rated && g.result === 'win').length,
  },
  {
    id: 'lessons3',
    text: 'Complete 3 lessons',
    goal: 3,
    progress: (s, since) => s.activity.filter((a) => a.t >= since && a.type === 'lesson').length,
  },
  {
    id: 'review2',
    text: 'Review 2 of your games',
    goal: 2,
    progress: (s, since) => s.activity.filter((a) => a.t >= since && a.type === 'review').length,
  },
  {
    id: 'forks8',
    text: 'Solve 8 fork puzzles',
    goal: 8,
    progress: (s, since) =>
      s.activity.filter((a) => a.t >= since && a.type === 'puzzle' && a.success && (a.data?.themes as string[] | undefined)?.includes('fork')).length,
  },
  {
    id: 'mates8',
    text: 'Solve 8 checkmate puzzles',
    goal: 8,
    progress: (s, since) =>
      s.activity.filter(
        (a) => a.t >= since && a.type === 'puzzle' && a.success && (a.data?.themes as string[] | undefined)?.some((t) => t.startsWith('mate')),
      ).length,
  },
  {
    id: 'days5',
    text: 'Practise on 5 different days',
    goal: 5,
    progress: (s, since) => new Set(s.activity.filter((a) => a.t >= since).map((a) => new Date(a.t).toDateString())).size,
  },
  {
    id: 'games4',
    text: 'Play 4 games against the bots',
    goal: 4,
    progress: (s, since) => s.games.filter((g) => g.date >= since).length,
  },
  {
    id: 'acc70',
    text: 'Get 70%+ accuracy in a reviewed game',
    goal: 1,
    progress: (s, since) => s.games.filter((g) => g.date >= since && (g.accuracy ?? 0) >= 70).length,
  },
];

export function weeklyTargets(): { targets: WeeklyTarget[]; since: number } {
  const since = startOfWeek();
  const week = Math.floor(since / (7 * 86400000));
  const picked: WeeklyTarget[] = [];
  let i = week;
  while (picked.length < 4) {
    const t = TARGET_POOL[(i * 7 + picked.length * 3) % TARGET_POOL.length];
    if (!picked.includes(t)) picked.push(t);
    i++;
  }
  return { targets: picked, since };
}

export { LESSONS };
