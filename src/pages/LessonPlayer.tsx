import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Color, Square } from 'chess.js';
import PlayableBoard from '../components/PlayableBoard';
import Md from '../components/Md';
import { LESSONS, lessonById } from '../data/lessons';
import type { CollectStep, GoalStep, LessonStep, PuzzleStep, QuizStep } from '../data/lessonTypes';
import { useProgress } from '../store/progress';
import { navigate } from '../lib/router';
import { playMoveSound, sfx } from '../lib/sound';
import { playEngine } from '../chess/engine';
import type { Arrow } from '../board3d/Board3D';

function lax(fen: string) {
  try {
    return new Chess(fen);
  } catch {
    return new Chess(fen, { skipValidation: true });
  }
}

function applyUci(c: Chess, uci: string) {
  return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

export default function LessonPlayer({ lessonId }: { lessonId: string }) {
  const lesson = lessonById(lessonId);
  const completeLesson = useProgress((s) => s.completeLesson);
  const [stepIdx, setStepIdx] = useState(0);
  const [stepDone, setStepDone] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [finished, setFinished] = useState(false);
  const [stars, setStars] = useState(3);

  useEffect(() => {
    setStepIdx(0);
    setStepDone(false);
    setMistakes(0);
    setFinished(false);
  }, [lessonId]);

  if (!lesson) return <div className="page">Lesson not found.</div>;
  const step = lesson.steps[stepIdx];
  const idxInAll = LESSONS.findIndex((l) => l.id === lesson.id);
  const nextLesson = LESSONS[idxInAll + 1];

  const next = () => {
    if (stepIdx + 1 < lesson.steps.length) {
      setStepIdx(stepIdx + 1);
      setStepDone(step.kind === 'info' ? false : false);
    } else {
      const s = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
      setStars(s);
      completeLesson(lesson.id, s);
      sfx.win();
      setFinished(true);
    }
  };

  if (finished)
    return (
      <div className="page center">
        <div className="card finish-card">
          <div className="finish-stars">{'★'.repeat(stars) + '☆'.repeat(3 - stars)}</div>
          <h1>Lesson complete!</h1>
          <p>
            <b>{lesson.title}</b>: {mistakes === 0 ? 'flawless!' : `${mistakes} slip${mistakes > 1 ? 's' : ''} along the way.`}
          </p>
          <div className="btn-row center">
            {nextLesson && (
              <button className="btn primary big" onClick={() => navigate(`/lesson/${nextLesson.id}`)}>
                Next: {nextLesson.title} →
              </button>
            )}
            <button className="btn" onClick={() => navigate('/lessons')}>
              All lessons
            </button>
            <button className="btn ghost" onClick={() => navigate('/puzzles')}>
              Practise with puzzles
            </button>
          </div>
        </div>
      </div>
    );

  const canNext = step.kind === 'info' || stepDone;

  return (
    <div className="play-layout lesson">
      <div className="board-col">
        <StepBoard key={`${lesson.id}-${stepIdx}`} step={step} onDone={() => setStepDone(true)} onMistake={() => setMistakes((m) => m + 1)} />
      </div>
      <aside className="side-col">
        <div className="card">
          <div className="row between">
            <button className="btn small ghost" onClick={() => navigate('/lessons')}>
              ← Lessons
            </button>
            <span className="muted small">
              Step {stepIdx + 1} / {lesson.steps.length}
            </span>
          </div>
          <h2>{lesson.title}</h2>
          <div className="progress thin">
            <div style={{ width: `${((stepIdx + (canNext ? 1 : 0)) / lesson.steps.length) * 100}%` }} />
          </div>
        </div>
        <StepPanel key={`p-${lesson.id}-${stepIdx}`} step={step} done={stepDone} onDone={() => setStepDone(true)} onMistake={() => setMistakes((m) => m + 1)} />
        <div className="btn-row">
          {stepIdx > 0 && (
            <button
              className="btn ghost"
              onClick={() => {
                setStepIdx(stepIdx - 1);
                setStepDone(true);
              }}
            >
              ← Back
            </button>
          )}
          <button className="btn primary big" disabled={!canNext} onClick={next}>
            {stepIdx + 1 < lesson.steps.length ? 'Next →' : 'Finish lesson ✓'}
          </button>
        </div>
      </aside>
    </div>
  );
}

// Shared state between the board and the side panel for interactive steps
type Feedback = { tone: 'good' | 'bad' | 'info'; text: string } | null;
const feedbackBus = new EventTarget();
function emitFeedback(f: Feedback) {
  feedbackBus.dispatchEvent(new CustomEvent('fb', { detail: f }));
}
const hintBus = new EventTarget();

function StepPanel({ step, done, onDone, onMistake }: { step: LessonStep; done: boolean; onDone: () => void; onMistake: () => void }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  useEffect(() => {
    const on = (e: Event) => setFeedback((e as CustomEvent).detail);
    feedbackBus.addEventListener('fb', on);
    return () => feedbackBus.removeEventListener('fb', on);
  }, []);

  if (step.kind === 'quiz') return <QuizPanel step={step} done={done} onDone={onDone} onMistake={onMistake} />;
  return (
    <div className="card lesson-text">
      {step.kind === 'info' && step.title && <h3>{step.title}</h3>}
      <p>
        <Md text={step.text} />
      </p>
      {step.kind === 'goal' && <p className="small muted">Goal: {step.goal === 'mate' ? 'checkmate' : 'promote a pawn'} within {step.maxMoves} moves.</p>}
      {feedback && <div className={`coach-msg ${feedback.tone}`}>{feedback.text}</div>}
      {(step.kind === 'puzzle' || step.kind === 'goal') && !done && (
        <button className="btn small" onClick={() => hintBus.dispatchEvent(new Event('hint'))}>
          💡 Hint
        </button>
      )}
      {(step.kind === 'collect' || step.kind === 'goal' || step.kind === 'puzzle') && (
        <button className="btn small ghost" onClick={() => hintBus.dispatchEvent(new Event('reset'))}>
          ↺ Reset
        </button>
      )}
    </div>
  );
}

function QuizPanel({ step, done, onDone, onMistake }: { step: QuizStep; done: boolean; onDone: () => void; onMistake: () => void }) {
  const [picked, setPicked] = useState<number | null>(done ? step.answer : null);
  const [wrong, setWrong] = useState<number[]>([]);
  return (
    <div className="card lesson-text">
      <h3>Quiz</h3>
      <p>
        <Md text={step.text} />
      </p>
      <div className="quiz-options">
        {step.options.map((o, i) => (
          <button
            key={i}
            className={`quiz-opt ${picked === i ? 'right' : ''} ${wrong.includes(i) ? 'wrong' : ''}`}
            disabled={picked !== null}
            onClick={() => {
              if (i === step.answer) {
                setPicked(i);
                sfx.success();
                onDone();
              } else {
                setWrong((w) => [...w, i]);
                sfx.fail();
                onMistake();
              }
            }}
          >
            {o}
          </button>
        ))}
      </div>
      {picked !== null && <div className="coach-msg good">✓ {step.explain}</div>}
      {picked === null && wrong.length > 0 && <div className="coach-msg bad">Not quite. Try again!</div>}
    </div>
  );
}

function StepBoard({ step, onDone, onMistake }: { step: LessonStep; onDone: () => void; onMistake: () => void }) {
  switch (step.kind) {
    case 'info':
    case 'quiz':
      return step.fen ? (
        <PlayableBoard fen={step.fen} orientation="w" interactive={false} arrows={step.arrows} marks={step.marks} />
      ) : (
        <div className="board-placeholder">
          <span>♞</span>
        </div>
      );
    case 'collect':
      return <CollectBoard step={step} onDone={onDone} />;
    case 'puzzle':
      return <PuzzleBoard step={step} onDone={onDone} onMistake={onMistake} />;
    case 'goal':
      return <GoalBoard step={step} onDone={onDone} onMistake={onMistake} />;
  }
}

function useBus(name: string, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const on = () => ref.current();
    hintBus.addEventListener(name, on);
    return () => hintBus.removeEventListener(name, on);
  }, [name]);
}

