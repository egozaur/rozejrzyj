# CLAUDE.md

## Szybki start
- Gra słowna na **jednym komputerze**: losowana litera, gracze po kolei wymieniają rzeczowniki, które widzą wokół siebie.
- Strona: `index.html` (cała gra), `rz.js` (`window.RZ`: litery, `norm()`, API, kolejka offline), `nouns.js` (słownik), `common.css`.
- Serwer: `../pl3y-server/src/games/rozejrzyj/words.js` (DO `RzWords`, wspólna baza słów i statystyki). Testy: `cd ../pl3y-server && node --test test/all.test.js` (`test/games/rozejrzyj/`).
- Lokalnie: `node C:\Users\Kurczak\tools\scripts\serve.mjs C:\Users\Kurczak\pl3y 8090` serwuje folder z wszystkimi repo (potrzebny dla `?local=1`); otwórz `/rozejrzyj/?local=1`. E2E: `dev/run-e2e.sh`.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond to the user in Polish (zawsze odpowiadaj po polsku). UI text and code comments are in Polish.

## Project

"Rozejrzyj się" is a PL3Y party word game played on **one computer**. A letter is drawn, then players in turn name nouns starting with that letter that they can see around them. The host types each word and confirms with Enter. A player who doesn't answer in time (10–60 s, default 30) or whose word gets vetoed by the host is out for the round. The last player standing gets 1 point, and after all rounds the highest total wins. Every accepted word goes to a shared database on the PL3Y server, which feeds the statistics (e.g. "P: in 65% of rounds the first word is portfel").

Static HTML/CSS/JS, no build step, served at `https://pl3y.pl/rozejrzyj/` (repo `egozaur/rozejrzyj`, GitHub Pages). Work happens on two machines: **macOS** (Python 3, Node, Chrome; no PowerShell) and **Windows** (portable Node w `C:\Users\Kurczak\tools\node`, PowerShell 5.1, Edge; skrypty puppeteer w `C:\Users\Kurczak\tools\pt`). Check which one you are on and use the matching command below. The look follows the PL3Y lobby (black and gold, Cormorant Garamond + JetBrains Mono + Inter; tokens copied 1:1 from `lobby/index.html`).

- `index.html`: the whole game. Screens (`view`): `menu → setup → order → drum → turn → roundEnd → … → end`, plus `stats`. Loads the shared PL3Y password gate `/auth.js` (404 locally, so no password there). `rz.js` sends the session token from `localStorage.pl3y_token` as `Authorization`; a 401 or 429 keeps the round in the offline queue (`rz_queue`).
- `rz.js` (`window.RZ`):
  - `LETTERS`: the letter pool, the same as on the server; no Ą Ę Ń Ó Ź Ć Q V X Y.
  - `norm()`: NFC, collapsed spaces, Polish lowercase; the same function as on the server.
  - `api()`: fetch to the Worker or, with `?local=1`, the real `RzWords` class imported from `/pl3y-server/src/games/rozejrzyj/words.js` with storage in `localStorage.rz_local_db`.
  - `saveRound()` / `flush()`: offline queue in `localStorage.rz_queue` (a 4xx drops the entry, other errors keep it).
  - `known()`: dictionary = `RZ_NOUNS` ∪ `learned` from the server, cached in `rz_learned`.
  - `Snd`: WebAudio sounds only, no files.
- `nouns.js`: `window.RZ_NOUNS`, about 1.7k concrete nouns (nominative singular). It is incomplete on purpose: an unknown word is only *warned* (gold dot), never blocked, and once accepted in a game it joins the server's `learned` list. Add words freely (lowercase, space separated).
- `common.css`: theme tokens and shared components (`.btn`, `.panel`, `.chip`, `.modal`, `.toast`, `.eyebrow`, …). Hover rules only inside `@media (hover:hover)`. All animations are off under `prefers-reduced-motion`.

