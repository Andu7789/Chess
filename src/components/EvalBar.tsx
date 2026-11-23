import { winPercent } from '../chess/engine';

/** Vertical evaluation bar. `cp` is from White's perspective. */
export default function EvalBar({ cp, orientation }: { cp: number | null; orientation: 'w' | 'b' }) {
  const white = cp === null ? 50 : winPercent(cp);
  const label = cp === null ? '…' : Math.abs(cp) >= 9000 ? 'M' : (Math.abs(cp) / 100).toFixed(1);
  return (
    <div className={`evalbar ${orientation === 'b' ? 'flip' : ''}`} title="Engine evaluation">
      <div className="evalbar-white" style={{ height: `${white}%` }} />
      <span className={`evalbar-label ${white >= 50 ? 'w' : 'b'}`}>{label}</span>
    </div>
  );
}
