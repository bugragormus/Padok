import assert from "node:assert/strict";
import test from "node:test";
import { buildSignalCalibration } from "../scripts/build-gazi-signal-calibration.mjs";

test("buildSignalCalibration summarizes signal separation and miss diagnostics", () => {
  const payload = buildSignalCalibration([
    {
      sourceYear: 2024,
      calibration: {
        state: "completed",
        winnerName: "WINNER",
        winnerScoreRank: 2,
        missReasons: ["winner missed"]
      },
      rankings: {
        score: [
          {
            rank: 1,
            horseName: "LEADER",
            gaziFinishPosition: 4,
            readiness: {
              score: 90,
              confidence: 80,
              upside: 40,
              risk: 5,
              parts: [
                { label: "prep formu", value: 28 },
                { label: "profil kanıtı", value: 20 }
              ]
            }
          },
          {
            rank: 2,
            horseName: "WINNER",
            gaziFinishPosition: 1,
            readiness: {
              score: 82,
              confidence: 75,
              upside: 35,
              risk: 10,
              parts: [
                { label: "prep formu", value: 18 },
                { label: "profil kanıtı", value: 30 }
              ]
            }
          },
          {
            rank: 3,
            horseName: "PODIUM",
            gaziFinishPosition: 2,
            readiness: {
              score: 78,
              confidence: 70,
              upside: 30,
              risk: 12,
              parts: [
                { label: "prep formu", value: 18 },
                { label: "profil kanıtı", value: 28 }
              ]
            }
          }
        ]
      }
    }
  ]);

  assert.equal(payload.summary.completedSeasonCount, 1);
  assert.equal(payload.summary.runnerCount, 3);
  assert.ok(payload.signals.some((signal) => signal.label === "profil kanıtı"));
  assert.ok(payload.metrics.some((metric) => metric.metric === "score"));
  assert.equal(payload.missDiagnostics.length, 1);
  assert.equal(payload.missDiagnostics[0].winnerName, "WINNER");
  assert.equal(payload.missDiagnostics[0].largestGaps[0].label, "prep formu");
});
