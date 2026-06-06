import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildDataManifest } from "../scripts/build-data-manifest.mjs";

const writeJson = async (dir, fileName, payload) => {
  await writeFile(join(dir, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

test("buildDataManifest indexes yearly route participation and readiness artifacts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "padok-manifest-"));
  await mkdir(dir, { recursive: true });

  await writeJson(dir, "gazi-route-2024.json", {
    generatedAt: "2024-06-30T12:00:00.000Z",
    routeRaces: [{ name: "GAZI" }]
  });
  await writeJson(dir, "gazi-participation-2024.json", {
    generatedAt: "2024-06-30T12:00:00.000Z",
    summary: { analysisState: "field-available", gaziRunnerCount: 22, routeRaceCount: 6 }
  });
  await writeJson(dir, "gazi-readiness-2024.json", {
    generatedAt: "2024-06-30T12:00:00.000Z",
    summary: { analysisState: "field-available", runnerCount: 22 },
    quality: { warningCount: 0 }
  });

  const manifest = await buildDataManifest(dir);

  assert.equal(manifest.summary.yearRange, "2024-2024");
  assert.equal(manifest.summary.routeReportCount, 1);
  assert.equal(manifest.summary.participationReportCount, 1);
  assert.equal(manifest.summary.readinessReportCount, 1);
  assert.deepEqual(manifest.years, [2024]);
  assert.equal(manifest.reports.readiness[0].summary.warningCount, 0);
  assert.equal(manifest.defaultReports.readiness, "data/gazi-readiness-report.json");
  assert.equal(manifest.defaultReports.decisionBrief, "data/gazi-decision-brief.json");
  assert.equal(manifest.defaultReports.candidateComparison, "data/gazi-candidate-comparison.json");
  assert.equal(manifest.defaultReports.decisionMatrix, "data/gazi-decision-matrix.json");
  assert.equal(manifest.defaultReports.contextHistory, "data/gazi-context-history.json");
  assert.equal(manifest.defaultReports.featureBreakdown, "data/gazi-feature-breakdown.json");
  assert.equal(manifest.defaultReports.raceDayWatchlist, "data/gazi-race-day-watchlist.json");
  assert.equal(manifest.defaultReports.surpriseReview, "data/gazi-surprise-review.json");
  assert.equal(manifest.defaultReports.racePrediction, "data/race-prediction-mehmet-akif-ersoy-2026.json");
  assert.equal(manifest.defaultReports.signalCalibration, "data/gazi-signal-calibration.json");
  assert.equal(manifest.defaultReports.modelBacktest, "data/gazi-model-backtest.json");
  assert.equal(manifest.defaultReports.apiIndex, "data/padok-api-index.json");
});
