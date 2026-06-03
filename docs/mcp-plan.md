# MCP Server Plan

Padok can become an MCP server in addition to being a web application.

The web application is useful for human scanning and comparison. An MCP server would make the same structured data available to AI clients through discoverable tools and resources.

## Why MCP Fits Padok

Padok already has the three layers an MCP server needs:

```text
TJK ingestion -> normalized SQLite -> analysis exports
```

An MCP layer can sit above SQLite and expose stable capabilities without teaching an AI client how to parse TJK HTML.

## Proposed MCP Capabilities

### Resources

Resources are read-only context that an AI client can inspect.

- `padok://gazi-route/2026`
- `padok://gazi-backtest`
- `padok://gazi-participation/{year}`
- `padok://horses/{horseId}`
- `padok://races/{raceId}`
- `padok://schema`
- `padok://methodology/gazi-scoring`

### Tools

Tools are parameterized operations that an AI model can invoke.

- `get_gazi_route(year)`
- `get_gazi_backtest()`
- `get_gazi_participation_matrix(year)`
- `get_horse_profile(horse_id, as_of_date)`
- `compare_horses(horse_ids, as_of_date)`
- `find_gazi_candidates(year)`
- `explain_horse_score(horse_id, year, as_of_date)`
- `refresh_gazi_route(year)`

Read-only tools should come first. Write or refresh tools require clearer permission and rate-limit rules.

### Prompts

Prompts can provide reusable analysis workflows:

- `analyze_gazi_candidate`
- `compare_prep_race_signals`
- `review_missing_data`

## Implementation Order

1. Stabilize SQLite entities and feature calculations.
2. Add a small internal query module that is shared by exports, API, and MCP.
3. Build a local MCP server using the official TypeScript SDK.
4. Test tools and resources with MCP Inspector.
5. Add a remote transport only when there is a real need for remote AI clients.

The first MCP server should be local and read-only. It can use the same SQLite database produced by the ingestion scripts.

## Hosting Note

GitHub Pages cannot host an MCP server because Pages serves static files only. The live web app can remain on Pages, while a future remote MCP server would need a compute runtime.

That does not block development:

- Web app: GitHub Pages.
- Scheduled data refresh: GitHub Actions.
- Local MCP server: developer machine or desktop AI client.
- Remote MCP server: later, after authentication, rate limits, and hosting needs are clear.

## Security Rules

- Do not expose raw database write access.
- Validate all ids, years, and dates.
- Keep refresh operations separate from read-only analysis tools.
- Do not let clients trigger unbounded TJK fetches.
- Return source and freshness metadata with analysis results.
