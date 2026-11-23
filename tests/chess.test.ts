import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { LESSONS, UNITS } from '../src/data/lessons';
import { PUZZLES, pickPuzzle } from '../src/data/puzzles';
import { detectMotifs, hangingPieces } from '../src/chess/tactics';
import { classify, moveAccuracy } from '../src/chess/analysis';
import { expectedScore, level, streak } from '../src/store/progress';

const lax = (fen: string) => {
  try {
    return new Chess(fen);
  } catch {
    return new Chess(fen, { skipValidation: true });
  }
};

describe('lessons', () => {
  it('every lesson belongs to a unit and has unique id', () => {
    const ids = new Set<string>();
    for (const l of LESSONS) {
      expect(UNITS.some((u) => u.id === l.unit)).toBe(true);
      expect(ids.has(l.id)).toBe(false);
      ids.add(l.id);
      expect(l.steps.length).toBeGreaterThan(0);
    }
  });

  it('puzzle steps are legal and end on the player move', () => {
    for (const l of LESSONS)
      for (const s of l.steps) {
        if (s.kind !== 'puzzle') continue;
        expect(s.moves.length % 2, `${l.id}`).toBe(1);
        const c = new Chess(s.fen);
        for (const m of s.moves) {
          for (const alt of m.split('|')) {
            const t = new Chess(c.fen());
            expect(() => t.move({ from: alt.slice(0, 2), to: alt.slice(2, 4), promotion: alt[4] }), `${l.id} ${alt}`).not.toThrow();
          }
          const first = m.split('|')[0];
          c.move({ from: first.slice(0, 2), to: first.slice(2, 4), promotion: first[4] });
        }
        if (s.acceptAnyMate) expect(c.isCheckmate(), l.id).toBe(true);
      }
  });

  it('collect/goal/info positions load', () => {
    for (const l of LESSONS)
      for (const s of l.steps) {
        if ('fen' in s && s.fen) expect(() => lax(s.fen!)).not.toThrow();
        if (s.kind === 'goal') expect(() => new Chess(s.fen)).not.toThrow();
        if (s.kind === 'quiz') expect(s.answer).toBeLessThan(s.options.length);
      }
  });
});

describe('puzzles', () => {
  it('has a decent library', () => {
    expect(PUZZLES.length).toBeGreaterThan(50);
  });
  it('every puzzle line is legal and ends with the solver to move last', () => {
    for (const p of PUZZLES) {
      expect(p.moves.length % 2, p.id).toBe(0);
      const c = new Chess(p.fen);
      for (const m of p.moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      if (p.themes.some((t) => /^mateIn\d$/.test(t))) expect(c.isCheckmate(), p.id).toBe(true);
    }
  });
  it('picks puzzles near the requested rating', () => {
    const p = pickPuzzle(800, {}, null)!;
    expect(Math.abs(p.rating - 800)).toBeLessThan(450);
  });
});

describe('tactics helpers', () => {
  it('detects a knight fork', () => {
    expect(detectMotifs('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5c7')).toContain('fork');
  });
  it('detects hanging pieces', () => {
    const h = hangingPieces('rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 3', 'b');
    expect(h.map((x) => x.square)).toContain('h4');
  });
  it('detects mate', () => {
    expect(detectMotifs('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1a8')).toContain('mate');
  });
});

describe('scoring', () => {
  it('classifies move quality', () => {
    expect(classify(30, false, 20)).toBe('blunder');
    expect(classify(15, false, 20)).toBe('mistake');
    expect(classify(8, false, 20)).toBe('inaccuracy');
    expect(classify(1, false, 20)).toBe('good');
    expect(classify(0, true, 20)).toBe('best');
    expect(moveAccuracy(0)).toBeCloseTo(100, 0);
  });
  it('elo expectation is symmetric', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(expectedScore(1200, 1000) + expectedScore(1000, 1200)).toBeCloseTo(1);
  });
  it('levels grow with xp', () => {
    expect(level(0).level).toBe(1);
    expect(level(100).level).toBe(2);
  });
  it('streak counts consecutive days', () => {
    const day = 86400000;
    const now = Date.now();
    const s = streak([{ t: now, type: 'puzzle' }, { t: now - day, type: 'puzzle' }, { t: now - 3 * day, type: 'lesson' }]);
    expect(s.current).toBe(2);
  });
});
