# კროსვორდი — Georgian crossword game

A complete static, Georgian-language crossword application. HTML, CSS, native ES modules, JSON, `localStorage`, and a service worker. No framework, database, account, analytics, external fonts, or runtime API calls.

**Included collection: 20 original Georgian mini crosswords, all validated.** These are explicitly labeled originals, not Ambebi puzzles. The Ambebi extractor is implemented and was executed against all four listing pages: **67 discovered, 38 extracted and validated, 29 rejected**. Original solution strings were obtained. Source content is deliberately excluded from this repository and the public build because redistribution permission was not established. See [the extraction report](docs/extraction-report.json) and [source research](docs/SOURCE_RESEARCH.md).

## Run locally

Use Python 3.10+ from the project directory:

```sh
python3 scripts/dev.py
```

Open `http://127.0.0.1:8000/`. On Windows, `py scripts/dev.py` also works. Do not open `index.html` directly with `file://`: native modules and JSON fetching require HTTP.

Alternatively, with Node.js 20+:

```sh
npm run dev
```

No `npm install` or `pip install` is required. Python is a development server only. Visitors to the published site need only a modern browser.

Local development disables service-worker registration by default to avoid stale files. To test offline operation locally, open `http://127.0.0.1:8000/?offline=1`. HTTPS deployments enable offline support automatically.

## Features

- Searchable catalog, difficulty filters, favorites, unfinished and completed views, resume card, random unfinished puzzle, deterministic daily puzzle.
- Responsive grid with across/down clues, shared intersections, click-to-switch direction, keyboard navigation, native Georgian entry, Mtavruli normalization, composition handling, paste, and a 33-letter on-screen keyboard.
- Optional Georgian QWERTY transliteration. Native Georgian input always works.
- Manual letter/word/grid checks, reveal letter/word, word clearing, confirmed restart, optional automatic error highlighting.
- Reproducible scoring, one-time rewards, hint and mistake penalties, difficulty-adjusted speed bonuses, completion summaries, answer-free result sharing.
- Autosaved progress, versioned save migration, input validation, quota/error notices, JSON backup export/import, confirmed full reset, retained best scores and history after restart.
- Statistics, seven earned achievements, current/longest playing streak, level progression, zen mode, optional sound generated locally.
- Light/dark themes, larger cells, high contrast, reduced-motion support, keyboard help, labeled controls, and a skip link.
- Self-hosted Georgian, Latin, and symbol fonts; no external requests in the published application.
- Offline app shell, lazy puzzle caching, optional whole-catalog caching, content-versioned production caches.

These are compact themed puzzles (7–8 clues each), with editorial difficulty labels. They are intentionally manageable demonstration content, not a substitute for a professionally edited large-grid collection.

## Controls

| Action | Control |
|---|---|
| Select a cell | Click/tap |
| Change direction at intersection | Click selected cell again, or Enter |
| Select a word | Click a clue |
| Move | Arrow keys |
| Next/previous clue while in the grid | Tab / Shift+Tab |
| Delete | Backspace; on an empty cell it moves back first |
| Paste | Paste into the focused letter input; limited to the selected word |
| Pause/resume | Escape or pause button |
| Leave keyboard grid navigation | Escape pauses and focuses the resume control; ordinary Tab navigation resumes |

Automatic movement skips filled cells when possible. To intentionally replace a crossing letter, select its cell. Revealed cells remain fixed and carry a small gold dot. Check feedback never treats a full but incorrect word as solved. Normal entry does not expose correctness through score changes: accuracy points are credited on a requested check or successful completion.

## Transliteration

Turn on **პარამეტრები → ლათინური კლავიატურა**. The mapping follows Georgian QWERTY; it uses **case-sensitive single keys**, not digraphs. For example, `sh` enters სჰ; `S` enters შ. This avoids delayed ambiguous input and does not interfere with composition or Georgian typing.

