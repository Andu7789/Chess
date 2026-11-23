import type { ProgressState } from './progress';
import { todayCounts } from './progress';
import { LESSONS } from '../data/lessons';
import { botLadder } from '../chess/bots';
import { THEME_LABELS } from '../data/puzzles';

export interface Skill {
  id: string;
  name: string;
  value: number; // 0-100
  detail: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function rate(s: ProgressState, pred: (t: string) => boolean) {
  let ok = 0;
  let bad = 0;
  for (const [t, st] of Object.entries(s.themeStats))
    if (pred(t)) {
      ok += st.solved;
      bad += st.failed;
    }
  return { ok, bad, pct: ok + bad ? ok / (ok + bad) : null };
}

function unitPct(s: ProgressState, unit: string) {
  const ls = LESSONS.filter((l) => l.unit === unit);
  return ls.filter((l) => s.lessons[l.id]?.completed).length / ls.length;
}

export function skills(s: ProgressState): Skill[] {
  const tac = rate(s, (t) => ['fork', 'pin', 'skewer', 'discoveredAttack', 'discoveredCheck', 'hangingPiece', 'sacrifice'].includes(t));
  const mates = rate(s, (t) => t.startsWith('mate') || t === 'backRankMate');
  const end = rate(s, (t) => t === 'endgame' || t === 'promotion');
  const reviewed = s.games.filter((g) => g.reviewed && g.moves.length >= 20).slice(0, 10);
  const avgBlunders = reviewed.length ? reviewed.reduce((a, g) => a + (g.blunders ?? 0), 0) / reviewed.length : null;
  const avgAcc = reviewed.length ? reviewed.reduce((a, g) => a + (g.accuracy ?? 0), 0) / reviewed.length : null;
  return [
    {
      id: 'tactics',
      name: 'Tactics',
      value: clamp(((s.puzzleRating - 200) / 1600) * 70 + (tac.pct ?? 0) * 20 + unitPct(s, 'tactics') * 10),
      detail: tac.pct === null ? 'Solve some puzzles to measure this.' : `${Math.round(tac.pct * 100)}% of tactic puzzles solved`,
    },
    {
      id: 'mates',
      name: 'Checkmates',
      value: clamp(unitPct(s, 'mates') * 50 + (mates.pct ?? 0) * 50),
      detail: mates.pct === null ? 'Checkmate lessons + mate puzzles.' : `${Math.round(mates.pct * 100)}% of mate puzzles solved`,
    },
    {
      id: 'openings',
      name: 'Openings',
      value: clamp(unitPct(s, 'openings') * 60 + unitPct(s, 'basics') * 15 + (avgAcc ?? 0) * 0.25),
      detail: `${Math.round(unitPct(s, 'openings') * 100)}% of opening lessons done`,
    },
    {
      id: 'endgames',
      name: 'Endgames',
      value: clamp(unitPct(s, 'endgames') * 65 + (end.pct ?? 0) * 35),
      detail: `${Math.round(unitPct(s, 'endgames') * 100)}% of endgame lessons done`,
    },
    {
      id: 'safety',
      name: 'Blunder control',
      value: avgBlunders === null ? 0 : clamp(100 - avgBlunders * 22),
      detail: avgBlunders === null ? 'Review your games to measure this.' : `${avgBlunders.toFixed(1)} blunders per reviewed game`,
    },
  ];
}

export interface Recommendation {
  icon: string;
  title: string;
  why: string;
  href: string;
}

export function recommendations(s: ProgressState): Recommendation[] {
  const out: Recommendation[] = [];
  const today = todayCounts(s.activity);
  const lastGame = s.games[0];
  if (lastGame && !lastGame.reviewed)
    out.push({
      icon: '🔬',
      title: 'Review your last game',
      why: `Find out where the game vs ${lastGame.botName} turned. Reviewing is the fastest way to stop repeating mistakes.`,
      href: `/review/${lastGame.id}`,
    });
  const nextL = LESSONS.find((l) => !s.lessons[l.id]?.completed);
  if (nextL && today.lessons < s.settings.dailyGoal.lessons)
    out.push({ icon: '📘', title: `Lesson: ${nextL.title}`, why: nextL.summary, href: `/lesson/${nextL.id}` });
  const due = s.reviewQueue.filter((r) => r.due <= Date.now()).length;
  if (due) out.push({ icon: '🔁', title: `Retry ${due} missed puzzle${due > 1 ? 's' : ''}`, why: 'Repetition makes patterns stick.', href: '/puzzles' });
  // weakest theme
  const themes = Object.entries(s.themeStats)
    .filter(([t, st]) => st.solved + st.failed >= 4 && ['fork', 'pin', 'skewer', 'hangingPiece', 'discoveredAttack', 'mateIn1', 'mateIn2', 'endgame'].includes(t))
    .map(([t, st]) => ({ t, pct: st.solved / (st.solved + st.failed) }))
    .sort((a, b) => a.pct - b.pct);
  if (themes.length && themes[0].pct < 0.7)
    out.push({
      icon: '🎯',
      title: `Train ${THEME_LABELS[themes[0].t] ?? themes[0].t} puzzles`,
      why: `Your weakest theme (${Math.round(themes[0].pct * 100)}% solved).`,
      href: '/puzzles',
    });
  if (today.puzzles < s.settings.dailyGoal.puzzles)
    out.push({ icon: '🧩', title: 'Solve some puzzles', why: `${today.puzzles}/${s.settings.dailyGoal.puzzles} today. Tactics win games at every level.`, href: '/puzzles' });
  const ladder = botLadder(s.settings.rachelRating);
  const nextBot = ladder.find((b) => !s.beatenBots.includes(b.id));
  if (nextBot)
    out.push({
      icon: nextBot.avatar,
      title: `Challenge ${nextBot.name}`,
      why: s.games.length < 3 ? 'Practice games have the coach switched on: a great way to learn.' : `Next rung on the Rachel Ladder (≈${nextBot.elo}).`,
      href: `/play/${nextBot.id}`,
    });
  return out.slice(0, 3);
}
