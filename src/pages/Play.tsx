import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Color, Square } from 'chess.js';
import PlayableBoard from '../components/PlayableBoard';
import type { Arrow, Mark } from '../board3d/Board3D';
import { botLadder, botMove } from '../chess/bots';
import type { Bot } from '../chess/bots';
import { checkMove, dangerMarks, describeThreats, getHints } from '../chess/coach';
import type { Hint, MoveCheck } from '../chess/coach';
import { analysisEngine, playEngine, scoreToCp } from '../chess/engine';
import { useProgress } from '../store/progress';
import type { GameRecord } from '../store/progress';
import { playMoveSound, sfx } from '../lib/sound';
import { navigate } from '../lib/router';
import MoveList from '../components/MoveList';
import EvalBar from '../components/EvalBar';

type Mode = 'practice' | 'rated';

interface GameSetup {
  bot: Bot;
  color: Color;
  mode: Mode;
}

export default function Play({ initialBot }: { initialBot?: string }) {
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [gameNo, setGameNo] = useState(0);
  const start = (s: GameSetup) => {
    setSetup(s);
    setGameNo((n) => n + 1);
  };
  if (!setup) return <PlaySetup initialBot={initialBot} onStart={start} />;
  return <Game key={gameNo} setup={setup} onExit={() => setSetup(null)} onRematch={start} />;
}

// ───────────────────────── Setup screen ─────────────────────────

