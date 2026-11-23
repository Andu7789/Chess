import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ActivityType = 'lesson' | 'puzzle' | 'game' | 'review' | 'rush';

export interface Activity {
  t: number; // timestamp
  type: ActivityType;
  /** puzzle: solved? game: won? */
  success?: boolean;
  /** extra info, e.g. themes, accuracy, botId */
  data?: Record<string, unknown>;
}

export interface GameRecord {
  id: string;
  date: number;
  botId: string;
  botName: string;
  botElo: number;
  color: 'w' | 'b';
  result: 'win' | 'loss' | 'draw';
  reason: string;
  moves: string[]; // SAN
  rated: boolean;
  ratingChange?: number;
  accuracy?: number;
  blunders?: number;
  mistakes?: number;
  reviewed?: boolean;
}

export interface Settings {
  rachelRating: number;
  boardTheme: string;
  topDown: boolean;
  sound: boolean;
  warnBlunders: boolean;
  showDanger: boolean;
  showEval: boolean;
  dailyGoal: { lessons: number; puzzles: number; games: number };
  playerName: string;
}

export interface ThemeStat {
  solved: number;
  failed: number;
}

export interface ProgressState {
  rating: number;
  puzzleRating: number;
  ratedGames: number;
  xp: number;
  ratingHistory: { t: number; rating: number; puzzleRating: number }[];
  games: GameRecord[];
  lessons: Record<string, { completed: boolean; date: number; stars: number }>;
  puzzleAttempts: Record<string, { solved: boolean; t: number; tries: number }>;
  themeStats: Record<string, ThemeStat>;
  reviewQueue: { id: string; due: number }[];
  rushBest: number;
  beatenBots: string[];
  activity: Activity[];
  achievements: Record<string, number>;
  settings: Settings;
  /** achievements unlocked since last viewed (for toasts) */
  pendingToasts: string[];

  addXp: (n: number) => void;
  recordActivity: (a: Omit<Activity, 't'>) => void;
  completeLesson: (id: string, stars: number) => void;
  recordPuzzle: (id: string, rating: number, themes: string[], solved: boolean, rated: boolean) => number;
  recordGame: (g: Omit<GameRecord, 'id' | 'date' | 'ratingChange'>) => GameRecord;
  updateGame: (id: string, patch: Partial<GameRecord>) => void;
  setRushBest: (n: number) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  unlock: (id: string) => void;
  popToast: () => string | undefined;
  resetAll: () => void;
}

export const START_RATING = 400;

export function expectedScore(a: number, b: number) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

const defaultSettings: Settings = {
  rachelRating: 1400,
  boardTheme: 'walnut',
  topDown: false,
  sound: true,
  warnBlunders: true,
  showDanger: true,
  showEval: false,
  dailyGoal: { lessons: 1, puzzles: 10, games: 1 },
  playerName: 'You',
};

