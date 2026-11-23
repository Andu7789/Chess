import { LESSONS, UNITS } from '../data/lessons';
import { useProgress } from '../store/progress';
import { navigate } from '../lib/router';

export default function Lessons() {
  const lessons = useProgress((s) => s.lessons);
  const total = LESSONS.length;
  const done = LESSONS.filter((l) => lessons[l.id]?.completed).length;
  const next = LESSONS.find((l) => !lessons[l.id]?.completed);

  return (
    <div className="page">
      <h1>Lessons</h1>
      <p className="muted">
        {done}/{total} lessons complete. Each unit unlocks when you’ve finished most of the one before it, but you can always peek ahead.
      </p>
      <div className="progress">
        <div style={{ width: `${(done / total) * 100}%` }} />
      </div>
      {next && (
        <button className="btn primary big continue-btn" onClick={() => navigate(`/lesson/${next.id}`)}>
          ▶ Continue: {next.title}
        </button>
      )}
      {UNITS.map((u, ui) => {
        const ul = LESSONS.filter((l) => l.unit === u.id);
        const udone = ul.filter((l) => lessons[l.id]?.completed).length;
        const prev = ui > 0 ? LESSONS.filter((l) => l.unit === UNITS[ui - 1].id) : [];
        const prevDone = prev.filter((l) => lessons[l.id]?.completed).length;
        const locked = ui > 0 && prevDone < Math.ceil(prev.length * 0.6);
        return (
          <section key={u.id} className={`unit ${locked ? 'locked' : ''}`}>
            <div className="unit-head">
              <span className="unit-icon">{u.icon}</span>
              <div>
                <h2>
                  Unit {ui + 1}: {u.title} {locked && <span className="tag">🔒 recommended later</span>}
                </h2>
                <p className="muted">{u.blurb}</p>
              </div>
              <span className="unit-count">
                {udone}/{ul.length}
              </span>
            </div>
            <div className="lesson-grid">
              {ul.map((l) => {
                const rec = lessons[l.id];
                return (
                  <button key={l.id} className={`lesson-card ${rec?.completed ? 'done' : ''}`} onClick={() => navigate(`/lesson/${l.id}`)}>
                    <div className="lesson-title">{l.title}</div>
                    <div className="small muted">{l.summary}</div>
                    <div className="lesson-meta">
                      <span>⏱ {l.minutes} min</span>
                      <span className="stars">{rec?.completed ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : '☆☆☆'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
