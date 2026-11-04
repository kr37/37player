# 37 Player: for AI agents

Read this first, then `NOTES.md`. That file is the project's memory: what
37 Player is, how it's built, the decisions made and why, and what's planned.
Read the sections that bear on your task before changing code.

## Rules

- **Keep NOTES.md true.** A change to behaviour, architecture or a design
  decision updates NOTES.md in the same commit. Notes that no longer match
  the code are a bug, like a failing test. Write down the *why*, especially
  Gen's decisions and what was tried and dropped.
- **Every shipped change bumps** `<meta name="app-version">` in
  `37-player.html` (only that first tag; see NOTES.md, Testing).
- **One file, one name space:** grep for a function name before adding a
  top-level function.
- **Colours and controls:** reuse the existing vocabulary and theme
  variables (NOTES.md, "Colours and controls"); don't invent a new button
  style for a new screen.

## Branches and commits

- `main` is what Gen has approved; `dev` is where work lands for him to try
  on test.37player.com. Small fixes may go straight to `main`; bigger work
  goes to `dev`. Keep `dev` level with `main` after a merge.
- Commit as Gen (`Kelsang Rinzin <kelsangrinzin@gmail.com>`), with the
  session's Co-Authored-By line.

## Tests

- `tests/` (see `tests/README.md`): Puppeteer against a test copy of the app.
  Needs `CHROME=<path to Chrome or Chromium>` and `LANG=C.UTF-8`.
- Run single tests for what you changed. **Ask Gen before running the full
  suite** (`tests/run-all.sh` with no names).
