import { useProgress } from '../store/progress';
import { BOARD_THEMES } from '../board3d/themes';

const RACHEL_PRESETS = [
  { label: 'Casual player', elo: 1000 },
  { label: 'Beats me easily', elo: 1400 },
  { label: 'Plays at a club', elo: 1700 },
  { label: 'Seriously strong', elo: 2000 },
];

export default function Settings() {
  const { settings, updateSettings, resetAll } = useProgress();
  return (
    <div className="page narrow">
      <h1>Settings</h1>

      <section className="card">
        <h2>🏆 How strong is Rachel?</h2>
        <p className="muted">This sets the Rachel bot and the top of your ladder. If you find out her real rating, enter it here.</p>
        <div className="chips">
          {RACHEL_PRESETS.map((p) => (
            <button key={p.elo} className={`chip ${settings.rachelRating === p.elo ? 'on' : ''}`} onClick={() => updateSettings({ rachelRating: p.elo })}>
              {p.label} (≈{p.elo})
            </button>
          ))}
        </div>
        <label className="field">
          Exact rating
          <input
            type="number"
            min={600}
            max={2800}
            step={50}
            value={settings.rachelRating}
            onChange={(e) => updateSettings({ rachelRating: Math.max(600, Math.min(2800, Number(e.target.value) || 1400)) })}
          />
        </label>
      </section>

      <section className="card">
        <h2>Board</h2>
        <div className="theme-row">
          {BOARD_THEMES.map((t) => (
            <button key={t.id} className={`theme-swatch ${settings.boardTheme === t.id ? 'on' : ''}`} onClick={() => updateSettings({ boardTheme: t.id })}>
              <span className="sw">
                <i style={{ background: t.light }} />
                <i style={{ background: t.dark }} />
                <i style={{ background: t.dark }} />
                <i style={{ background: t.light }} />
              </span>
              {t.name}
            </button>
          ))}
        </div>
        <Toggle label="Start boards in top-down (2D-style) view" value={settings.topDown} onChange={(v) => updateSettings({ topDown: v })} />
        <Toggle label="Sound effects" value={settings.sound} onChange={(v) => updateSettings({ sound: v })} />
      </section>

      <section className="card">
        <h2>Coach (practice games)</h2>
        <Toggle label="Warn me before I play a blunder" value={settings.warnBlunders} onChange={(v) => updateSettings({ warnBlunders: v })} />
        <Toggle label="Show danger overlay (pieces under attack)" value={settings.showDanger} onChange={(v) => updateSettings({ showDanger: v })} />
        <Toggle label="Show evaluation bar" value={settings.showEval} onChange={(v) => updateSettings({ showEval: v })} />
      </section>

      <section className="card">
        <h2>Daily goals</h2>
        {(['lessons', 'puzzles', 'games'] as const).map((k) => (
          <label key={k} className="field row between">
            <span style={{ textTransform: 'capitalize' }}>{k} per day</span>
            <input
              type="number"
              min={0}
              max={50}
              value={settings.dailyGoal[k]}
              onChange={(e) => updateSettings({ dailyGoal: { ...settings.dailyGoal, [k]: Math.max(0, Math.min(50, Number(e.target.value) || 0)) } })}
            />
          </label>
        ))}
        <label className="field row between">
          <span>Your name</span>
          <input value={settings.playerName} maxLength={20} onChange={(e) => updateSettings({ playerName: e.target.value || 'You' })} />
        </label>
      </section>

      <section className="card">
        <h2>Data</h2>
        <p className="muted small">Your progress is saved in this browser only.</p>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm('Reset ALL progress (ratings, lessons, puzzles, games)? This cannot be undone.')) resetAll();
          }}
        >
          Reset all progress
        </button>
      </section>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-ui" />
      {label}
    </label>
  );
}
