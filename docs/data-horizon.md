# Data Horizon Strategy

Padok should use as much historical data as we can responsibly collect, but not all years should have the same modeling weight.

## Current Position

Current committed high-confidence route reports cover:

```text
2020-2025
```

This gives us:

- 6 seasons.
- 36 tracked Gazi route races.
- 559 horse-level starts across tracked route races and Gazi.
- Horse-level entries for the core route races.

This is enough for early explainable backtesting and product design. It is not enough for a confident machine learning model.

## Target Windows

### 1. Primary Modeling Window: 2020-2026

This is the immediate target.

Why:

- The data is recent.
- TJK-derived horse-level detail is available through the current pipeline.
- Racing conditions, race calendar, surfaces, and campaign patterns are closer to today.
- It is the safest window for first scoring and backtest work.

Use:

- UI analysis.
- First feature weights.
- First ranking experiments.
- High-confidence backtest reporting.

### 2. Expansion Window: 2015-2019

This is the next practical expansion target.

Why:

- It can almost double the useful sample.
- The modern route structure is still more comparable than much older eras.
- Data quality is likely more recoverable than deep archive years.

Use:

- Larger backtest sample.
- More stable race-level and horse-level correlations.
- Feature sanity checks.

### 3. Archive Research Window: 1927-2014

Gazi has a long history, but old data should be treated carefully.

Why not equal-weight by default:

- Race conditions and calendars changed.
- Available detail may be incomplete or inconsistent.
- Horse population, training, surfaces, timing, and race tactics changed.
- Older results may only include finishing order, not full context.

Use:

- Historical context.
- Pedigree and owner/trainer long-term enrichment.
- Lower-confidence aggregate references.
- Storytelling and exploratory analysis.

## Modeling Rule

More years are useful only when we preserve data quality labels.

Padok should keep these concepts separate:

- `data_volume`: how many years/races/starts we have.
- `data_confidence`: how complete and comparable the data is.
- `era_weight`: how close the season is to the current racing environment.
- `feature_availability`: which fields exist for that season.

Older data can help, but it should not silently dominate the model just because it adds rows.

## Practical Roadmap

1. Complete 2026 once the Gazi field and results become available.
2. Add 2019, then move backward year by year to 2015.
3. Re-run the route backtest after each added year.
4. Compare whether route signals remain stable as sample size grows.
5. Only then try a baseline ranking model.
6. Treat pre-2015 as archive-grade until field-level detail is proven reliable.
