# ♞ Chess Coach 3D

A chess learning app with a 3D board: lessons, puzzles, coached games against a ladder of
computer opponents, game reviews, and goals and targets to track your improvement. The end goal is beating Rachel.

## Features

- **3D board**: React Three Fiber, with pieces built procedurally in code, animated moves,
  highlights and arrows. You can rotate and zoom, or switch to a top-down view.
- **Play the computer**: a ladder of bots from about 250 to 2200 Elo, including a configurable
  **Rachel bot**. Practice mode has the coach on: it warns you before blunders, gives
  three-stage hints, shows a danger overlay, comments on threats and lets you take moves back.
  Rated mode gives no help and counts toward your rating.
- **Game review**: Stockfish grades every move (best, good, inaccuracy, mistake, blunder),
  gives you an accuracy %, explains your key mistakes and lets you replay them to find the better move.
- **Lessons**: 23 interactive lessons in 6 units (Foundations, Checkmate, Tactics, Openings,
  Thinking Like a Player, Endgames). Lesson types include collect-the-stars, find-the-move,
  play-it-out against the engine, and quizzes.
- **Puzzles**: puzzles generated with Stockfish, matched to your puzzle rating, with theme
  training, Puzzle Rush and spaced-repetition retries of puzzles you missed.
- **Progress**: game and puzzle ratings, XP and levels, daily goals, weekly targets, streaks,
  25 achievements, a skill profile and a "Coach recommends" next step.

Progress is saved in your browser (localStorage). No account is needed.

## Development

```bash
npm install
npm run dev          # local dev server
npm test             # unit tests
npm run build        # production build in dist/
npm run validate:lessons   # checks every lesson with Stockfish
node scripts/gen-puzzles.mjs out.jsonl 100 7   # generate more puzzles (seed 7)
```

## Deployment

`.github/workflows/deploy.yml` builds the app and publishes it to GitHub Pages on every push.
To turn it on once, open **Settings → Pages → Build and deployment → Source: GitHub Actions** in the repository.

## Licences

The chess engine is [Stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL-3.0). Its files
in `public/engine/` are shipped unmodified, with its licence in `public/engine/COPYING-stockfish.txt`.
