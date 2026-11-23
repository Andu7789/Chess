import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import PlayableBoard from '../components/PlayableBoard';
import MoveList from '../components/MoveList';
import EvalBar from '../components/EvalBar';
import { reviewGame } from '../chess/analysis';
import type { GameReview, MoveClass } from '../chess/analysis';
import { checkMove } from '../chess/coach';
import { useProgress } from '../store/progress';
import { navigate } from '../lib/router';
import { sfx } from '../lib/sound';

const CLASS_LABEL: Record<MoveClass, string> = {
  book: '📖 Book',
  best: '★ Best',
  good: '✓ Good',
  inaccuracy: '?! Inaccuracy',
  mistake: '? Mistake',
  blunder: '?? Blunder',
};

const cache = new Map<string, GameReview>();

export default function Review({ gameId }: { gameId?: string }) {
  const games = useProgress((s) => s.games);
  const game = games.find((g) => g.id === gameId) ?? (gameId ? undefined : games[0]);
  if (!game)
    return (
      <div className="page">
        <h1>Game Review</h1>
        <p className="muted">No games yet. Play a game and then review it here!</p>
        <button className="btn primary" onClick={() => navigate('/play')}>
          Play a game
        </button>
      </div>
    );
  return <ReviewGame key={game.id} gameId={game.id} />;
}

