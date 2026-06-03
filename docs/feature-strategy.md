# Expanded Feature Strategy

Padok should not limit analysis to the horse, race profile, and jockey. Pedigree, trainer, and owner context can add useful information, especially before a young horse has many starts.

These features must remain explainable and must be calculated only from data available before the prediction date.

## Feature Groups

### Horse Performance

- Recent finish positions.
- Distance and surface performance.
- Class progression.
- Handicap point trend.
- Time and margin context.
- Route participation and route absence.

### Jockey and Trainer

- Horse-jockey pairing history.
- Long-distance turf performance.
- Group race experience.
- Trainer performance with three-year-old English thoroughbreds.
- Trainer performance in Gazi-route races.

### Pedigree

Pedigree is especially useful when a horse has a small sample of starts.

- Sire offspring performance on turf.
- Sire offspring performance at `2000m+`.
- Dam offspring performance.
- Damsire offspring performance at stamina distances.
- Sire and dam-line performance in past Gazi-route races.

Pedigree should not be treated as destiny. It is a prior expectation that becomes less important as the horse builds its own performance history.

### Owner

Owner context may capture stable investment, campaign planning, and repeated experience in major races.

- Owner starts and top-three rate in Gazi-route races.
- Owner starts and top-three rate in Group races.
- Owner experience with three-year-old English thoroughbreds.
- Owner-trainer combination history.

Owner score should have a smaller weight than horse performance. A strong owner signal cannot replace weak race evidence.

## Weighting Principles

The first rule-based score should keep feature groups visible:

```text
gazi_fit_score =
  horse_performance
  + race_profile
  + form
  + jockey
  + trainer
  + pedigree
  + owner
```

Weights should not be chosen only by intuition. They should be reviewed through historical backtests.

Recommended safeguards:

- Use only data with `race.date < as_of_date`.
- Require a minimum sample before trusting rates.
- Apply shrinkage toward the population average for small samples.
- Store `data_confidence` next to every score.
- Show feature-group contributions separately in the UI.
- Measure whether a new feature improves out-of-sample ranking.
- Distinguish `did not run` from `missing data`.

## Leakage Risks

Avoid these common mistakes:

- Using the Gazi result itself to calculate a pre-Gazi pedigree or owner score.
- Using future starts when generating historical predictions.
- Giving a high score to an owner or sire based on one successful horse.
- Treating missing data as poor performance.
- Treating skipped prep races as automatically negative.
- Reusing the same years for both weight selection and final evaluation.

## Route Participation Feature

The next feature group should capture which route races a horse actually ran in.

For each Gazi candidate:

- `ran_erkek_tay_deneme`
- `ran_disi_tay_deneme`
- `ran_mehmet_akif_ersoy`
- `ran_sait_akson`
- `ran_kisrak`
- best finish in route races
- best route similarity score
- days since last route race

Important distinction:

```text
did_not_run != bad_performance
```

A horse can skip a route race for strategic reasons and still be a strong Gazi horse. The UI should show absence as context, not as a silent penalty.

## Initial Derived Feature Fields

The database reserves separate fields for:

- `jockey_score`
- `trainer_score`
- `pedigree_score`
- `owner_score`
- `data_confidence`

The next implementation step is to generate these fields from historical race entries and validate them against past Gazi results.

An exploratory context report can be generated with:

```bash
npm run analyze:gazi-context -- --year 2025 --as-of-date 2025-06-29
```

The `as-of-date` boundary is exclusive. A report generated for `2025-06-29` uses prep races before Gazi day and does not use the 2025 Gazi result itself.
