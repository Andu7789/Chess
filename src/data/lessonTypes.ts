import type { Square } from 'chess.js';
import type { Arrow, Mark } from '../board3d/Board3D';

export interface InfoStep {
  kind: 'info';
  title?: string;
  text: string;
  fen?: string;
  arrows?: Arrow[];
  marks?: Mark[];
}

/** Move a piece around an otherwise (nearly) empty board to collect every star. */
export interface CollectStep {
  kind: 'collect';
  text: string;
  fen: string;
  stars: Square[];
  /** par number of moves (for the star rating) */
  par: number;
}

/**
 * Find the right move(s). `moves` alternates player / opponent, starting with the player
 * and ending with the player. Alternatives for a player move are separated by "|".
 */
export interface PuzzleStep {
  kind: 'puzzle';
  text: string;
  fen: string;
  moves: string[];
  hint?: string;
  success?: string;
  /** any checkmating move is accepted on the final move */
  acceptAnyMate?: boolean;
  arrows?: Arrow[];
  marks?: Mark[];
}

/** Play the position out against the engine until the goal is reached. */
export interface GoalStep {
  kind: 'goal';
  text: string;
  fen: string;
  goal: 'mate' | 'promote';
  /** maximum number of your moves allowed */
  maxMoves: number;
  hint?: string;
  success?: string;
}

export interface QuizStep {
  kind: 'quiz';
  text: string;
  fen?: string;
  options: string[];
  answer: number;
  explain: string;
  arrows?: Arrow[];
  marks?: Mark[];
}

export type LessonStep = InfoStep | CollectStep | PuzzleStep | GoalStep | QuizStep;

export interface Lesson {
  id: string;
  unit: string;
  title: string;
  summary: string;
  minutes: number;
  steps: LessonStep[];
}

export interface Unit {
  id: string;
  title: string;
  icon: string;
  blurb: string;
}
