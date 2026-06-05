import assert from "node:assert/strict";
import test from "node:test";
import { buildApiIndex } from "../scripts/build-padok-api-index.mjs";

test("buildApiIndex exposes static API endpoints for app and MCP consumers", () => {
  const payload = buildApiIndex({
    manifest: {
      summary: {
        yearRange: "2020-2025",
        yearCount: 6,
        readinessReportCount: 6
      },
      defaultReports: {
        readiness: "data/gazi-readiness-report.json",
        decisionBrief: "data/gazi-decision-brief.json",
        candidateComparison: "data/gazi-candidate-comparison.json",
        contextHistory: "data/gazi-context-history.json",
        featureBreakdown: "data/gazi-feature-breakdown.json",
        raceDayWatchlist: "data/gazi-race-day-watchlist.json",
        surpriseReview: "data/gazi-surprise-review.json",
        signalCalibration: "data/gazi-signal-calibration.json",
        modelBacktest: "data/gazi-model-backtest.json"
      }
    },
    modelBacktest: {
      summary: {
        seasonCount: 6,
        topPickPodiumRate: 67,
        winnerTopThreeRate: 50
      }
    },
    candidateComparison: {
      summary: {
        candidateCount: 4
      }
    },
    contextHistory: {
      summary: {
        entityCount: 50
      }
    },
    featureBreakdown: {
      summary: {
        runnerCount: 22
      }
    },
    signalCalibration: {
      summary: {
        completedSeasonCount: 6
      }
    },
    raceDayWatchlist: {
      summary: {
        coreCount: 4
      }
    },
    surpriseReview: {
      state: "completed"
    }
  });

  assert.equal(payload.summary.yearRange, "2020-2025");
  assert.equal(payload.summary.modelTopPickPodiumRate, 67);
  assert.equal(payload.summary.candidateComparisonCount, 4);
  assert.equal(payload.summary.contextHistoryEntityCount, 50);
  assert.equal(payload.summary.featureBreakdownRunnerCount, 22);
  assert.equal(payload.summary.signalCalibrationSeasonCount, 6);
  assert.equal(payload.summary.raceDayCoreCount, 4);
  assert.equal(payload.summary.surpriseReviewState, "completed");
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "readiness-report"));
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "decision-brief"));
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "candidate-comparison"));
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "context-history"));
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "feature-breakdown"));
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "signal-calibration"));
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "race-day-watchlist"));
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "surprise-review"));
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "model-backtest"));
  assert.deepEqual(payload.mcpBridge.recommendedResources.slice(0, 8), ["manifest", "decision-brief", "candidate-comparison", "context-history", "feature-breakdown", "signal-calibration", "race-day-watchlist", "surprise-review"]);
});