### Rules (as implemented)
- 2–12 players with distinct names. The order is drawn once (`G.order`), and round `r` starts with `order[r % n]`. Each round uses a different letter (`G.letters`, drawn at start).
- Enter checks three things:
  - the first letter must match exactly (S ≠ Ś); otherwise the word is blocked and the clock keeps running;
  - the word must not have been accepted already in this round, compared after `norm()`; otherwise it is blocked;
  - an unknown word is accepted with a warning.
- **Veto** (button or Delete on an empty field, then confirm): applies only to the most recent accepted word. Its author is out, the word is struck through and not saved, and the current player's clock restarts.
- Timeout: the current player is out. When one player is left, they get the point.
- Pause: button or Esc (Space is needed for typing). The clock logic runs from `setInterval` (rAF is only for the smooth bar), so it keeps working in a hidden tab.
- After each round the non-vetoed words are posted in order of entry. `rz_game` keeps the game between rounds, so „Wznów grę” continues from the next round.

### Statistics
Letter grid → per letter:
- **first word**: top 10 with % of rounds;
- **word ranking**: top 30 with % of rounds in which the word appeared.

To merge variants (e.g. szklanki → szklanka), select words, pick a target and click „Scal”. Merges are aliases applied when reading, so raw rounds stay untouched and „Rozłącz” undoes a merge. Export: CSV (`;`, UTF-8 BOM) and JSON.

## Server
Lives on the shared PL3Y Worker in the repo `../pl3y-server` (tylko `src/games/rozejrzyj/`): `src/games/rozejrzyj/words.js` (DO `RzWords`, singleton, runtime-agnostic because `?local=1` imports it), tests `test/games/rozejrzyj/rozejrzyj.suite.js`. Only a shared word database, no rooms. Storage keys: `r:<id>` raw rounds `{letter, words, ts}` (never changed); `agg:<L>` per-letter counters `{rounds, first, all}` (updated on each POST); `alias` merges (applied on read, so reversible); `learned` words accepted in games. The Worker allows only the listed method per route and caps the body at 8 kB. Routes:
- `GET /api/rz/stats`
- `POST /api/rz/rounds` `{letter, words}`
- `PUT /api/rz/alias` `{from:[…], to}`
- `DELETE /api/rz/alias/:word`
- `GET /api/rz/export`

Keep both sides in sync: `LETTERS`, `norm`, and the limits (≤ 60 words, ≤ 40 chars).

## Local testing
- `python3 -m http.server 8092 -d ..` (run in `rozejrzyj/`) serves the parent folder (folder `pl3y`, więc `/pl3y-server/...` jest osiągalny) on port 8092. (`dev\serve.ps1` does the same on Windows; keep it ASCII-only.) Open `http://localhost:8092/rozejrzyj/?local=1`. Without `?local`, the game talks to the production server.
- `?still` skips the drum animation, which helps screenshots: headless Chrome/Edge doesn't advance rAF under `--virtual-time-budget`.
- End-to-end: `dev/run-e2e.sh` is Windows-only (Edge path, `cygpath`); on macOS run the same flags with "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" (`--headless=new --disable-gpu --enable-logging=stderr --v=0 --user-data-dir=$(mktemp -d) --window-size=1440,900 http://localhost:8092/rozejrzyj/dev/e2e.html`, real time, about 45 s; macOS has no `timeout`, so kill it after ~75 s) and grep `[e2e]` / `E2E RESULT`. It drives `dev/e2e.html`, which clicks the real buttons in an iframe with a clean local database. It covers:
  - the setup screen;
  - wrong letter, repeat, and unknown-word warning;
  - pause, veto, and timeout;
  - start rotation, scoring and the tie at the end;
  - statistics (% of first word), merge and unmerge, `learned`.
- Screenshots: `dev/e2e.html?clean&stopAt=<view>[&n=<round>][&w=390]` with `--virtual-time-budget` (see `run-e2e.sh` for the flags; use Chrome on macOS). `&rects=<selectors>` logs element boxes.
