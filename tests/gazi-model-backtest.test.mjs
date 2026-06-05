import assert from "node:assert/strict";
import test from "node:test";
import { buildModelBacktest } from "../scripts/build-gazi-model-backtest.mjs";

const readinessReport = (sourceYear, calibration, scoreEntries) => ({
  sourceYear,
  summary: {
    runnerCount: 3
  },
  calibration,
  rankings: {
    score: scoreEntries.map((entry, index) => ({
      rank: index + 1,
      ...entry
    }))
  }
});

test("buildModelBacktest summarizes readiness calibration across seasons", () => {
  const payload = buildModelBacktest([
    readinessReport(2024, {
      state: "completed",
      winnerName: "WINNER",
      winnerScore: 91,
      winnerScoreRank: 1,
      winnerGap: 0,
      topPickHit: true,
      missReasons: []
    }, [
      { horseName: "WINNER", gaziFinishPosition: 1, lensValue: 91 },
      { horseName: "PLACE", gaziFinishPosition: 2, lensValue: 82 },
      { horseName: "OTHER", gaziFinishPosition: 7, lensValue: 70 }
    ]),
    readinessReport(2025, {
      state: "completed",
      winnerName: "LATE WINNER",
      winnerScore: 73,
      winnerScoreRank: 4,
      winnerGap: 3,
      topPickHit: true,
      topScoreHorse: "VISIBLE STAR",
      topScoreFinish: 3,
      missReasons: ["Tek koşu sinyali", "Jokey değişimi"]
    }, [
      { horseName: "VISIBLE STAR", gaziFinishPosition: 3, lensValue: 96 },
      { horseName: "PLACE", gaziFinishPosition: 2, lensValue: 90 },
      { horseName: "OTHER", gaziFinishPosition: 8, lensValue: 81 }
    ])
  ]);

  assert.equal(payload.summary.seasonCount, 2);
  assert.equal(payload.summary.topPickPodiumRate, 100);
  assert.equal(payload.summary.topPickWinRate, 50);
  assert.equal(payload.summary.winnerTopThreeRate, 50);
  assert.equal(payload.summary.averageWinnerScoreRank, 2.5);
  assert.equal(payload.summary.averageTopThreeOverlap, 2);
  assert.equal(payload.summary.surpriseCounts.low, 1);
  assert.equal(payload.summary.surpriseCounts.medium, 1);
  assert.equal(payload.seasons[0].surpriseReview.level, "low");
  assert.equal(payload.seasons[1].surpriseReview.label, "Model açısından orta sürpriz");
  assert.deepEqual(payload.blindSpots.map((entry) => entry.reason), ["Jokey değişimi", "Tek koşu sinyali"]);
});