function CollectBoard({ step, onDone }: { step: CollectStep; onDone: () => void }) {
  const [fen, setFen] = useState(step.fen);
  const [stars, setStars] = useState<Square[]>(step.stars);
  const [moves, setMoves] = useState(0);
  const [last, setLast] = useState<{ from: Square; to: Square } | null>(null);
  const reset = () => {
    setFen(step.fen);
    setStars(step.stars);
    setMoves(0);
    setLast(null);
    emitFeedback(null);
  };
  useBus('reset', reset);
  useEffect(() => () => emitFeedback(null), []);

  const onMove = (uci: string) => {
    const c = lax(fen);
    const mv = applyUci(c, uci);
    playMoveSound(mv.san);
    const parts = c.fen().split(' ');
    parts[1] = 'w';
    parts[3] = '-';
    setFen(parts.join(' '));
    setLast({ from: mv.from, to: mv.to });
    const n = moves + 1;
    setMoves(n);
    const remaining = stars.filter((s) => s !== mv.to);
    if (remaining.length < stars.length) sfx.success();
    setStars(remaining);
    if (remaining.length === 0) {
      onDone();
      emitFeedback(
        n <= step.par
          ? { tone: 'good', text: `⭐ All stars in ${n} moves, perfect!` }
          : { tone: 'good', text: `All stars collected in ${n} moves. (Can you do it in ${step.par}? Press reset to try.)` },
      );
    } else {
      emitFeedback({ tone: 'info', text: `${remaining.length} star${remaining.length > 1 ? 's' : ''} left · ${n} move${n > 1 ? 's' : ''}` });
    }
  };
  return <PlayableBoard fen={fen} orientation="w" interactive={stars.length > 0} onMove={onMove} stars={stars} lastMove={last} />;
}

