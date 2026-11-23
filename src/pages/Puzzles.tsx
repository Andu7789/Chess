import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Color, Square } from 'chess.js';
import PlayableBoard from '../components/PlayableBoard';
import type { Arrow } from '../board3d/Board3D';
import { FILTER_THEMES, pickPuzzle, puzzleById, PUZZLES, THEME_LABELS } from '../data/puzzles';
import type { Puzzle } from '../data/puzzles';
import { useProgress } from '../store/progress';
import { playMoveSound, sfx } from '../lib/sound';

type Mode = 'rated' | 'rush' | 'review';

export default function Puzzles() {
  const [mode, setMode] = useState<Mode>('rated');
  const reviewDue = useProgress((s) => s.reviewQueue.filter((r) => r.due <= Date.now()).length);
  return (
    <div className="page wide">
      <div className="row between wrap">
        <h1>Puzzles</h1>
        <div className="seg">
          <button className={mode === 'rated' ? 'on' : ''} onClick={() => setMode('rated')}>
            🧩 Puzzles
          </button>
          <button className={mode === 'review' ? 'on' : ''} onClick={() => setMode('review')}>
            🔁 Retry missed {reviewDue > 0 && <span className="badge">{reviewDue}</span>}
          </button>
          <button className={mode === 'rush' ? 'on' : ''} onClick={() => setMode('rush')}>
            ⚡ Puzzle Rush
          </button>
        </div>
      </div>
      {mode === 'rated' && <RatedPuzzles />}
      {mode === 'review' && <ReviewPuzzles />}
      {mode === 'rush' && <PuzzleRush />}
    </div>
  );
}

// ───────────────────────── Core puzzle board ─────────────────────────

interface SolverProps {
  puzzle: Puzzle;
  onResult: (solved: boolean, usedHint: boolean) => void;
  /** in rush mode a wrong move ends the puzzle immediately */
  strict?: boolean;
  showSolutionOnFail?: boolean;
}

function puzzleOrientation(p: Puzzle): Color {
  return new Chess(p.fen).turn() === 'w' ? 'b' : 'w';
}

