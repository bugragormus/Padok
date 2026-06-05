import assert from "node:assert/strict";
import test from "node:test";
import { buildReadinessReport } from "../scripts/build-gazi-readiness-report.mjs";

const row = (overrides) => ({
  horseName: "HORSE",
  gaziFinishPosition: null,
  gaziJockeyName: "JOCKEY",
  sire: "SIRE",
  dam: "DAM",
  owner: "OWNER",
  hasPrepStart: true,
  prepStartCount: 1,
  bestPrepRaceName: "Sait Akson",
  bestPrepFinishPosition: 2,
  cells: {
    "sait-akson": {
      status: "ran",
      jockeyName: "JOCKEY"
    },
    gazi: {
      status: "ran",
      jockeyName: "JOCKEY"
    }
  },
  ...overrides
});

const report = (sourceYear, rows) => ({
  sourceYear,
  generatedAt: `${sourceYear}-06-30T12:00:00.000Z`,
  summary: {
    analysisState: "field-available"
  },
  columns: [
    { key: "sait-akson", name: "Sait Akson", isTarget: false },
    { key: "gazi", name: "Gazi", isTarget: true }
  ],
  rows
});

test("buildReadinessReport emits lens rankings for a participation report", () => {
  const payload = buildReadinessReport(report(2025, [
    row({ horseName: "PREP WINNER", bestPrepFinishPosition: 1 }),
    row({ horseName: "ROUTE OUTSIDER", hasPrepStart: false, prepStartCount: 0, bestPrepRaceName: null, bestPrepFinishPosition: null })
  ]));

  assert.equal(payload.summary.runnerCount, 2);
  assert.equal(payload.rankings.score.length, 2);
  assert.equal(payload.rankings.upside.length, 2);
  assert.equal(payload.rankings.uncertainty.length, 2);
  assert.equal(payload.rankings.score[0].horseName, "PREP WINNER");
  assert.equal(payload.lensSummaries.score.topHorse, "PREP WINNER");
  assert.deepEqual(payload.lensSummaries.score.topThree, ["PREP WINNER", "ROUTE OUTSIDER"]);
  assert.equal(payload.lensSummaries.score.watchlistCount, 1);
  assert.equal(payload.lensSummaries.uncertainty.topHorse, "ROUTE OUTSIDER");
  assert.equal(payload.quality.runnerCount, 2);
  assert.equal(payload.quality.prepSignalCount, 1);
  assert.equal(payload.quality.warningCount, 2);
  assert.ok(payload.rankings.uncertainty[0].lensValue > 0);
  assert.equal(payload.calibration.state, "awaiting-result");
});

test("buildReadinessReport only uses earlier seasons as profile evidence", () => {
  const current = report(2024, [
    row({ horseName: "CURRENT", bestPrepFinishPosition: 1, gaziJockeyName: "SIGNAL JOCKEY", owner: "SIGNAL OWNER" })
  ]);
  const earlier = report(2023, [
    row({ horseName: "EARLIER TOP", gaziFinishPosition: 2, bestPrepFinishPosition: 1, gaziJockeyName: "SIGNAL JOCKEY", owner: "SIGNAL OWNER" })
  ]);
  const future = report(2025, [
    row({ horseName: "FUTURE TOP", gaziFinishPosition: 1, bestPrepFinishPosition: 1, gaziJockeyName: "SIGNAL JOCKEY", owner: "SIGNAL OWNER" })
  ]);

  const payload = buildReadinessReport(current, {
    comparisonReports: [earlier, future]
  });
  const matches = payload.rankings.score[0].historicalMatches;

  assert.equal(payload.summary.comparisonSeasonCount, 1);
  assert.equal(payload.quality.comparisonSeasonCount, 1);
  assert.deepEqual(matches.map((match) => match.year), [2023]);
  assert.equal(payload.rankings.score[0].actorContext.signals.find((signal) => signal.label === "jokey").starts, 1);
  assert.ok(payload.rankings.score[0].readiness.parts.some((part) => part.label === "aktör geçmişi"));
});

test("buildReadinessReport calibrates completed seasons against the actual Gazi winner", () => {
  const payload = buildReadinessReport(report(2025, [
    row({ horseName: "VISIBLE PREP STAR", gaziFinishPosition: 2, bestPrepFinishPosition: 1, prepStartCount: 2 }),
    row({
      horseName: "LATE WINNER",
      gaziFinishPosition: 1,
      bestPrepFinishPosition: 4,
      prepStartCount: 1,
      cells: {
        "sait-akson": {
          status: "ran",
          jockeyName: "OLD JOCKEY"
        },
        gazi: {
          status: "ran",
          jockeyName: "NEW JOCKEY"
        }
      }
    })
  ]));

  assert.equal(payload.calibration.state, "completed");
  assert.equal(payload.calibration.winnerName, "LATE WINNER");
  assert.equal(payload.calibration.topScoreHorse, "VISIBLE PREP STAR");
  assert.equal(payload.calibration.topScoreFinish, 2);
  assert.equal(payload.calibration.topPickHit, true);
  assert.equal(payload.calibration.winnerScoreRank, 2);
  assert.equal(payload.calibration.winnerGap, 1);
  assert.ok(payload.calibration.missReasons.some((reason) => reason.includes("prep galibi değildi")));
  assert.ok(payload.calibration.missReasons.some((reason) => reason.includes("jokey değişimi")));
});