function ReviewGame({ gameId }: { gameId: string }) {
  const game = useProgress((s) => s.games.find((g) => g.id === gameId))!;
  const updateGame = useProgress((s) => s.updateGame);
  const recordActivity = useProgress((s) => s.recordActivity);
  const addXp = useProgress((s) => s.addXp);
  const [review, setReview] = useState<GameReview | null>(cache.get(gameId) ?? null);
  const [progress, setProgress] = useState(0);
  const [ply, setPly] = useState(-1); // -1 = start position
  const [practice, setPractice] = useState<{ idx: number; state: 'trying' | 'right' | 'wrong'; msg?: string } | null>(null);

  useEffect(() => {
    if (review) return;
    let cancelled = false;
    void reviewGame(game.moves, undefined, game.color, (d, t) => !cancelled && setProgress(d / t)).then((r) => {
      if (cancelled) return;
      cache.set(gameId, r);
      setReview(r);
      const mine = r.moves.filter((m) => m.color === game.color);
      const first = !game.reviewed;
      updateGame(gameId, {
        reviewed: true,
        accuracy: r.accuracy[game.color],
        blunders: mine.filter((m) => m.cls === 'blunder').length,
        mistakes: mine.filter((m) => m.cls === 'mistake').length,
      });
      if (first) {
        recordActivity({ type: 'review', success: true, data: { gameId } });
        addXp(20);
      }
      if (r.keyMoments.length) setPly(r.keyMoments[0] - 1);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const fen = useMemo(() => {
    if (!review) return new Chess().fen();
    if (ply < 0) return review.moves[0]?.fenBefore ?? new Chess().fen();
    return review.moves[ply].fenAfter;
  }, [review, ply]);

  if (!review)
    return (
      <div className="page center">
        <h1>Analysing your game…</h1>
        <div className="progress big">
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="muted">The engine is checking every move ({Math.round(progress * 100)}%).</p>
      </div>
    );

  const move = ply >= 0 ? review.moves[ply] : null;
  const nextMove = review.moves[ply + 1];
  const evalCp = move ? move.evalAfter : review.moves[0]?.evalBefore ?? 0;
  const mineCounts = review.counts[game.color];

  // Practice mode: the position before a key mistake
  const practiceMove = practice ? review.moves[practice.idx] : null;
  const boardFen = practiceMove ? practiceMove.fenBefore : fen;
  const arrows =
    practice?.state === 'right' || practice?.state === 'wrong'
      ? practiceMove
        ? [{ from: practiceMove.bestUci.slice(0, 2) as Square, to: practiceMove.bestUci.slice(2, 4) as Square, color: '#35c46a' }]
        : []
      : !practice && nextMove && nextMove.color === game.color && (nextMove.cls === 'mistake' || nextMove.cls === 'blunder')
        ? [
            { from: nextMove.uci.slice(0, 2) as Square, to: nextMove.uci.slice(2, 4) as Square, color: '#ff4d4d' },
            { from: nextMove.bestUci.slice(0, 2) as Square, to: nextMove.bestUci.slice(2, 4) as Square, color: '#35c46a' },
          ]
        : [];

  const tryMove = async (uci: string) => {
    if (!practice || !practiceMove) return;
    if (uci === practiceMove.bestUci) {
      sfx.success();
      setPractice({ ...practice, state: 'right', msg: `Yes! ${practiceMove.bestSan} is the best move.` });
      return;
    }
    const res = await checkMove(practiceMove.fenBefore, uci);
    if (res.severity === 'ok') {
      sfx.success();
      setPractice({ ...practice, state: 'right', msg: `Good move! (The engine’s top choice was ${practiceMove.bestSan}.)` });
    } else {
      sfx.fail();
      setPractice({ ...practice, state: 'wrong', msg: `Not quite: ${res.explanation || 'that also loses ground.'} The best move was ${practiceMove.bestSan}.` });
    }
  };

  return (
    <div className="play-layout">
      <div className="board-col">
        <div className="player-strip">
          <b>
            vs {game.botName} · {game.result === 'win' ? 'Won' : game.result === 'loss' ? 'Lost' : 'Draw'} ({game.reason})
          </b>
        </div>
        <div className="board-and-eval">
          <EvalBar cp={practice ? null : evalCp} orientation={game.color} />
          <PlayableBoard
            fen={boardFen}
            orientation={game.color}
            interactive={practice?.state === 'trying'}
            onMove={tryMove}
            lastMove={!practice && move ? { from: move.uci.slice(0, 2) as Square, to: move.uci.slice(2, 4) as Square } : null}
            arrows={arrows}
          />
        </div>
        {!practice && (
          <div className="nav-row">
            <button className="btn" onClick={() => setPly(-1)}>
              ⏮
            </button>
            <button className="btn" onClick={() => setPly((p) => Math.max(-1, p - 1))}>
              ◀
            </button>
            <button className="btn" onClick={() => setPly((p) => Math.min(review.moves.length - 1, p + 1))}>
              ▶
            </button>
            <button className="btn" onClick={() => setPly(review.moves.length - 1)}>
              ⏭
            </button>
          </div>
        )}
      </div>
      <aside className="side-col">
        <div className="card">
          <h3>Your accuracy</h3>
          <div className="acc-big">{review.accuracy[game.color]}%</div>
          <div className="class-grid">
            {(['best', 'good', 'inaccuracy', 'mistake', 'blunder'] as MoveClass[]).map((c) => (
              <div key={c} className={`class-cell ${c}`}>
                <span>{CLASS_LABEL[c]}</span>
                <b>{mineCounts[c] + (c === 'best' ? mineCounts.book : 0)}</b>
              </div>
            ))}
          </div>
          <p className="small muted">
            {game.botName}’s accuracy: {review.accuracy[game.color === 'w' ? 'b' : 'w']}%
          </p>
        </div>

        {practice && practiceMove ? (
          <div className="card coach-card">
            <h3>Find a better move</h3>
            <p>
              In the game you played <b>{practiceMove.san}</b> ({CLASS_LABEL[practiceMove.cls]}). What should you have played?
            </p>
            {practice.msg && <div className={`coach-msg ${practice.state === 'right' ? 'good' : 'bad'}`}>{practice.msg}</div>}
            <div className="btn-row">
              {practice.state !== 'trying' && (
                <button className="btn" onClick={() => setPractice({ idx: practice.idx, state: 'trying' })}>
                  Try again
                </button>
              )}
              {(() => {
                const k = review.keyMoments.indexOf(practice.idx);
                const next = review.keyMoments[k + 1];
                return next !== undefined ? (
                  <button className="btn primary" onClick={() => setPractice({ idx: next, state: 'trying' })}>
                    Next moment →
                  </button>
                ) : null;
              })()}
              <button className="btn ghost" onClick={() => setPractice(null)}>
                Back to game
              </button>
            </div>
          </div>
        ) : (
          <div className="card coach-card">
            <h3>Key moments</h3>
            {review.keyMoments.length === 0 ? (
              <p className="good-text">No mistakes or blunders. Fantastic game!</p>
            ) : (
              <>
                <ul className="key-moments">
                  {review.keyMoments.map((i) => {
                    const m = review.moves[i];
                    return (
                      <li key={i}>
                        <button className="linkish" onClick={() => setPly(i - 1)}>
                          Move {Math.floor(i / 2) + 1}: {m.san} <span className={`tag ${m.cls}`}>{m.cls}</span>
                        </button>
                        <div className="small">{m.comment}</div>
                        <div className="small muted">Better was {m.bestSan}.</div>
                      </li>
                    );
                  })}
                </ul>
                <button className="btn primary" onClick={() => setPractice({ idx: review.keyMoments[0], state: 'trying' })}>
                  🎯 Practise these moments
                </button>
              </>
            )}
          </div>
        )}

        <div className="card">
          <h3>Moves</h3>
          {move && (
            <div className={`move-verdict ${move.cls}`}>
              <b>{move.san}</b>: {CLASS_LABEL[move.cls]}
              {move.comment && <div className="small">{move.comment}</div>}
              {move.cls !== 'best' && move.cls !== 'book' && move.bestSan && <div className="small muted">Best was {move.bestSan}</div>}
            </div>
          )}
          <MoveList moves={review.moves.map((m) => m.san)} current={ply} onSelect={setPly} classes={review.moves.map((m) => m.cls)} />
        </div>
      </aside>
    </div>
  );
}
