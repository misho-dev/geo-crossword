# Ambebi source investigation — 10 November 2026

The frontend, three original demo puzzles and core tests were completed before inspecting source data. The deployable app never contacts Ambebi.

## Observed representation

- Entry page: https://www.ambebi.ge/puzzle/crosswords/
- `robots.txt`: https://www.ambebi.ge/robots.txt returned HTTP 404 during this run. No rules were published there; the extractor checks again on each run and fails closed if robots cannot be checked for other reasons.
- The entry HTML loads `/static/build/app.a8tdq.js`. Its route configuration loads chunks `24.a8tdq.js` (detail) and `25.a8tdq.js` (catalog).
- The catalog bundle requests `/api/puzzle/crosswords/?page=N&token=tkn`.
- The detail bundle requests `/api/puzzle/crosswords/ID?token=tkn`.
- `tkn` is the same public literal in the site's JavaScript. No authentication credentials, private tokens, CAPTCHA bypasses, or access-control workarounds were used.
- The catalog returns `pagination.count`, `pagination.current`, `pagination.num_pages`, and `results`. Each result contains `id`, `name`, `active`, `created`, `dimensions`, and `entries`.
- Each entry contains `clue`, `direction`, `length`, `number`, `position: {x,y}`, and the **original answer** in `solution`. Coordinates are zero-based. `x` maps to column; `y` maps to row.
- The listing already supplies complete entry data. The extractor therefore needs four listing requests, not 67 separate detail requests. Two detail responses were inspected separately to cross-check one accepted and one rejected item: ID 68 validated; ID 67 reproduced a conflicting intersection.
- No difficulty metadata was present. The adapter estimates difficulty from clue count and labels this explicitly.

## Executed collection

| Metric | Result |
|---|---:|
| Listing pages traversed | 4 |
| Advertised and discovered source puzzles | 67 |
| Source puzzles extracted to valid normalized JSON | 38 |
| Passed strict grid validation | 38 |
| Rejected | 29 |
| Duplicate source IDs/content | 0 |
| Included in public/deployable dataset | 0 |

Original questions and solution strings were available in the retrieved data. The collection's advertised pagination was exhausted. The 29 rejected items were not repaired, guessed, or silently included. The per-item reasons and source URLs are in `extraction-report.json`. Reasons include conflicting intersections, overlapping entries, missing runs, inconsistent numbering, out-of-bounds words, invalid Georgian answers, and disconnected grids. Some rejections reflect this application's stricter grid requirements; they should not all be interpreted as proof that the source site's renderer cannot display them.

The extractor cached responses for resume, respected a minimum interval, converted accepted records, reconstructed every completed grid, and produced a manifest and report. Re-running without `--refresh` uses cached listing responses. Private research content and caches are not part of the delivered repository archive or static build.

## Reuse decision

Source terms checked:
https://www.ambebi.ge/article/3006-masalebis-gamokveqnebis-pirobebi/

The published terms distinguish free personal use from republication governed by written agreement. No written permission covering this project's public redistribution was provided or established. As specified in the brief, the public package therefore uses **20 original Georgian puzzles** and preserves the extraction tooling for use once appropriate authorization exists.

No source questions, answers, logos, or visual assets are redistributed in this package. The metadata-only report is retained as evidence of the actual investigation and validation outcome.

## Updating the adapter

`scripts/scraper.py` contains the observed URLs and shape conversion. It uses Python's standard library only. If the site changes format, a missing `dimensions`, `entries`, `position`, or `solution` produces an explicit rejection. It does not infer absent answers or execute source scripts. Publication requires a permission record and a separate `--publish-dir` argument; private review is the default.

Run `scripts/rebuild_index.py` after adding authorized files to the public dataset. Preserve provenance and do not change original clue wording or numbering to force a failed puzzle to pass.
