# Project Status and Handoff

Last updated: 2026-06-05

This document is the main handoff note for continuing Padok in a new Codex chat.

## Current Goal

Padok is a Gazi Kosusu-focused horse racing decision-support application. It is not yet a betting recommendation engine or a final prediction model.

The current product goal is:

```text
official race data -> normalized route reports -> explainable historical validation -> simple decision screen
```

## Current State

The application is live on GitHub Pages:

```text
https://bugragormus.github.io/Padok/
```

The latest completed product step is:

```text
Decision-flow UI simplification
```

The app currently shows:

- 2025 Gazi route race details from official TJK-derived data.
- 2020-2025 historical route reports and explainable backtest metrics.
- A Gazi route participation matrix showing which Gazi runners did or did not run each tracked prep race.
- Horse readiness rankings across score, route, form, actor, uncertainty, and upside lenses.
- A model backtest panel that recalculates readiness using only earlier seasons as evidence.
- Signal calibration and weight recommendation artifacts.
- A candidate comparison artifact that combines route, readiness, actor, pedigree, owner, strengths, cautions, and calibrated ranking.
- A race-day watchlist artifact that groups core contenders, upside profiles, risk flags, and data checklist notes.
- A simplified first decision screen that groups the decision brief, race-day watchlist, candidate comparison, and Gazi radar together.
- A static API index and a local read-only MCP bridge over the generated analysis artifacts.

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
- `data/gazi-data-horizon.json`
- `data/gazi-readiness-report.json`
- `data/gazi-readiness-2020.json` through `data/gazi-readiness-2025.json`
- `data/gazi-model-backtest.json`
- `data/gazi-signal-calibration.json`
- `data/gazi-decision-brief.json`
- `data/gazi-candidate-comparison.json`
- `data/gazi-race-day-watchlist.json`
- `data/padok-data-manifest.json`
- `data/padok-api-index.json`

Current historical backtest sample:

- `6` seasons: 2020-2025
- `30` named prep races
- `18` Gazi top-three slots
- `16` of those top-three slots were covered by at least one tracked route race
- Overall route coverage: `89%`

Current data horizon:

- High-confidence window in repo: `2020-2025`
- Immediate target: `2020-2026`
- Next expansion target: `2015-2019`
- Archive research window: `1927-2014`
- Current tracked route starts: `559`

Important interpretation:

The backtest measures association, not causality. It does not mean every Gazi-relevant horse must run in every signal race.

Current 2025 participation snapshot:

- `22` Gazi runners.
- `17` runners had at least one tracked prep start.
- `5` runners reached Gazi without appearing in the tracked prep route races.
- The 2025 Gazi top three all had at least one tracked prep start.

Current 2025 decision-support snapshot:

- The calibrated race-day watchlist has `4` core contenders.
- It also surfaces upside profiles, risk flags, and data checklist notes.
- This is still decision support, not a claim that the app can deterministically identify the winner.
- A surprise result should be explained after the race through missed signals, missing data, route absence, actor context, pace, track, and pedigree/owner/trainer priors, not forced into the model by overfitting one season.

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
- `scripts/build-gazi-readiness-report.mjs`
- `scripts/build-gazi-model-backtest.mjs`
- `scripts/build-gazi-signal-calibration.mjs`
- `scripts/build-gazi-decision-brief.mjs`
- `scripts/build-gazi-candidate-comparison.mjs`
- `scripts/build-gazi-race-day-watchlist.mjs`
- `scripts/build-gazi-data-horizon.mjs`
- `scripts/build-padok-api-index.mjs`
- `scripts/padok-mcp-server.mjs`

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
npm run build:gazi-readiness -- --input data/gazi-participation-report.json --out data/gazi-readiness-report.json
npm run build:gazi-model-backtest
npm run build:gazi-signal-calibration
npm run build:gazi-decision-brief
npm run build:gazi-candidate-comparison
npm run build:gazi-race-day-watchlist
npm run build:gazi-data-horizon -- --data-dir data --out data/gazi-data-horizon.json
npm run build:api-index
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
9. Builds readiness, model backtest, signal calibration, decision brief, candidate comparison, and race-day watchlist artifacts.
10. Builds the data horizon, manifest, and static API index.
11. Deploys the static site to Pages.

No paid hosting or database is currently required.

## Current UX State

The UI has started moving from a report wall toward a guided decision product.

Good current pieces:

- The app has real analysis artifacts behind it, not only manually written copy.
- Route participation, readiness, calibration, comparison, and watchlist layers are all generated from data.
- The top user flow now starts with a decision dashboard rather than raw matrices or technical validation.
- The long participation matrix starts collapsed behind a detail control.
- The static API and MCP bridge give us a path toward automation and AI-assisted querying.
- Live Pages deployment can work without paid infrastructure.

Weak current pieces:

- Some technical/progress panels are still too prominent below the main decision screen.
- The user flow is clearer, but candidate detail and comparison still need to feel like one cohesive workflow.
- Route race and validation sections still need stronger tab/detail organization.
- There is no horse-centered comparison page yet.
- There is no simple explanation panel per horse showing why a score changed.

## Recommended Next Steps

### 1. Continue UX Simplification

Turn the UI into a guided decision product instead of a report wall:

- First screen: summary, race-day watchlist, top candidates, and clear confidence/status. The first version of this is now in place.
- Secondary tabs: candidates, comparison, route races, validation, data health.
- Technical/progress details should move to docs or collapsible diagnostics.
- Every panel should answer one user question in plain Turkish.
- Keep long race entry lists and matrices behind expand/collapse controls.

### 2. Horse-Centered Detail View

Create a compact per-horse view:

- route race participation
- finish positions
- jockeys
- owner
- sire / dam / damsire
- best comparable performance
- missing data flags

### 3. Candidate Field Mode

When 2026 Gazi declarations are available:

- ingest declared runners
- switch from prototype candidate cards to official field cards
- show missing route races and pending results

### 4. Historical Data Expansion

Before heavier modeling:

- Complete 2026 once field and result data are available.
- Add 2019 backward to 2015.
- Re-run backtest after each added season.
- Keep older archive years lower-confidence unless horse-level detail is verified.

See `docs/data-horizon.md`.

### 5. Feature Baseline

After the participation matrix:

- horse performance score
- route performance score
- jockey score
- pedigree prior
- owner/trainer context
- data confidence

Keep these scores separate in the UI. Do not hide everything inside one number.

### 6. Advanced Analysis Candidates

Adopt these only after the current explainable baseline is stable:

- Pace map and tactical style classification.
- Track/weather sensitivity.
- Weight and sex allowance normalization.
- Jockey-trainer synergy.
- Dam-line and sibling performance.
- Monte Carlo simulation, clearly labeled as probabilistic scenario analysis.
- What-if weighting sandbox for analyst users.

Postpone or treat carefully:

- Dosage Index unless we have reliable multi-generation pedigree data and a maintained dosage mapping.
- AI natural-language commentary unless we keep it grounded in generated artifacts and sources.
- Remote API or remote MCP hosting until authentication, rate limits, and free hosting constraints are clear.

## Working Principles

- All code, commits, method names, and comments should stay in English.
- Product content can be Turkish.
- Do not use future information when calculating historical features.
- Treat missing participation as information, not as failure.
- Keep analysis explainable before trying ML.
- Use official TJK data first; use secondary sources only for enrichment or cross-checking.