const initial = () => ({
  rating: START_RATING,
  puzzleRating: 600,
  ratedGames: 0,
  xp: 0,
  ratingHistory: [{ t: Date.now(), rating: START_RATING, puzzleRating: 600 }],
  games: [] as GameRecord[],
  lessons: {},
  puzzleAttempts: {},
  themeStats: {},
  reviewQueue: [],
  rushBest: 0,
  beatenBots: [],
  activity: [] as Activity[],
  achievements: {},
  settings: defaultSettings,
  pendingToasts: [] as string[],
});

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...initial(),

      addXp: (n) => set((s) => ({ xp: s.xp + n })),

      recordActivity: (a) =>
        set((s) => ({ activity: [...s.activity.slice(-1999), { ...a, t: Date.now() }] })),

      completeLesson: (id, stars) => {
        const prev = get().lessons[id];
        const first = !prev?.completed;
        set((s) => ({
          lessons: { ...s.lessons, [id]: { completed: true, date: Date.now(), stars: Math.max(stars, prev?.stars ?? 0) } },
          xp: s.xp + (first ? 50 : 10),
        }));
        get().recordActivity({ type: 'lesson', success: true, data: { id } });
      },

      recordPuzzle: (id, rating, themes, solved, rated) => {
        const s = get();
        let delta = 0;
        if (rated) {
          const k = Object.keys(s.puzzleAttempts).length < 30 ? 40 : 22;
          delta = Math.round(k * ((solved ? 1 : 0) - expectedScore(s.puzzleRating, rating)));
        }
        const themeStats = { ...s.themeStats };
        for (const th of themes) {
          const cur = themeStats[th] ?? { solved: 0, failed: 0 };
          themeStats[th] = solved ? { ...cur, solved: cur.solved + 1 } : { ...cur, failed: cur.failed + 1 };
        }
        const prev = s.puzzleAttempts[id];
        // spaced repetition: failed puzzles come back in 1 day, then 3, 7...
        let reviewQueue = s.reviewQueue.filter((r) => r.id !== id);
        if (!solved) reviewQueue = [...reviewQueue, { id, due: Date.now() + 1000 * 60 * 60 * 20 }];
        else if (prev && !prev.solved) reviewQueue = [...reviewQueue, { id, due: Date.now() + 1000 * 60 * 60 * 24 * 4 }];
        const puzzleRating = Math.max(100, s.puzzleRating + delta);
        set({
          puzzleRating,
          themeStats,
          reviewQueue,
          puzzleAttempts: { ...s.puzzleAttempts, [id]: { solved, t: Date.now(), tries: (prev?.tries ?? 0) + 1 } },
          xp: s.xp + (solved ? 10 : 2),
          ratingHistory: rated ? [...s.ratingHistory, { t: Date.now(), rating: s.rating, puzzleRating }] : s.ratingHistory,
        });
        get().recordActivity({ type: 'puzzle', success: solved, data: { id, themes, rating } });
        return delta;
      },

      recordGame: (g) => {
        const s = get();
        let ratingChange = 0;
        if (g.rated) {
          const score = g.result === 'win' ? 1 : g.result === 'draw' ? 0.5 : 0;
          const k = s.ratedGames < 10 ? 60 : s.ratedGames < 30 ? 36 : 24;
          ratingChange = Math.round(k * (score - expectedScore(s.rating, g.botElo)));
        }
        const rec: GameRecord = { ...g, id: `${Date.now()}`, date: Date.now(), ratingChange };
        const rating = Math.max(100, s.rating + ratingChange);
        const won = g.result === 'win';
        set({
          games: [rec, ...s.games].slice(0, 200),
          rating,
          ratedGames: s.ratedGames + (g.rated ? 1 : 0),
          beatenBots: won && g.rated && !s.beatenBots.includes(g.botId) ? [...s.beatenBots, g.botId] : s.beatenBots,
          xp: s.xp + (won ? 60 : g.result === 'draw' ? 30 : 15),
          ratingHistory: g.rated ? [...s.ratingHistory, { t: Date.now(), rating, puzzleRating: s.puzzleRating }] : s.ratingHistory,
        });
        get().recordActivity({ type: 'game', success: won, data: { botId: g.botId, result: g.result, rated: g.rated } });
        return rec;
      },

      updateGame: (id, patch) => set((s) => ({ games: s.games.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),

      setRushBest: (n) => set((s) => ({ rushBest: Math.max(s.rushBest, n) })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      unlock: (id) => {
        if (get().achievements[id]) return;
        set((s) => ({ achievements: { ...s.achievements, [id]: Date.now() }, pendingToasts: [...s.pendingToasts, id], xp: s.xp + 25 }));
      },

      popToast: () => {
        const [first, ...rest] = get().pendingToasts;
        if (first) set({ pendingToasts: rest });
        return first;
      },

      resetAll: () => set({ ...initial(), settings: get().settings }),
    }),
    {
      name: 'chess-coach-progress-v1',
      version: 1,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProgressState>;
        return { ...current, ...p, settings: { ...defaultSettings, ...(p.settings ?? {}) } };
      },
    },
  ),
);

// ---------- Derived helpers ----------

export function dayKey(t: number) {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfWeek(t = Date.now()) {
  const d = new Date(t);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function todayCounts(activity: Activity[]) {
  const today = dayKey(Date.now());
  const c = { lessons: 0, puzzles: 0, games: 0 };
  for (const a of activity) {
    if (dayKey(a.t) !== today) continue;
    if (a.type === 'lesson') c.lessons++;
    if (a.type === 'puzzle' && a.success) c.puzzles++;
    if (a.type === 'game') c.games++;
  }
  return c;
}

/** Consecutive days (ending today or yesterday) with any activity. */
export function streak(activity: Activity[]): { current: number; best: number } {
  const days = new Set(activity.map((a) => dayKey(a.t)));
  const oneDay = 86400000;
  let current = 0;
  let t = Date.now();
  if (!days.has(dayKey(t))) t -= oneDay; // streak survives until end of today
  while (days.has(dayKey(t))) {
    current++;
    t -= oneDay;
  }
  // best streak
  const sorted = [...days]
    .map((k) => {
      const [y, m, d] = k.split('-').map(Number);
      return new Date(y, m - 1, d).getTime();
    })
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = -Infinity;
  for (const d of sorted) {
    run = Math.round((d - prev) / oneDay) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best: Math.max(best, current) };
}

export function level(xp: number) {
  // Each level needs a little more XP than the last.
  let lvl = 1;
  let need = 100;
  let rem = xp;
  while (rem >= need) {
    rem -= need;
    lvl++;
    need = Math.round(need * 1.15);
  }
  return { level: lvl, into: rem, need };
}

export const LEVEL_TITLES = [
  'Beginner',
  'Pawn Pusher',
  'Apprentice',
  'Tactician',
  'Club Hopeful',
  'Club Player',
  'Strategist',
  'Expert',
  'Candidate Master',
  'Rachel Slayer',
];
export function levelTitle(lvl: number) {
  return LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((lvl - 1) / 3))];
}
