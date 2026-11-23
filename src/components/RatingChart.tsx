import { useMemo, useState } from 'react';

interface Pt {
  t: number;
  rating: number;
  puzzleRating: number;
}

const W = 640;
const H = 220;
const PAD = { l: 44, r: 70, t: 14, b: 26 };

/** Line chart of game rating and puzzle rating over activity index. */
export default function RatingChart({ history }: { history: Pt[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = history.length === 1 ? [history[0], { ...history[0], t: history[0].t + 1 }] : history;
  const { x, y, ticks } = useMemo(() => {
    const vals = pts.flatMap((p) => [p.rating, p.puzzleRating]);
    const min = Math.floor((Math.min(...vals) - 50) / 100) * 100;
    const max = Math.ceil((Math.max(...vals) + 50) / 100) * 100;
    const x = (i: number) => PAD.l + (i / Math.max(1, pts.length - 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
    const step = max - min > 800 ? 200 : 100;
    const ticks: number[] = [];
    for (let v = min; v <= max; v += step) ticks.push(v);
    return { x, y, ticks };
  }, [pts]);

  const path = (key: 'rating' | 'puzzleRating') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  const h = hover !== null ? pts[hover] : null;

  return (
    <div className="chart">
      <div className="legend">
        <span>
          <i className="swatch s1" /> Game rating
        </span>
        <span>
          <i className="swatch s2" /> Puzzle rating
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Rating history"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (pts.length - 1));
          setHover(Math.max(0, Math.min(pts.length - 1, i)));
        }}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.l - 8} y={y(v) + 4} className="axis" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <path d={path('puzzleRating')} className="line s2" />
        <path d={path('rating')} className="line s1" />
        <text x={x(pts.length - 1) + 8} y={y(last.rating) + 4} className="dlabel">
          {last.rating}
        </text>
        <text x={x(pts.length - 1) + 8} y={y(last.puzzleRating) + (Math.abs(last.rating - last.puzzleRating) < 30 ? 16 : 4)} className="dlabel">
          {last.puzzleRating}
        </text>
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="crosshair" />
            <circle cx={x(hover)} cy={y(h.rating)} r={4.5} className="dot s1" />
            <circle cx={x(hover)} cy={y(h.puzzleRating)} r={4.5} className="dot s2" />
          </g>
        )}
      </svg>
      {h && (
        <div className="tooltip">
          <div className="small muted">{new Date(h.t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>
          <div>
            <i className="swatch s1" /> Game <b>{h.rating}</b>
          </div>
          <div>
            <i className="swatch s2" /> Puzzle <b>{h.puzzleRating}</b>
          </div>
        </div>
      )}
    </div>
  );
}
