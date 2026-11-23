import { useEffect, useState } from 'react';
import { useHashRoute, navigate } from './lib/router';
import { useProgress, level } from './store/progress';
import { ACHIEVEMENTS, evaluateAchievements } from './store/achievements';
import Home from './pages/Home';
import Play from './pages/Play';
import Lessons from './pages/Lessons';
import LessonPlayer from './pages/LessonPlayer';
import Puzzles from './pages/Puzzles';
import Review from './pages/Review';
import ProgressPage from './pages/ProgressPage';
import Settings from './pages/Settings';
import { sfx } from './lib/sound';

const NAV = [
  { path: '', label: 'Home', icon: '🏠' },
  { path: 'lessons', label: 'Lessons', icon: '📘' },
  { path: 'puzzles', label: 'Puzzles', icon: '🧩' },
  { path: 'play', label: 'Play', icon: '♟' },
  { path: 'progress', label: 'Progress', icon: '📈' },
  { path: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function App() {
  const [route] = useHashRoute();
  const [section, param] = route;
  const xp = useProgress((s) => s.xp);
  const lvl = level(xp);

  // Evaluate achievements whenever progress changes
  useEffect(() => {
    evaluateAchievements(useProgress.getState());
    return useProgress.subscribe((s, prev) => {
      if (s.activity !== prev.activity || s.games !== prev.games || s.rating !== prev.rating || s.rushBest !== prev.rushBest || s.lessons !== prev.lessons)
        evaluateAchievements(s);
    });
  }, []);

  let page;
  switch (section) {
    case 'lessons':
      page = <Lessons />;
      break;
    case 'lesson':
      page = <LessonPlayer lessonId={param ?? ''} />;
      break;
    case 'puzzles':
      page = <Puzzles />;
      break;
    case 'play':
      page = <Play key={param ?? 'play'} initialBot={param} />;
      break;
    case 'review':
      page = <Review gameId={param} />;
      break;
    case 'progress':
      page = <ProgressPage />;
      break;
    case 'settings':
      page = <Settings />;
      break;
    default:
      page = <Home />;
  }
  const active = section === 'lesson' ? 'lessons' : section === 'review' ? 'progress' : (section ?? '');

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => navigate('/')}>
          <span className="brand-icon">♞</span> Chess Coach <span className="brand-3d">3D</span>
        </button>
        <nav>
          {NAV.map((n) => (
            <button key={n.path} className={`nav-btn ${active === n.path ? 'active' : ''}`} onClick={() => navigate(`/${n.path}`)}>
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="lvl-chip" title={`${xp} XP total`}>
          Lv {lvl.level}
        </div>
      </header>
      <main>{page}</main>
      <Toasts />
    </div>
  );
}

function Toasts() {
  const pending = useProgress((s) => s.pendingToasts.length);
  const [showing, setShowing] = useState<string | null>(null);
  useEffect(() => {
    if (showing || !pending) return;
    const id = useProgress.getState().popToast();
    if (!id) return;
    setShowing(id);
    sfx.success();
    const t = setTimeout(() => setShowing(null), 4200);
    return () => clearTimeout(t);
  }, [pending, showing]);
  const a = ACHIEVEMENTS.find((x) => x.id === showing);
  if (!a) return null;
  return (
    <div className="toast" onClick={() => setShowing(null)}>
      <span className="toast-icon">{a.icon}</span>
      <div>
        <div className="small muted">Achievement unlocked!</div>
        <b>{a.name}</b>
        <div className="small">{a.desc}</div>
      </div>
    </div>
  );
}
