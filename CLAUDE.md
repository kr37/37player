# 37 Player: for AI agents

Read this first, then `NOTES.md`. That file is the project's memory: what
37 Player is, how it's built, the decisions made and why, and what's planned.
Read the sections that bear on your task before changing code.

## Rules

- **Keep NOTES.md true.** A change to behaviour, architecture or a design
  decision updates NOTES.md in the same commit. Notes that no longer match
  the code are a bug, like a failing test. Write down the *why*, especially
  kr37's decisions and what was tried and dropped.
- **Every shipped change bumps** `<meta name="app-version">` in
  `37-player.html` (only that first tag; see NOTES.md, Testing).
- **One file, one name space:** grep for a function name before adding a
  top-level function.
- **Colours and controls:** reuse the existing vocabulary and theme
  variables (NOTES.md, "Colours and controls"); don't invent a new button
  style for a new screen.

## Feedback reports

People's Send feedback reports land in the private repository
`kr37/37player-reports`, and `INDEX.md` there lists every report and names
the newest one a session has read.

- **At the start of every conversation**, before the task: add that
  repository to the session (push access), clone it (`--depth 1`) and compare
  `reports/` with `INDEX.md`. Tell kr37 about each new report in a line or
  two: who and which device, the version, what it says, and anything the logs
  show at a glance. Then add its line to `INDEX.md`, move the "newest read"
  line on, and push. Don't start fixing it unless he asks.
- **In a long conversation, check again** at the start of a reply once about
  a day has passed since the last check.
- When something comes of a report (a fix, a decision), its line in
  `INDEX.md` gets the version or the outcome.
- Reports hold personal details (reply addresses, names, device and library
  names). Keep those out of this public repository; NOTES.md can name a report
  by its ID.

## The droplet is off limits

The droplet (37player.com, kr37.net) is the production server: it serves
the website and the Centers' shared libraries. **Never connect to it** (SSH,
sshfs, scp, rsync, its web root), even to pass a file along. kr37 deploys.
- Test builds of the desktop app come from GitHub Actions, as pre-releases
  on the repo's Releases page.
- Something to paste on another machine goes in a file in the repo (or a
  gist), not on the website.

## Branches and commits

- `main` is what kr37 has approved; `dev` is where work lands for him to try
  on test.37player.com. Small fixes may go straight to `main`; bigger work
  goes to `dev`. Keep `dev` level with `main` after a merge.
- Commit as kr37 (`kr37 <kr37@users.noreply.github.com>`), with the
  session's Co-Authored-By line.

## Tests

- `tests/` (see `tests/README.md`): Puppeteer against a test copy of the app.
  Needs `CHROME=<path to Chrome or Chromium>` and `LANG=C.UTF-8`.
- Run single tests for what you changed. **Ask kr37 before running the full
  suite** (`tests/run-all.sh` with no names).