| Latin | Georgian | Latin | Georgian | Latin | Georgian |
|---|---|---|---|---|---|
| a | ა | b | ბ | g | გ |
| d | დ | e | ე | v | ვ |
| z | ზ | T | თ | i | ი |
| k | კ | l | ლ | m | მ |
| n | ნ | o | ო | p | პ |
| J | ჟ | r | რ | s | ს |
| t | ტ | u | უ | f | ფ |
| q | ქ | R | ღ | y | ყ |
| S | შ | C | ჩ | c | ც |
| Z | ძ | w | წ | W | ჭ |
| x | ხ | j | ჯ | h | ჰ |

## Scoring

`js/scoring.js` is the single location for point values and speed targets.

| Event | Points |
|---|---:|
| Correct checked cell, once per attempt | +10 |
| Correct checked word with no revealed cells, once per attempt | +25 |
| Puzzle completion | +200 |
| Completion without hints | +150 |
| Speed bonus | 0–100 |
| Distinct incorrect check | −5 |
| Reveal a letter | −25 |
| Reveal a word | −100 |

Speed bonus = `max(0, round(100 × (1 − seconds / target)))`. Targets: easy 360 seconds, medium 720, hard 1200. Empty cells do not incur mistakes. Whole-grid checks charge once per incorrect word; overlapping wrong letters are highlighted once. Rechecking the same word with the same content does not add another penalty. A new check scope can be a separate check.

Rewarded cell and word IDs are saved, so deleting/retyping and intersections cannot duplicate rewards. Revealed cells never earn normal cell points; words containing them lose word rewards. Final scores are clamped to 0–10,000,000. Total score/XP is the sum of each puzzle's best completed score, so repeats do not inflate the total. A level requires 1,500 points.

Restart archives attempt counters and retains best time, best score, completion count, and achievement evidence. Average completion time means the average of the best completed times for unique puzzles. Accuracy is a transparent check metric: credited correct letters across attempts divided by credited correct letters plus distinct incorrect checks; it is not a measure of every keystroke.

Changing point values recalculates active attempt scores. Historical best scores are retained as earned. If you want to rebase those historical results, introduce an explicit save migration rather than silently overwriting them.

## Persistence and updates

The stable key is `sitqvana.progress`; current save version is 2. It contains user-specific state only. Puzzles and answers are loaded from JSON, not stored in `localStorage`. Version 1 saves migrate valid cell values, timers, settings, and available completion summaries.

Meaningful state changes save immediately; active time saves periodically and on navigation/page hide. Time stops when paused, hidden, unfocused, a modal is open, or five minutes have passed without interaction. Revealed letters are validated again when restoring a puzzle. Invalid saves are not silently overwritten. Quota/unavailable storage errors leave the current in-memory game usable and offer backup export.

Progress is **specific to the browser profile, device, and origin**. Clearing site data, private browsing, storage eviction, or switching origins can remove or separate it. Export before switching devices or domain. Multiple tabs receive storage-change updates; simultaneous writes are last-writer-wins, so use one active playing tab.

- Reset one puzzle: game `•••` → `თავიდან დაწყება`, then confirm.
- Reset everything: Settings → `მთელი პროგრესის წაშლა`, then confirm.
- Backup: Settings → `პროგრესის ექსპორტი`.
- Restore: Settings → `ფაილიდან აღდგენა`; import replaces the current save after confirmation.

Keep puzzle IDs stable. Do not change a published answer/grid under the same ID; publish a new ID for material puzzle revisions. Ordinary CSS/JS changes and cache cleanup do not erase progress.

## Offline operation

On HTTPS (or local `?offline=1`), the service worker caches the app shell and manifest, then caches each opened puzzle. Settings can download all puzzles. Cache Storage holds static resources; `localStorage` independently holds progress.

