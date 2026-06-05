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
    signalCalibration: {
      summary: {
        completedSeasonCount: 6
      }
    }
  });

  assert.equal(payload.summary.yearRange, "2020-2025");
  assert.equal(payload.summary.modelTopPickPodiumRate, 67);
  assert.equal(payload.summary.candidateComparisonCount, 4);
  assert.equal(payload.summary.signalCalibrationSeasonCount, 6);
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "readiness-report"));
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "decision-brief"));
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "candidate-comparison"));
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "signal-calibration"));
  assert.ok(payload.endpoints.some((endpoint) => endpoint.id === "model-backtest"));
  assert.deepEqual(payload.mcpBridge.recommendedResources.slice(0, 4), ["manifest", "decision-brief", "candidate-comparison", "signal-calibration"]);
});