function PuzzleBoard({ step, onDone, onMistake }: { step: PuzzleStep; onDone: () => void; onMistake: () => void }) {
  const orientation: Color = lax(step.fen).turn();
  const [fen, setFen] = useState(step.fen);
  const [idx, setIdx] = useState(0);
  const [solved, setSolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ from: Square; to: Square } | null>(null);
  const [hintArrow, setHintArrow] = useState<Arrow[] | undefined>(undefined);
  const hintCount = useRef(0);

  const reset = () => {
    setFen(step.fen);
    setIdx(0);
    setSolved(false);
    setLast(null);
    setHintArrow(undefined);
    emitFeedback(null);
  };
  useBus('reset', reset);
  useBus('hint', () => {
    hintCount.current++;
    if (hintCount.current === 1 && step.hint) emitFeedback({ tone: 'info', text: `💡 ${step.hint}` });
    else {
      const exp = step.moves[idx].split('|')[0];
      setHintArrow([{ from: exp.slice(0, 2) as Square, to: exp.slice(2, 4) as Square, color: '#35c46a' }]);
      emitFeedback({ tone: 'info', text: '💡 Follow the green arrow.' });
    }
  });
  useEffect(() => () => emitFeedback(null), []);

  const onMove = (uci: string) => {
    const alts = step.moves[idx].split('|');
    const c = lax(fen);
    const test = lax(fen);
    const mv = applyUci(test, uci);
    const isFinal = idx === step.moves.length - 1;
    const ok = alts.includes(uci) || (alts.some((a) => a.slice(0, 4) === uci.slice(0, 4) && a.length === 4)) || (isFinal && step.acceptAnyMate && test.isCheckmate());
    if (!ok) {
      sfx.fail();
      onMistake();
      emitFeedback({ tone: 'bad', text: test.isCheckmate() ? 'That’s mate too, but try the move this lesson is teaching!' : `${mv.san} isn’t it. Try again!` });
      return;
    }
    applyUci(c, uci);
    playMoveSound(mv.san);
    setFen(c.fen());
    setLast({ from: mv.from, to: mv.to });
    setHintArrow(undefined);
    if (isFinal) {
      setSolved(true);
      sfx.success();
      emitFeedback({ tone: 'good', text: `✓ ${step.success ?? 'Correct!'}` });
      onDone();
      return;
    }
    // opponent reply
    const reply = step.moves[idx + 1].split('|')[0];
    setBusy(true);
    emitFeedback({ tone: 'good', text: `✓ ${mv.san}! Keep going…` });
    setTimeout(() => {
      const r = applyUci(c, reply);
      playMoveSound(r.san);
      setFen(c.fen());
      setLast({ from: r.from, to: r.to });
      setIdx(idx + 2);
      setBusy(false);
    }, 650);
  };

  return (
    <PlayableBoard
      fen={fen}
      orientation={orientation}
      interactive={!solved && !busy}
      onMove={onMove}
      lastMove={last}
      arrows={hintArrow ?? step.arrows}
      marks={idx === 0 ? step.marks : undefined}
    />
  );
}