Run the build script for every deployment: it embeds a hash of the output into the worker's cache name. Old app-shell caches are cleaned on activation, while previously opened puzzle JSON is carried forward. A new worker waits for existing game tabs to close before activation; close all game tabs and reopen after an update notification. This avoids changing code during a live game. Network-first puzzle/manifest requests refresh cached data when online.

If caching fails because a browser quota is full or a download is interrupted, the UI reports it. Browser storage eviction can still remove offline files. Already cached games continue offline; a never-cached puzzle shows a useful loading error.

## Tests

With Node.js 20+ and Python 3.10+:

```sh
npm test
python3 scripts/validator.py data/puzzles --report docs/validation-report.json
python3 scripts/build.py
```

The Node suite covers engine interactions, Georgian normalization, scoring, persistence, migrations, cache behavior, module syntax, and the absence of external runtime services. Python tests cover source conversion, conflicting intersections, missing answers, numbering, manifests, deduplication, caching and robots restrictions. Fixtures use original project clues, not copied source puzzles.

For the automated browser suite, run the local server and open:

```text
http://127.0.0.1:8000/tests/e2e.html
```

Click **Run complete browser tests**. It exercises the actual application in an iframe: entry, across/down selection, checking, hinting, navigation, reload restoration, solving, completion persistence, 390-pixel layouts, themes, accessibility settings, statistics and achievements. It temporarily uses and then restores progress on this **test origin** and clears this app's test-origin service-worker caches. Do not run it against your live playing origin or while other game tabs are open. It uses native browser APIs and requires no browser automation package.

`tests/responsive.html` is a 390 × 844 live preview for visual QA. These test pages are excluded from production.

## GitHub Pages deployment

1. Create a repository, for example `georgian-crossword`.
2. Upload the contents of this project directory to its root, including `.github/workflows/deploy.yml`.
3. Use `main` as the branch, or update the workflow's `push.branches`.
4. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions**.
5. Push to `main`, or run the workflow manually from Actions.

The workflow runs tests and data validation, packages `dist/`, and deploys that artifact. Pull requests run checks without publishing. No secrets or personal access tokens are required by the workflow beyond GitHub's provided token.

All application paths are relative, service-worker scope is derived from its directory, and routes use hashes. A URL such as `https://username.github.io/georgian-crossword/#/puzzle/original-002` works without server routing. **Changing the repository name requires no application base-path edit.** Do not add `<base href="/">` or convert asset URLs to root-absolute paths.

You can also upload the generated `dist/` contents to any static HTTPS host. The public build contains only HTML, CSS, JS, fonts, icons, manifest, and the deployable JSON collection. It excludes tests, source research, caches, scripts, and permission documents.

GitHub's hosted deployment was not run in this session because no GitHub repository was provided. The local production build and repository-subpath loading were tested; see [implementation report](docs/IMPLEMENTATION_REPORT.md).

## Adding puzzles

1. Create `data/puzzles/<id>.json` matching [the versioned schema](docs/puzzle.schema.json). Copy an original puzzle as a structural example.
2. Use zero-based `row`/`col`; blocked cells are `[row, col]` pairs. Every unblocked cell must belong to a clue. Each answer contains exactly one modern Georgian letter per cell. Clue IDs are unique; starts are numbered in row-major order, with the same number at a shared start.
3. Preserve provenance. External puzzles need source URL, source identifier, extraction timestamp and permission information. Do not label external content as original.
4. Validate and rebuild the manifest:

```sh
python3 scripts/rebuild_index.py data/puzzles --version collection-2026-11-10
python3 scripts/validator.py data/puzzles
npm test
python3 scripts/build.py
```

`tests/test_data.py` asserts that the bundled starter collection contains 20 puzzles; update that expectation when deliberately expanding it. The runtime manifest contains metadata only; answer files load lazily.

The validator reconstructs all cells, rejects conflicting intersections, overflow, blocked answers, unnumbered runs, disconnected grids, invalid Unicode answers, duplicate IDs, empty clues, bad lengths and missing cells. It intentionally does not repair source answers or numbering by guessing.

