# Project Status and Handoff

Last updated: 2026-06-03

This document is the main handoff note for continuing Padok in a new Codex chat.

## Current Goal

Padok is a Gazi Kosusu-focused horse racing decision-support application. It is not yet a betting recommendation engine or a final prediction model.

The current product goal is:

```text
official race data -> normalized route reports -> explainable historical validation -> human-readable analysis UI
```

## Current State

The application is live on GitHub Pages:

```text
https://bugragormus.github.io/Padok/
```

The latest major committed feature before the current participation work is:

```text
7f88f31 Add historical Gazi route backtest
```

The app currently shows:

- 2025 Gazi route race details from official TJK-derived data.
- A visible data status panel.
- Horse-level entries for route races.
- Pedigree, owner, and jockey coverage.
- A historical backtest panel for the 2020-2025 Gazi routes.
- A Gazi route participation matrix showing which Gazi runners did or did not run each tracked prep race.
- A static candidate panel that is still marked as a prototype.

## Current Data Coverage

Committed route report files:

- `data/gazi-route-2020.json`
- `data/gazi-route-2021.json`
- `data/gazi-route-2022.json`
- `data/gazi-route-2023.json`
- `data/gazi-route-2024.json`
- `data/gazi-route-2025.json`
- `data/gazi-backtest-report.json`
- `data/gazi-participation-report.json`

Current historical backtest sample:

- `6` seasons: 2020-2025
- `30` named prep races
- `18` Gazi top-three slots
- `16` of those top-three slots were covered by at least one tracked route race
- Overall route coverage: `89%`

Important interpretation:

The backtest measures association, not causality. It does not mean every Gazi-relevant horse must run in every signal race.

Current 2025 participation snapshot:

- `22` Gazi runners.
- `17` runners had at least one tracked prep start.
- `5` runners reached Gazi without appearing in the tracked prep route races.
- The 2025 Gazi top three all had at least one tracked prep start.

## Critical Product Caveat

Do not assume:

```text
Mehmet Akif runner -> Gazi runner
Gazi runner -> Mehmet Akif runner
Sait Akson winner -> Gazi winner
Gazi winner -> must have run in a tracked prep race
```

The user explicitly called this out and it is correct.

A Gazi winner may skip Mehmet Akif, Sait Akson, or even all tracked route races. That absence is not automatically negative. It is a signal that must be shown and interpreted.

The participation matrix now handles this explicitly:

```text
horse x route race
```

For each Gazi horse, show whether it ran in:

- Erkek Tay Deneme
- Disi Tay Deneme
- Mehmet Akif Ersoy
- Sait Akson
- Kisrak
- Gazi

This makes both presence and absence visible. Absence must not be treated as an automatic negative score.

## Data Pipeline

The working pipeline is:

```text
TJK AJAX HTML endpoints
-> raw snapshots
-> parsers
-> SQLite
-> static JSON exports
-> GitHub Pages UI
```

Key scripts:

- `scripts/fetch-tjk-race-index.mjs`
- `scripts/import-tjk-race-index.mjs`
- `scripts/fetch-tjk-named-races.mjs`
- `scripts/import-tjk-named-races.mjs`
- `scripts/fetch-tjk-daily-results.mjs`
- `scripts/import-tjk-daily-results.mjs`
- `scripts/refresh-gazi-route-data.mjs`
- `scripts/export-gazi-route-report.mjs`
- `scripts/backtest-gazi-route.mjs`
- `scripts/build-gazi-participation.mjs`

Useful commands:

```bash
npm test
npm run dev
npm run refresh:gazi-route -- --year 2025 --out data/gazi-route-report.json
npm run backtest:gazi-route -- \
  --input data/gazi-route-2020.json \
  --input data/gazi-route-2021.json \
  --input data/gazi-route-2022.json \
  --input data/gazi-route-2023.json \
  --input data/gazi-route-2024.json \
  --input data/gazi-route-2025.json \
  --out data/gazi-backtest-report.json
npm run build:gazi-participation -- --input data/gazi-route-report.json --out data/gazi-participation-report.json
```

## Live Deployment

GitHub Pages is configured through:

```text
.github/workflows/pages.yml
```

The workflow:

1. Runs tests.
2. Builds a temporary SQLite database.
3. Fetches current-season race index data.
4. Imports named races.
5. Refreshes 2025 historical route data.
6. Refreshes 2026 current route data.
7. Builds the historical backtest from committed 2020-2025 route reports and generated 2025 data.
8. Builds the selected-year Gazi participation matrix.
9. Deploys the static site to Pages.

No paid hosting or database is currently required.

## Current UX State

The UI is useful but still MVP-level.

Good current pieces:

- Data status is visible.
- Backtest metrics are visible.
- Route participation matrix is visible.
- Route race entries are readable.
- Live Pages deployment works.

Weak current pieces:

- Route entry lists are long and always expanded.
- Candidate panel is still manually seeded and not driven by the real 2026 field.
- There is no horse-centered comparison page yet.
- There is no explanation panel per horse showing why a score changed.

## Recommended Next Steps

### 1. Horse-Centered Detail View

Create a compact per-horse view:

- route race participation
- finish positions
- jockeys
- owner
- sire / dam / damsire
- best comparable performance
- missing data flags

### 2. Candidate Field Mode

When 2026 Gazi declarations are available:

- ingest declared runners
- switch from prototype candidate cards to official field cards
- show missing route races and pending results

### 3. Feature Baseline

After the participation matrix:

- horse performance score
- route performance score
- jockey score
- pedigree prior
- owner/trainer context
- data confidence

Keep these scores separate in the UI. Do not hide everything inside one number.

### 4. UX Improvements

- Collapse long race entry lists by default.
- Add year selector for route and backtest views.
- Add a horse comparison mode.
- Add clear labels for "known", "missing", "not run", and "not yet available".

## Working Principles

- All code, commits, method names, and comments should stay in English.
- Product content can be Turkish.
- Do not use future information when calculating historical features.
- Treat missing participation as information, not as failure.
- Keep analysis explainable before trying ML.
- Use official TJK data first; use secondary sources only for enrichment or cross-checking.
