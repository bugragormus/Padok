# Gazi Route Backtest Method

The first Padok backtest is intentionally simple and explainable. It does not predict a winner. It measures whether named Gazi-route races are connected to the later Gazi top three.

## Question

For each historical prep race:

- How many starters later ran in the Gazi?
- How many of the Gazi top three had participated in that prep race?
- How many of the prep race top three later finished in the Gazi top three?
- Where did the prep race winner finish in the Gazi?

## Inputs

The backtest reads exported route reports:

```bash
npm run backtest:gazi-route -- \
  --input data/gazi-route-2020.json \
  --input data/gazi-route-2021.json \
  --input data/gazi-route-2022.json \
  --input data/gazi-route-2023.json \
  --input data/gazi-route-2024.json \
  --input data/gazi-route-2025.json \
  --out data/gazi-backtest-report.json
```

Each route report must include the Gazi race and horse-level entries for the named prep races.

## Metrics

### Gazi Top Three Coverage

```text
Gazi top three horses that ran in the prep race / total Gazi top three slots
```

This measures whether the prep race contained horses that later became relevant in the target race.

### Prep Top Three Hit Rate

```text
Prep race top three horses that later finished in the Gazi top three / total prep top three slots
```

This is stricter. A horse merely participating in the prep race is not enough; it must also have finished in that prep race's top three.

### Gazi Runner Rate

```text
Prep race starters that later ran in the Gazi / prep race starters
```

This measures how strongly the prep race feeds the Gazi field, regardless of final finish position.

## Interpretation Rules

- The report measures association, not causality.
- A high rate from a small sample is not automatically a stable signal.
- At least five seasons should be collected before using these rates as model weights.
- Horse, jockey, trainer, pedigree, and owner features must be calculated only from information available before each historical Gazi date.
- Future work should compare route-only rankings against richer feature sets using out-of-sample years.

## Participation Caveat

Not every Gazi horse runs in every signal race. Not every signal-race starter later runs in the Gazi.

This matters because a missing prep-race appearance is not automatically bad. A horse may follow a different campaign path, skip a race for timing reasons, or arrive through another form line.

The next product step should make this explicit with a horse-by-race participation matrix:

```text
horse x route race -> ran / did not run / pending / missing
```

That matrix should sit next to the current aggregate backtest so the user can see both:

- the race-level historical signal
- the horse-level route actually taken

## Current Sample

The first committed sample contains the 2020 through 2025 Gazi routes. Six seasons are enough to start comparing route signals, but they are still not enough for a reliable prediction model.
