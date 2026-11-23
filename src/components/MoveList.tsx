import { useEffect, useRef } from 'react';

export default function MoveList({
  moves,
  current,
  onSelect,
  classes,
}: {
  moves: string[];
  current?: number;
  onSelect?: (ply: number) => void;
  classes?: (string | undefined)[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [moves.length]);
  const rows: { n: number; w?: number; b?: number }[] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push({ n: i / 2 + 1, w: i, b: i + 1 < moves.length ? i + 1 : undefined });
  const cell = (ply?: number) =>
    ply === undefined ? (
      <span />
    ) : (
      <button
        className={`mv ${current === ply ? 'cur' : ''} ${classes?.[ply] ?? ''}`}
        onClick={() => onSelect?.(ply)}
        disabled={!onSelect}
      >
        {moves[ply]}
      </button>
    );
  return (
    <div className="movelist" ref={ref}>
      {rows.length === 0 && <span className="muted small">No moves yet.</span>}
      {rows.map((r) => (
        <div key={r.n} className="mvrow">
          <span className="mvn">{r.n}.</span>
          {cell(r.w)}
          {cell(r.b)}
        </div>
      ))}
    </div>
  );
}