function PuzzleSolver({ puzzle, onResult, strict, showSolutionOnFail = true }: SolverProps) {
  const chessRef = useRef(new Chess(puzzle.fen));
  const [fen, setFen] = useState(puzzle.fen);
  const [idx, setIdx] = useState(0); // index into moves of the next expected move
  const [state, setState] = useState<'intro' | 'solving' | 'solved' | 'failed'>('intro');
  const [last, setLast] = useState<{ from: Square; to: Square } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [hintLevel, setHintLevel] = useState(0);
  const failed = useRef(false);
  const orientation = puzzleOrientation(puzzle);

  const play = useCallback((uci: string) => {
    const c = chessRef.current;
    const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    playMoveSound(mv.san);
    setFen(c.fen());
    setLast({ from: mv.from, to: mv.to });
    return mv;
  }, []);

  // Play the opponent's setup move
  useEffect(() => {
    const t = setTimeout(() => {
      play(puzzle.moves[0]);
      setIdx(1);
      setState('solving');
      setMsg({ tone: 'info', text: `Find the best move for ${orientation === 'w' ? 'White' : 'Black'}.` });
    }, 700);
    return () => clearTimeout(t);
  }, [puzzle, play, orientation]);

  const onMove = (uci: string) => {
    if (state !== 'solving') return;
    const expected = puzzle.moves[idx];
    const isFinal = idx === puzzle.moves.length - 1;
    const test = new Chess(chessRef.current.fen());
    const mv = test.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    const correct = uci === expected || (uci.slice(0, 4) === expected.slice(0, 4) && !expected[4]) || (isFinal && test.isCheckmate());
    if (!correct) {
      sfx.fail();
      if (!failed.current) {
        failed.current = true;
        if (strict) {
          setState('failed');
          setMsg({ tone: 'bad', text: `✗ ${mv.san} isn’t it.` });
          onResult(false, hintLevel > 0);
          return;
        }
        onResult(false, hintLevel > 0);
      }
      setMsg({ tone: 'bad', text: `✗ ${mv.san} isn’t the solution. Try again, or show the answer.` });
      return;
    }
    play(uci);
    setArrows([]);
    if (isFinal) {
      setState('solved');
      sfx.success();
      setMsg({ tone: 'good', text: failed.current ? 'Solved (after a miss).' : '✓ Solved!' });
      if (!failed.current) onResult(true, hintLevel > 0);
      return;
    }
    setMsg({ tone: 'good', text: `✓ ${mv.san}, keep going!` });
    const reply = puzzle.moves[idx + 1];
    setTimeout(() => {
      play(reply);
      setIdx(idx + 2);
    }, 550);
  };

  const hint = () => {
    const exp = puzzle.moves[idx];
    if (hintLevel === 0) {
      setHintLevel(1);
      const c = chessRef.current;
      const p = c.get(exp.slice(0, 2) as Square);
      setMsg({ tone: 'info', text: `💡 Look at your ${p ? { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[p.type] : 'piece'} on ${exp.slice(0, 2)}.` });
      setArrows([]);
    } else {
      setHintLevel(2);
      setArrows([{ from: exp.slice(0, 2) as Square, to: exp.slice(2, 4) as Square, color: '#35c46a' }]);
    }
  };

  const showSolution = () => {
    if (!failed.current) {
      failed.current = true;
      onResult(false, true);
    }
    setState('failed');
    // play out the rest
    let i = idx;
    const step = () => {
      if (i >= puzzle.moves.length) return;
      play(puzzle.moves[i]);
      i++;
      setTimeout(step, 700);
    };
    step();
    setMsg({ tone: 'info', text: 'Here’s the solution.' });
  };

  const hintMarks = hintLevel === 1 ? [{ square: puzzle.moves[idx]?.slice(0, 2) as Square, color: '#35c46a', kind: 'ring' as const }] : [];

  return (
    <div className="puzzle-solver">
      <PlayableBoard fen={fen} orientation={orientation} interactive={state === 'solving'} onMove={onMove} lastMove={last} arrows={arrows} marks={hintMarks} />
      <div className="puzzle-bar">
        <span className={`turn-dot ${orientation}`} /> {orientation === 'w' ? 'White' : 'Black'} to play
        {msg && <span className={`inline-msg ${msg.tone}`}>{msg.text}</span>}
        {!strict && state === 'solving' && (
          <>
            <button className="btn small" onClick={hint}>
              💡 Hint
            </button>
            {showSolutionOnFail && (
              <button className="btn small ghost" onClick={showSolution}>
                Show answer
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Rated mode ─────────────────────────

function RatedPuzzles() {
  const { puzzleRating, puzzleAttempts, recordPuzzle, themeStats } = useProgress();
  const [theme, setTheme] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | undefined>(() => pickPuzzle(puzzleRating, puzzleAttempts, null));
  const [result, setResult] = useState<{ solved: boolean; delta: number } | null>(null);
  const [n, setN] = useState(0);
  const seen = useRef(new Set<string>());

  const next = (th = theme) => {
    if (puzzle) seen.current.add(puzzle.id);
    const s = useProgress.getState();
    setPuzzle(pickPuzzle(s.puzzleRating, s.puzzleAttempts, th, seen.current));
    setResult(null);
    setN((x) => x + 1);
  };

  if (!puzzle) return <p className="muted">No puzzles match that filter yet.</p>;
  return (
    <div className="play-layout">
      <div className="board-col">
        <PuzzleSolver
          key={`${puzzle.id}-${n}`}
          puzzle={puzzle}
          onResult={(solved, usedHint) => {
            const ok = solved && !usedHint;
            const delta = recordPuzzle(puzzle.id, puzzle.rating, puzzle.themes, ok, true);
            setResult({ solved: ok, delta });
          }}
        />
      </div>
      <aside className="side-col">
        <div className="card">
          <h3>Puzzle rating</h3>
          <div className="acc-big">{puzzleRating}</div>
          {result && (
            <p className={result.delta >= 0 ? 'pos' : 'neg'}>
              {result.solved ? '✓ Solved' : '✗ Missed'} ({result.delta >= 0 ? '+' : ''}
              {result.delta})
            </p>
          )}
          <p className="small muted">
            This puzzle: ≈{puzzle.rating}. Using a hint counts as a miss.{' '}
            {result && <>Themes: {puzzle.themes.map((t) => THEME_LABELS[t] ?? t).join(', ')}</>}
          </p>
          <button className="btn primary big" onClick={() => next()}>
            {result ? 'Next puzzle →' : 'Skip →'}
          </button>
        </div>
        <div className="card">
          <h3>Train a theme</h3>
          <div className="chips">
            <button className={`chip ${theme === null ? 'on' : ''}`} onClick={() => { setTheme(null); next(null); }}>
              Mixed
            </button>
            {FILTER_THEMES.map((t) => {
              const st = themeStats[t === 'mate' ? 'mateIn1' : t];
              return (
                <button
                  key={t}
                  className={`chip ${theme === t ? 'on' : ''}`}
                  onClick={() => {
                    setTheme(t);
                    next(t);
                  }}
                >
                  {THEME_LABELS[t]}
                  {st && <span className="chip-stat">{Math.round((st.solved / Math.max(1, st.solved + st.failed)) * 100)}%</span>}
                </button>
              );
            })}
          </div>
          <p className="small muted">{PUZZLES.length} puzzles in the library, generated and checked by the Stockfish engine.</p>
        </div>
      </aside>
    </div>
  );
}

// ───────────────────────── Review (spaced repetition) ─────────────────────────

function ReviewPuzzles() {
  const { reviewQueue, recordPuzzle } = useProgress();
  const due = useMemo(() => reviewQueue.filter((r) => r.due <= Date.now()).map((r) => puzzleById(r.id)).filter(Boolean) as Puzzle[], [reviewQueue]);
  const [current, setCurrent] = useState<Puzzle | undefined>(due[0]);
  const [n, setN] = useState(0);
  const [done, setDone] = useState(false);
  if (!current)
    return (
      <div className="card">
        <h3>Nothing to retry right now 🎉</h3>
        <p className="muted">
          Puzzles you miss come back here the next day, and again a few days after you solve them. Repetition is how patterns stick!
          {reviewQueue.length > 0 && ` (${reviewQueue.length} scheduled for later.)`}
        </p>
      </div>
    );
  return (
    <div className="play-layout">
      <div className="board-col">
        <PuzzleSolver
          key={`${current.id}-${n}`}
          puzzle={current}
          onResult={(solved, usedHint) => {
            recordPuzzle(current.id, current.rating, current.themes, solved && !usedHint, false);
            setDone(true);
          }}
        />
      </div>
      <aside className="side-col">
        <div className="card">
          <h3>Retry missed puzzles</h3>
          <p className="muted">These are puzzles you got wrong before. They don’t affect your rating.</p>
          <button
            className="btn primary big"
            disabled={!done}
            onClick={() => {
              const s = useProgress.getState();
              const next = s.reviewQueue.filter((r) => r.due <= Date.now() && r.id !== current.id).map((r) => puzzleById(r.id)).find(Boolean);
              setCurrent(next);
              setDone(false);
              setN((x) => x + 1);
            }}
          >
            Next →
          </button>
        </div>
      </aside>
    </div>
  );
}

// ───────────────────────── Puzzle Rush ─────────────────────────

const RUSH_SECONDS = 180;

function PuzzleRush() {
  const { rushBest, setRushBest, recordActivity, addXp } = useProgress();
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [timeLeft, setTimeLeft] = useState(RUSH_SECONDS);
  const [puzzle, setPuzzle] = useState<Puzzle | undefined>();
  const [n, setN] = useState(0);
  const [over, setOver] = useState(false);
  const seen = useRef(new Set<string>());

  const nextPuzzle = useCallback((sc: number) => {
    const target = 400 + sc * 70;
    const p = pickPuzzle(target, {}, null, seen.current);
    if (p) seen.current.add(p.id);
    setPuzzle(p);
    setN((x) => x + 1);
  }, []);

  const end = useCallback(
    (finalScore: number) => {
      setRunning(false);
      setOver(true);
      setRushBest(finalScore);
      recordActivity({ type: 'rush', success: true, data: { score: finalScore } });
      addXp(finalScore * 3);
    },
    [setRushBest, recordActivity, addXp],
  );

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (running && timeLeft === 0) end(score);
  }, [timeLeft, running, score, end]);

  const start = () => {
    seen.current = new Set();
    setScore(0);
    setStrikes(0);
    setTimeLeft(RUSH_SECONDS);
    setOver(false);
    setRunning(true);
    nextPuzzle(0);
  };

  if (!running)
    return (
      <div className="card rush-card">
        <h2>⚡ Puzzle Rush</h2>
        <p>
          Solve as many puzzles as you can in <b>3 minutes</b>. They start easy and get harder. Three wrong moves and you’re out!
        </p>
        {over && (
          <p className="acc-big">
            Score: {score} {score >= rushBest && score > 0 && <span className="tag">New best!</span>}
          </p>
        )}
        <p className="muted">Personal best: {rushBest}</p>
        <button className="btn primary big" onClick={start}>
          {over ? 'Play again' : 'Start'}
        </button>
      </div>
    );

  return (
    <div className="play-layout">
      <div className="board-col">
        {puzzle && (
          <PuzzleSolver
            key={`${puzzle.id}-${n}`}
            puzzle={puzzle}
            strict
            onResult={(solved) => {
              if (solved) {
                const sc = score + 1;
                setScore(sc);
                setTimeout(() => nextPuzzle(sc), 500);
              } else {
                const st = strikes + 1;
                setStrikes(st);
                if (st >= 3) setTimeout(() => end(score), 600);
                else setTimeout(() => nextPuzzle(score), 900);
              }
            }}
          />
        )}
      </div>
      <aside className="side-col">
        <div className="card">
          <div className="rush-stats">
            <div>
              <div className="small muted">Time</div>
              <div className={`acc-big ${timeLeft < 20 ? 'neg' : ''}`}>
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </div>
            </div>
            <div>
              <div className="small muted">Score</div>
              <div className="acc-big">{score}</div>
            </div>
            <div>
              <div className="small muted">Strikes</div>
              <div className="acc-big neg">{'✗'.repeat(strikes)}{'·'.repeat(3 - strikes)}</div>
            </div>
          </div>
          <button className="btn ghost" onClick={() => end(score)}>
            Stop
          </button>
        </div>
      </aside>
    </div>
  );
}
