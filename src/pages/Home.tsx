import { useMemo } from 'react';
import { useProgress, todayCounts, streak, level, levelTitle, START_RATING } from '../store/progress';
import { recommendations } from '../store/insights';
import { weeklyTargets, ACHIEVEMENTS } from '../store/achievements';
import { botLadder } from '../chess/bots';
import { navigate } from '../lib/router';

export default function Home() {
  const s = useProgress();
  const today = todayCounts(s.activity);
  const st = streak(s.activity);
  const lvl = level(s.xp);
  const recs = recommendations(s);
  const { targets, since } = weeklyTargets();
  const ladder = useMemo(() => botLadder(s.settings.rachelRating), [s.settings.rachelRating]);
  const rachel = s.settings.rachelRating;
  const base = Math.min(START_RATING, s.rating, 250) - 50;
  const pos = (elo: number) => Math.max(0, Math.min(100, ((elo - base) / Math.max(1, rachel - base)) * 100));
  const pct = pos(s.rating);
  const goals = s.settings.dailyGoal;
  const goalItems = [
    { label: 'Lessons', icon: '📘', have: today.lessons, need: goals.lessons },
    { label: 'Puzzles', icon: '🧩', have: today.puzzles, need: goals.puzzles },
    { label: 'Games', icon: '♟', have: today.games, need: goals.games },
  ];
  const dailyDone = goalItems.every((g) => g.have >= g.need);
  const recent = Object.entries(s.achievements)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => ACHIEVEMENTS.find((a) => a.id === id))
    .filter(Boolean);
  const firstTime = s.activity.length === 0;

  return (
    <div className="page">
      <div className="hero">
        <div>
          <h1>{firstTime ? 'Welcome to Chess Coach 3D!' : `Welcome back, ${s.settings.playerName === 'You' ? 'champ' : s.settings.playerName}!`}</h1>
          <p className="muted">
            {firstTime
              ? 'Your mission: get good enough to beat Rachel. Start with a lesson, solve some puzzles, and climb the bot ladder.'
              : `Level ${lvl.level} · ${levelTitle(lvl.level)} · ${st.current > 0 ? `🔥 ${st.current}-day streak` : 'Start a streak today!'}`}
          </p>
          <div className="xpbar" title={`${lvl.into}/${lvl.need} XP to next level`}>
            <div style={{ width: `${(lvl.into / lvl.need) * 100}%` }} />
            <span>
              {lvl.into}/{lvl.need} XP
            </span>
          </div>
        </div>
        <div className="hero-stats">
          <div>
            <div className="small muted">Rating</div>
            <div className="acc-big">{s.rating}</div>
          </div>
          <div>
            <div className="small muted">Puzzles</div>
            <div className="acc-big">{s.puzzleRating}</div>
          </div>
          <div>
            <div className="small muted">Streak</div>
            <div className="acc-big">🔥{st.current}</div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <section className="card rachel-card">
          <div className="row between">
            <h2>🏆 The Rachel Ladder</h2>
            <span className="muted small">Target ≈{rachel}</span>
          </div>
          <div className="ladder-track">
            <div className="ladder-fill" style={{ width: `${pct}%` }} />
            {ladder.map((b) => {
                            if (b.elo > rachel) return null;
              return (
                <button
                  key={b.id}
                  className={`ladder-node ${s.beatenBots.includes(b.id) ? 'beaten' : ''} ${b.isRachel ? 'rachel' : ''}`}
                  style={{ left: `${pos(b.elo)}%` }}
                  title={`${b.name} ≈${b.elo}`}
                  onClick={() => navigate(`/play/${b.id}`)}
                >
                  {b.avatar}
                </button>
              );
            })}
            <div className="ladder-you" style={{ left: `${pct}%` }}>
              You
            </div>
          </div>
          <p className="muted small">
            {s.rating >= rachel
              ? 'You’ve reached Rachel’s level! Prove it by beating the Rachel bot, then challenge the real thing.'
              : `${rachel - s.rating} rating points to go. Beat each bot in a rated game to climb.`}
          </p>
        </section>

        <section className="card">
          <div className="row between">
            <h2>📅 Today’s goals</h2>
            {dailyDone && <span className="tag good">All done!</span>}
          </div>
          <div className="goals">
            {goalItems.map((g) => (
              <div key={g.label} className="goal">
                <div className="goal-ring" style={{ ['--p' as string]: `${Math.min(1, g.have / g.need) * 100}` }}>
                  <span>{g.icon}</span>
                </div>
                <div>
                  <b>
                    {Math.min(g.have, g.need)}/{g.need}
                  </b>{' '}
                  <span className="muted">{g.label}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <h2>🧭 Coach recommends</h2>
        <div className="recs">
          {recs.map((r) => (
            <button key={r.title} className="rec" onClick={() => navigate(r.href)}>
              <span className="rec-icon">{r.icon}</span>
              <span>
                <b>{r.title}</b>
                <span className="small muted block">{r.why}</span>
              </span>
              <span className="rec-go">→</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>🎯 This week’s targets</h2>
          {targets.map((t) => {
            const p = Math.min(t.goal, t.progress(s, since));
            return (
              <div key={t.id} className="target">
                <div className="row between">
                  <span>{p >= t.goal ? '✅' : '⬜'} {t.text}</span>
                  <span className="muted small">
                    {p}/{t.goal}
                  </span>
                </div>
                <div className="progress thin">
                  <div style={{ width: `${(p / t.goal) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </section>
        <section className="card">
          <div className="row between">
            <h2>🏅 Achievements</h2>
            <button className="btn small ghost" onClick={() => navigate('/progress')}>
              See all
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="muted">Complete your first lesson to earn a badge!</p>
          ) : (
            <div className="ach-row">
              {recent.map((a) => (
                <div key={a!.id} className="ach unlocked" title={a!.desc}>
                  <span className="ach-icon">{a!.icon}</span>
                  <span className="small">{a!.name}</span>
                </div>
              ))}
            </div>
          )}
          <p className="small muted">
            {Object.keys(s.achievements).length}/{ACHIEVEMENTS.length} unlocked
          </p>
        </section>
      </div>
    </div>
  );
}
