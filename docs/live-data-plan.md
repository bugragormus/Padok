# Live Data Plan

Padok should work both locally and on a public URL without paid infrastructure. The first live architecture is intentionally static:

```text
TJK -> GitHub Actions scheduled refresh -> generated JSON -> GitHub Pages static app
```

This is not a real-time server. It is a periodically refreshed static decision-support app. That tradeoff keeps the first production version free and simple.

## Free Hosting Choice

The first deployment target is GitHub Pages.

Why:

- It can serve the current HTML, CSS, JavaScript, images, and JSON without a backend.
- It works well with a repository-based workflow.
- GitHub Actions can rebuild the data on a schedule and deploy the generated static artifact.

The app should not call TJK directly from the browser. Browser-side scraping would be slower, fragile, and more likely to run into CORS or rate issues. Data refresh belongs in the scheduled ingestion layer.

## Live Refresh Model

The scheduled workflow runs these steps:

1. Create a temporary SQLite database.
2. Fetch the race index for the configured Gazi season window.
3. Import named important races.
4. Find Gazi-route races whose dates are complete but whose entries are missing.
5. Fetch daily results for those dates and venues.
6. Import horse-level entries.
7. Export `data/gazi-route-report.json`.
8. Deploy the static site artifact to GitHub Pages.

The workflow is defined in `.github/workflows/pages.yml`.

Default live settings:

- `GAZI_YEAR=2026`
- `GAZI_START_DATE=01.03.2026`
- `GAZI_END_DATE=30.06.2026`

These can be edited in the workflow file when the target season changes.

## Pending vs Completed Races

Race signals have three practical states:

- `planned`: The race is known from calendar/program context, but official result data is not available yet.
- `completed_missing`: The date has passed, but entries have not been imported yet.
- `completed_imported`: Horse-level entries are imported and can contribute to analysis.

The current code handles `completed_missing -> completed_imported` through:

```bash
npm run refresh:gazi-route -- --year 2026 --out data/gazi-route-report.json
```

The next step is to add a program/declaration ingestion layer for `planned` races. That layer should read future race programs and declarations, then mark races as pending until official results are available.

## Current City Mapping

TJK daily result pages require `SehirId`. We keep that mapping in `scripts/tjk-city-map.mjs`.

Known mappings used by the current Gazi route:

- Adana: `1`
- İstanbul: `3`
- Ankara: `5`

The fetcher validates that the returned page venue matches the requested venue. This prevents a wrong city id from silently importing unrelated results.

## What the User Needs to Do for Live Deployment

1. Create a GitHub repository for Padok.
2. Push the local `main` branch to GitHub.
3. In GitHub, open `Settings -> Pages`.
4. Set the Pages source to GitHub Actions.
5. Open the `Actions` tab.
6. Run `Deploy Padok Pages` manually once with `workflow_dispatch`.
7. After the first successful run, use the Pages URL shown by GitHub.

No paid database or server is needed for this first live version.

## Known Limitations

- GitHub Actions schedules are not guaranteed to run at the exact minute.
- Future declarations are not imported yet.
- If TJK changes HTML structure, parser code may need updates.
- The static app updates only after a scheduled or manual workflow run.