function PlaySetup({ initialBot, onStart }: { initialBot?: string; onStart: (s: GameSetup) => void }) {
  const { settings, beatenBots, rating } = useProgress();
  const ladder = useMemo(() => botLadder(settings.rachelRating), [settings.rachelRating]);
  const nextTarget = ladder.find((b) => !beatenBots.includes(b.id)) ?? ladder[ladder.length - 1];
  const [botId, setBotId] = useState(initialBot ?? nextTarget.id);
  const [color, setColor] = useState<'w' | 'b' | 'random'>('w');
  const [mode, setMode] = useState<Mode>('practice');
  const bot = ladder.find((b) => b.id === botId) ?? nextTarget;

  return (
    <div className="page">
      <h1>Play the Computer</h1>
      <p className="muted">
        Climb the ladder one bot at a time. Your rating: <b>{rating}</b>. Next target: <b>{nextTarget.name}</b>.
      </p>
      <div className="ladder">
        {ladder.map((b) => {
          const beaten = beatenBots.includes(b.id);
          return (
            <button
              key={b.id}
              className={`bot-card ${b.id === botId ? 'selected' : ''} ${b.isRachel ? 'rachel' : ''} ${beaten ? 'beaten' : ''}`}
              onClick={() => setBotId(b.id)}
            >
              <div className="bot-avatar">{b.avatar}</div>
              <div className="bot-name">{b.name}</div>
              <div className="bot-elo">≈{b.elo}</div>
              {beaten && <div className="bot-badge">✓ Beaten</div>}
              {b.id === nextTarget.id && !beaten && <div className="bot-badge next">Next target</div>}
            </button>
          );
        })}
      </div>
      <div className="card setup-card">
        <div className="setup-bot">
          <span className="big-avatar">{bot.avatar}</span>
          <div>
            <h2>{bot.name}</h2>
            <p className="muted">{bot.blurb}</p>
          </div>
        </div>
        <div className="setup-row">
          <label>Play as</label>
          <div className="seg">
            {(['w', 'random', 'b'] as const).map((c) => (
              <button key={c} className={color === c ? 'on' : ''} onClick={() => setColor(c)}>
                {c === 'w' ? '♔ White' : c === 'b' ? '♚ Black' : '🎲 Random'}
              </button>
            ))}
          </div>
        </div>
        <div className="setup-row">
          <label>Mode</label>
          <div className="seg">
            <button className={mode === 'practice' ? 'on' : ''} onClick={() => setMode('practice')}>
              🎓 Practice (coach on)
            </button>
            <button className={mode === 'rated' ? 'on' : ''} onClick={() => setMode('rated')}>
              🏅 Rated (no help)
            </button>
          </div>
        </div>
        <p className="muted small">
          {mode === 'practice'
            ? 'The coach warns you before blunders, gives hints and lets you take moves back. Practice games don’t change your rating.'
            : 'A real test: no hints, no takebacks. Wins count toward the ladder and your rating.'}
        </p>
        <button
          className="btn primary big"
          onClick={() => onStart({ bot, mode, color: color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color })}
        >
          Start game
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── Game screen ─────────────────────────

interface CoachMsg {
  id: number;
  tone: 'info' | 'warn' | 'good' | 'bad';
  text: string;
}

function Game({ setup, onExit, onRematch }: { setup: GameSetup; onExit: () => void; onRematch: (s: GameSetup) => void }) {
  const { bot, color, mode } = setup;
  const practice = mode === 'practice';
  const settings = useProgress((s) => s.settings);
  const recordGame = useProgress((s) => s.recordGame);
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [checking, setChecking] = useState(false);
  const [messages, setMessages] = useState<CoachMsg[]>([]);
  const [hints, setHints] = useState<Hint[] | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [warning, setWarning] = useState<{ uci: string; check: MoveCheck } | null>(null);
  const [over, setOver] = useState<{ result: 'win' | 'loss' | 'draw'; reason: string; record: GameRecord } | null>(null);
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [showDanger, setShowDanger] = useState(settings.showDanger);
  const msgId = useRef(0);
  const finished = useRef(false);

  const say = useCallback((text: string, tone: CoachMsg['tone'] = 'info') => {
    setMessages((m) => [...m.slice(-30), { id: msgId.current++, text, tone }]);
  }, []);

  const sync = useCallback(() => {
    const c = chessRef.current;
    setFen(c.fen());
    setHistory(c.history());
    const h = c.history({ verbose: true });
    const last = h[h.length - 1];
    setLastMove(last ? { from: last.from, to: last.to } : null);
    setHints(null);
    setHintLevel(0);
  }, []);

  const finish = useCallback(
    (result: 'win' | 'loss' | 'draw', reason: string) => {
      if (finished.current) return;
      finished.current = true;
      const c = chessRef.current;
      const record = recordGame({
        botId: bot.id,
        botName: bot.name,
        botElo: bot.elo,
        color,
        result,
        reason,
        moves: c.history(),
        rated: !practice,
      });
      if (result === 'win') sfx.win();
      setOver({ result, reason, record });
    },
    [bot, color, practice, recordGame],
  );

  const checkGameOver = useCallback(() => {
    const c = chessRef.current;
    if (!c.isGameOver()) return false;
    if (c.isCheckmate()) finish(c.turn() === color ? 'loss' : 'win', 'checkmate');
    else if (c.isStalemate()) finish('draw', 'stalemate');
    else if (c.isThreefoldRepetition()) finish('draw', 'repetition');
    else if (c.isInsufficientMaterial()) finish('draw', 'insufficient material');
    else finish('draw', '50-move rule');
    return true;
  }, [color, finish]);

  // Engine eval for the bar (practice only)
  useEffect(() => {
    if (!practice || !settings.showEval) return;
    let cancelled = false;
    const c = new Chess(fen);
    if (c.isGameOver()) return;
    void analysisEngine()
      .analyse(fen, { depth: 10 })
      .then((r) => {
        if (cancelled || !r.lines.length) return;
        const cp = scoreToCp(r.lines[0].score);
        setEvalCp(c.turn() === 'w' ? cp : -cp);
      });
    return () => {
      cancelled = true;
    };
  }, [fen, practice, settings.showEval]);

  // Bot's turn
  useEffect(() => {
    const c = chessRef.current;
    if (finished.current || c.isGameOver() || c.turn() === color) return;
    let cancelled = false;
    setThinking(true);
    const started = performance.now();
    void botMove(c.fen(), bot.elo).then(async (uci) => {
      // small human-like delay
      const wait = Math.max(0, 450 + Math.random() * 500 - (performance.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      if (cancelled) return;
      const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      playMoveSound(mv.san);
      sync();
      setThinking(false);
      if (!checkGameOver() && practice) {
        const threat = describeThreats(c.fen(), uci);
        if (threat) say(`${bot.name} played ${mv.san}. ${threat}`, threat.startsWith('Opportunity') ? 'good' : 'warn');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fen, bot, color, practice, checkGameOver, sync, say]);

  const commitMove = useCallback(
    (uci: string) => {
      const c = chessRef.current;
      const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      playMoveSound(mv.san);
      sync();
      checkGameOver();
    },
    [sync, checkGameOver],
  );

  const onMove = useCallback(
    async (uci: string) => {
      const c = chessRef.current;
      if (c.turn() !== color || thinking || checking || finished.current) return;
      if (practice && settings.warnBlunders) {
        setChecking(true);
        try {
          const result = await checkMove(c.fen(), uci);
          if (result.severity === 'blunder' || result.severity === 'mistake') {
            setWarning({ uci, check: result });
            return;
          }
        } finally {
          setChecking(false);
        }
      }
      commitMove(uci);
    },
    [color, thinking, checking, practice, settings.warnBlunders, commitMove],
  );

  const requestHint = async () => {
    if (!hints) {
      setChecking(true);
      const h = await getHints(chessRef.current.fen());
      setChecking(false);
      setHints(h);
      setHintLevel(1);
      say(`💡 ${h[0].text}`, 'info');
    } else if (hintLevel < 3) {
      const lvl = hintLevel + 1;
      setHintLevel(lvl);
      say(`💡 ${hints[lvl - 1].text}`, 'info');
    }
  };

  const takeBack = () => {
    const c = chessRef.current;
    if (thinking || c.history().length === 0) return;
    playEngine().clearQueue();
    c.undo();
    if (c.turn() !== color && c.history().length) c.undo();
    if (c.turn() !== color) {
      // we're black and undid back to start, so let the bot move again
    }
    sync();
    say('Move taken back. Have another look!', 'info');
  };

  const resign = () => {
    if (finished.current) return;
    if (!confirm('Resign this game?')) return;
    finish('loss', 'resignation');
  };

  const marks: Mark[] = useMemo(() => {
    const m: Mark[] = [];
    if (practice && showDanger && new Chess(fen).turn() === color) m.push(...dangerMarks(fen, color));
    if (hints && hintLevel >= 2 && hints[1].marks) m.push(...hints[1].marks);
    return m;
  }, [fen, practice, showDanger, color, hints, hintLevel]);

  const arrows: Arrow[] = useMemo(() => {
    if (hints && hintLevel >= 3 && hints[2].arrow) return [{ ...hints[2].arrow, color: '#35c46a' }];
    return [];
  }, [hints, hintLevel]);

  const myTurn = new Chess(fen).turn() === color;
  const status = over
    ? 'Game over'
    : thinking
      ? `${bot.name} is thinking…`
      : checking
        ? 'Coach is checking…'
        : myTurn
          ? 'Your move'
          : '';

  return (
    <div className="play-layout">
      <div className="board-col">
        <div className="player-strip">
          <span className="avatar">{bot.avatar}</span>
          <b>{bot.name}</b> <span className="muted">≈{bot.elo}</span>
          {thinking && <span className="thinking-dots">thinking</span>}
        </div>
        <div className="board-and-eval">
          {practice && settings.showEval && <EvalBar cp={evalCp} orientation={color} />}
          <PlayableBoard
            fen={fen}
            orientation={color}
            interactive={myTurn && !thinking && !checking && !over && !warning}
            onMove={onMove}
            lastMove={lastMove}
            marks={marks}
            arrows={arrows}
          />
        </div>
        <div className="player-strip">
          <span className="avatar">🙂</span>
          <b>{settings.playerName}</b> <span className="muted">{useProgress.getState().rating}</span>
          <span className={`status-pill ${myTurn ? 'go' : ''}`}>{status}</span>
        </div>
      </div>

      <aside className="side-col">
        <div className="card">
          <div className="row between">
            <h3>{practice ? '🎓 Practice game' : '🏅 Rated game'}</h3>
            <button className="btn small ghost" onClick={onExit}>
              ✕ Exit
            </button>
          </div>
          <MoveList moves={history} />
          <div className="btn-row">
            {practice && (
              <>
                <button className="btn" onClick={requestHint} disabled={!myTurn || thinking || !!over || hintLevel >= 3}>
                  💡 Hint {hintLevel > 0 ? `(${hintLevel}/3)` : ''}
                </button>
                <button className="btn" onClick={takeBack} disabled={thinking || history.length === 0 || !!over}>
                  ↶ Take back
                </button>
                <button className={`btn ${showDanger ? 'on' : ''}`} onClick={() => setShowDanger((v) => !v)}>
                  🛡 Danger {showDanger ? 'on' : 'off'}
                </button>
              </>
            )}
            <button className="btn danger" onClick={resign} disabled={!!over}>
              🏳 Resign
            </button>
          </div>
        </div>
        {practice && (
          <div className="card coach-card">
            <h3>Coach</h3>
            {showDanger && (
              <p className="small muted legend">
                <span className="dot red" /> your pieces in danger <span className="dot green" /> their loose pieces
              </p>
            )}
            <div className="coach-feed">
              {messages.length === 0 && <p className="muted">I’ll point out threats and warn you before you blunder. Good luck!</p>}
              {[...messages].reverse().map((m) => (
                <div key={m.id} className={`coach-msg ${m.tone}`}>
                  {m.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {warning && (
        <div className="modal-back">
          <div className="modal">
            <h2>{warning.check.severity === 'blunder' ? '⚠️ Hold on, that’s a blunder!' : '🤔 Are you sure?'}</h2>
            <p>{warning.check.explanation || 'This move gives your opponent a big advantage.'}</p>
            <div className="btn-row">
              <button
                className="btn primary"
                onClick={() => {
                  setWarning(null);
                  say('Good call. Look for a safer move.', 'good');
                }}
              >
                Let me rethink
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  const u = warning.uci;
                  setWarning(null);
                  commitMove(u);
                }}
              >
                Play it anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {over && (
        <div className="modal-back">
          <div className="modal">
            <h2>{over.result === 'win' ? '🎉 You won!' : over.result === 'draw' ? '🤝 Draw' : `${bot.name} wins`}</h2>
            <p className="muted">by {over.reason}</p>
            {over.record.rated && (
              <p>
                Rating: <b>{useProgress.getState().rating}</b>{' '}
                <span className={over.record.ratingChange! >= 0 ? 'pos' : 'neg'}>
                  ({over.record.ratingChange! >= 0 ? '+' : ''}
                  {over.record.ratingChange})
                </span>
              </p>
            )}
            {over.result === 'win' && bot.isRachel && over.record.rated && (
              <p className="callout">🏆 You beat the Rachel bot! Time to challenge the real Rachel.</p>
            )}
            {over.result === 'win' && !over.record.rated && <p className="muted small">Win a rated game to tick this bot off the ladder.</p>}
            <div className="btn-row">
              <button className="btn primary" onClick={() => navigate(`/review/${over.record.id}`)}>
                🔬 Review this game
              </button>
              <button className="btn" onClick={() => onRematch(setup)}>
                ↻ Rematch
              </button>
              <button className="btn ghost" onClick={onExit}>
                Choose another bot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
