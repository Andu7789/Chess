import { useProgress, streak } from '../store/progress';
import { skills } from '../store/insights';
import { ACHIEVEMENTS } from '../store/achievements';
import RatingChart from '../components/RatingChart';
import { navigate } from '../lib/router';

export default function ProgressPage() {
  const s = useProgress();
  const sk = skills(s);
  const st = streak(s.activity);
  const solved = Object.values(s.puzzleAttempts).filter((p) => p.solved).length;
  const attempted = Object.keys(s.puzzleAttempts).length;
  const wins = s.games.filter((g) => g.result === 'win').length;
  const lessonsDone = Object.values(s.lessons).filter((l) => l.completed).length;

  return (
    <div className="page">
      <h1>Your Progress</h1>
      <div className="stat-tiles">
        <div className="tile">
          <div className="small muted">Game rating</div>
          <div className="acc-big">{s.rating}</div>
        </div>
        <div className="tile">
          <div className="small muted">Puzzle rating</div>
          <div className="acc-big">{s.puzzleRating}</div>
        </div>
        <div className="tile">
          <div className="small muted">Games won</div>
          <div className="acc-big">
            {wins}
            <span className="muted small">/{s.games.length}</span>
          </div>
        </div>
        <div className="tile">
          <div className="small muted">Puzzles solved</div>
          <div className="acc-big">
            {solved}
            <span className="muted small">/{attempted}</span>
          </div>
        </div>
        <div className="tile">
          <div className="small muted">Lessons</div>
          <div className="acc-big">{lessonsDone}</div>
        </div>
        <div className="tile">
          <div className="small muted">Best streak</div>
          <div className="acc-big">🔥{st.best}</div>
        </div>
      </div>

      <section className="card">
        <h2>Rating over time</h2>
        <RatingChart history={s.ratingHistory} />
      </section>

      <section className="card">
        <h2>Skill profile</h2>
        <div className="skills">
          {sk.map((k) => (
            <div key={k.id} className="skill">
              <div className="row between">
                <b>{k.name}</b>
                <span>{k.value}</span>
              </div>
              <div className="meter">
                <div style={{ width: `${k.value}%` }} />
              </div>
              <div className="small muted">{k.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>
          Achievements ({Object.keys(s.achievements).length}/{ACHIEVEMENTS.length})
        </h2>
        <div className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const got = s.achievements[a.id];
            return (
              <div key={a.id} className={`ach ${got ? 'unlocked' : ''}`} title={a.desc}>
                <span className="ach-icon">{got ? a.icon : '🔒'}</span>
                <b className="small">{a.name}</b>
                <span className="small muted">{a.desc}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Game history</h2>
        {s.games.length === 0 ? (
          <p className="muted">No games yet.</p>
        ) : (
          <table className="games-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Opponent</th>
                <th>Result</th>
                <th>Type</th>
                <th>Accuracy</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {s.games.slice(0, 40).map((g) => (
                <tr key={g.id}>
                  <td>{new Date(g.date).toLocaleDateString()}</td>
                  <td>
                    {g.botName} <span className="muted small">≈{g.botElo}</span>
                  </td>
                  <td className={g.result === 'win' ? 'pos' : g.result === 'loss' ? 'neg' : ''}>
                    {g.result} <span className="muted small">({g.reason})</span>
                  </td>
                  <td>
                    {g.rated ? 'Rated' : 'Practice'}{' '}
                    {g.rated && g.ratingChange !== undefined && (
                      <span className={g.ratingChange >= 0 ? 'pos' : 'neg'}>
                        {g.ratingChange >= 0 ? '+' : ''}
                        {g.ratingChange}
                      </span>
                    )}
                  </td>
                  <td>{g.accuracy !== undefined ? `${g.accuracy}%` : '–'}</td>
                  <td>
                    <button className="btn small" onClick={() => navigate(`/review/${g.id}`)}>
                      {g.reviewed ? 'View' : 'Review'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