function GoalBoard({ step, onDone, onMistake }: { step: GoalStep; onDone: () => void; onMistake: () => void }) {
  const me: Color = new Chess(step.fen).turn();
  const chessRef = useRef(new Chess(step.fen));
  const [fen, setFen] = useState(step.fen);
  const [movesUsed, setMovesUsed] = useState(0);
  const [state, setState] = useState<'playing' | 'won' | 'failed'>('playing');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ from: Square; to: Square } | null>(null);
  const runId = useRef(0);

  const reset = useCallback(() => {
    runId.current++;
    chessRef.current = new Chess(step.fen);
    setFen(step.fen);
    setMovesUsed(0);
    setState('playing');
    setBusy(false);
    setLast(null);
    emitFeedback(null);
  }, [step.fen]);
  useBus('reset', reset);
  useBus('hint', () => step.hint && emitFeedback({ tone: 'info', text: `💡 ${step.hint}` }));
  useEffect(() => () => emitFeedback(null), []);

  const fail = (why: string) => {
    setState('failed');
    sfx.fail();
    onMistake();
    emitFeedback({ tone: 'bad', text: `${why} Press ↺ Reset to try again.` });
  };

  const onMove = async (uci: string) => {
    const c = chessRef.current;
    const mv = applyUci(c, uci);
    playMoveSound(mv.san);
    setFen(c.fen());
    setLast({ from: mv.from, to: mv.to });
    const used = movesUsed + 1;
    setMovesUsed(used);
    if (step.goal === 'promote' && mv.promotion) {
      setState('won');
      sfx.success();
      emitFeedback({ tone: 'good', text: `✓ ${step.success ?? 'Goal reached!'} (${used} moves)` });
      onDone();
      return;
    }
    if (c.isCheckmate()) {
      setState('won');
      sfx.success();
      emitFeedback({ tone: 'good', text: `✓ ${step.success ?? 'Checkmate!'} (${used} moves)` });
      onDone();
      return;
    }
    if (c.isStalemate()) return fail('Oh no, stalemate! That’s a draw.');
    if (c.isDraw()) return fail('The game is drawn.');
    if (used >= step.maxMoves) return fail(`Out of moves (${step.maxMoves}).`);
    emitFeedback({ tone: 'info', text: `Moves used: ${used} / ${step.maxMoves}` });
    setBusy(true);
    const myRun = runId.current;
    const res = await playEngine().analyse(c.fen(), { depth: 12 });
    if (myRun !== runId.current) return;
    const r = applyUci(c, res.bestmove);
    playMoveSound(r.san);
    setFen(c.fen());
    setLast({ from: r.from, to: r.to });
    setBusy(false);
    // did the defender capture our key piece?
    const material = c.board().flat().filter((p) => p && p.color === me && p.type !== 'k').length;
    if (material === 0) fail('Your last piece was captured!');
    else if (c.isDraw()) fail('The game is drawn.');
  };

  const marks = useMemo(() => [], []);
  return (
    <div className="goal-wrap">
      <PlayableBoard fen={fen} orientation={me} interactive={state === 'playing' && !busy} onMove={onMove} lastMove={last} marks={marks} />
      <div className="goal-counter">
        {state === 'won' ? '✓ Done!' : `Moves: ${movesUsed} / ${step.maxMoves}`}
      </div>
    </div>
  );
}