To reproduce the original collection:

```sh
python3 scripts/create_originals.py --count 20
```

## Ambebi extractor

Research and the first three-puzzle frontend test were completed before source collection. The adapter follows the actual observed public API format, not a speculative parser.

```sh
python3 scripts/scraper.py
```

Default output: `.private/ambebi/` (ignored by Git and excluded from builds). It checks `robots.txt`, obeys disallow/crawl-delay rules, uses a minimum 1.5-second request interval, follows declared pagination, deduplicates IDs and content, caches responses for resume, retries temporary HTTP failures with backoff, and stops on authentication or human-verification restrictions. It never executes downloaded JavaScript. `token=tkn` is the literal public parameter found in the site's own bundle, not an account credential.

The listing already includes original questions and solutions, so the scraper does not unnecessarily fetch every detail page. Each accepted crossword becomes a separate validated JSON file, plus `index.json`, `report.json`, and `scrape.log`.

```sh
# Resume using cached pages:
python3 scripts/scraper.py

# Refresh source listings for incremental updates:
python3 scripts/scraper.py --refresh --delay 3

# Different private review directory:
python3 scripts/scraper.py --output /path/to/private-review
```

**Personal access is not redistribution permission.** The source's published terms distinguish personal use from republication under written agreement. Do not upload `.private/` to GitHub Pages. A permission record does not itself grant rights; obtain actual written authorization covering your intended use first.

After that authorization, create a private JSON record:

```json
{
  "source": "ambebi.ge",
  "redistributionAllowed": true,
  "evidence": "Location/reference of the rights holder's written authorization"
}
```

Then export validated content into the public collection:

```sh
python3 scripts/scraper.py --permission-file /private/permission.json --publish-dir data/puzzles
python3 scripts/rebuild_index.py data/puzzles --version authorized-collection-v1
python3 scripts/validator.py data/puzzles
```

Keep the authorization document private. The source API and rules may change; inspect errors and update the adapter rather than bypassing restrictions. Difficulty is estimated from clue count where the source has none, and this is labeled `difficultyEstimated`.

## Project organization

| Path | Responsibility |
|---|---|
| `js/app.js` | Screen rendering, UI wiring, active timer, accessibility interactions |
| `js/crossword-engine.js` | Shared cell state, selection, navigation, checks, reveals, completion |
| `js/crossword-renderer.js` | Grid and clue presentation |
| `js/keyboard.js` | Georgian normalization and transliteration |
| `js/scoring.js` | Score formula and configurable constants |
| `js/storage.js` | Save schema, validation, migration, backup, history |
| `js/statistics.js`, `js/achievements.js` | Derived metrics and earned badges |
| `js/puzzle-loader.js`, `js/daily-puzzle.js` | Lazy JSON loading, runtime validation, daily selection |
| `service-worker.js` | Offline resource caching, independent of saved progress |
| `scripts/` | Original data generation, source extraction, validation, packaging |
| `tests/` | Node, Python and browser regression suites |

Daily selection sorts IDs, converts the **Asia/Tbilisi** calendar date to a day number, and selects `dayNumber % catalog.length`. Identical catalogs and dates give identical results. Changing catalog membership can change the daily selection. Streaks use the same calendar and require a meaningful gameplay state change; merely visiting pages earns nothing.

## Licenses and limits

Code: MIT. Original puzzle data: CC0-1.0 to the extent rights exist. Local Noto fonts: SIL OFL 1.1 with the bundled license. No Ambebi questions, answers, branding, or visual assets are included in the public dataset.

There is no online leaderboard or tamper-proof score enforcement: a person with browser developer tools can inspect static answers or edit local saves. The safeguards prevent ordinary gameplay farming and accidental errors, not deliberate local tampering. Mobile layouts were tested in a browser viewport, not on physical iOS/Android devices. Optional supplemental “smart hints” were omitted because no trustworthy supplemental source data was available.
