import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Color, Square } from 'chess.js';
import Board3D from '../board3d/Board3D';
import type { Arrow, Mark } from '../board3d/Board3D';
import { getTheme } from '../board3d/themes';
import { useProgress } from '../store/progress';

export interface PlayableBoardProps {
  fen: string;
  orientation: Color;
  /** whether the user may currently move */
  interactive: boolean;
  /** Called with a UCI move string (e.g. e2e4, e7e8q). */
  onMove?: (uci: string) => void;
  lastMove?: { from: Square; to: Square } | null;
  marks?: Mark[];
  arrows?: Arrow[];
  stars?: Square[];
  /** restrict movement to these squares (lesson highlighting) */
  overlay?: React.ReactNode;
}

const PROMO = ['q', 'r', 'b', 'n'] as const;
const PROMO_ICON: Record<string, [string, string]> = {
  q: ['♕', '♛'],
  r: ['♖', '♜'],
  b: ['♗', '♝'],
  n: ['♘', '♞'],
};

export default function PlayableBoard(props: PlayableBoardProps) {
  const { fen, interactive, onMove } = props;
  const settings = useProgress((s) => s.settings);
  const theme = getTheme(settings.boardTheme);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [topDown, setTopDown] = useState(settings.topDown);

  useEffect(() => {
    setSelected(null);
    setPromo(null);
  }, [fen]);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess(fen, { skipValidation: true });
    }
  }, [fen]);

  const legalTargets = useMemo(() => {
    if (!selected || !interactive) return [];
    return chess.moves({ square: selected, verbose: true }).map((m) => ({ square: m.to, capture: !!m.captured }));
  }, [chess, selected, interactive]);

  const handleClick = (sq: Square) => {
    if (!interactive) return;
    const piece = chess.get(sq);
    if (selected) {
      const moves = chess.moves({ square: selected, verbose: true }).filter((m) => m.to === sq);
      if (moves.length) {
        if (moves.some((m) => m.promotion)) {
          setPromo({ from: selected, to: sq });
          return;
        }
        setSelected(null);
        onMove?.(`${selected}${sq}`);
        return;
      }
    }
    if (piece && piece.color === chess.turn()) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  const turn = chess.turn();
  return (
    <div className="board-wrap">
      <Board3D
        fen={fen}
        orientation={props.orientation}
        theme={theme}
        topDown={topDown}
        selected={selected}
        legalTargets={legalTargets}
        lastMove={props.lastMove}
        marks={props.marks}
        arrows={props.arrows}
        stars={props.stars}
        onSquareClick={handleClick}
      />
      <div className="board-tools">
        <button className="icon-btn" title="Toggle top-down / 3D view" onClick={() => setTopDown((v) => !v)}>
          {topDown ? '3D' : '2D'}
        </button>
      </div>
      {promo && (
        <div className="promo-picker">
          <div className="promo-title">Promote to…</div>
          <div className="promo-row">
            {PROMO.map((p) => (
              <button
                key={p}
                className="promo-btn"
                onClick={() => {
                  const m = promo;
                  setPromo(null);
                  setSelected(null);
                  onMove?.(`${m.from}${m.to}${p}`);
                }}
              >
                {PROMO_ICON[p][turn === 'w' ? 0 : 1]}
              </button>
            ))}
          </div>
          <button className="btn small ghost" onClick={() => setPromo(null)}>
            Cancel
          </button>
        </div>
      )}
      {props.overlay}
    </div>
  );
}
