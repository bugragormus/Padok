import assert from "node:assert/strict";
import test from "node:test";
import { buildDecisionBrief } from "../scripts/build-gazi-decision-brief.mjs";

test("buildDecisionBrief combines picks, model performance, and decision notes", () => {
  const payload = buildDecisionBrief({
    readiness: {
      sourceYear: 2025,
      summary: {
        analysisState: "complete-results",
        runnerCount: 2
      },
      quality: {
        warningCount: 1,
        warnings: ["sample warning"]
      },
      calibration: {
        state: "completed",
        winnerName: "WINNER",
        winnerGap: 2,
        winnerScoreRank: 3
      },
      rankings: {
        score: [
          {
            rank: 1,
            horseName: "LEADER",
            gaziFinishPosition: 2,
            lensValue: 91,
            badge: "Strong",
            reason: "Reason",
            meta: "Meta",
            readiness: { score: 91, confidence: 80, upside: 60, risk: 10 },
            actorContext: { summary: "jokey: 1/2 ilk 3" }
          }
        ],
        upside: [
          {
            rank: 1,
            horseName: "UP",
            lensValue: 77,
            badge: "Upside",
            reason: "Upside reason",
            meta: "Meta",
            readiness: { score: 70, confidence: 60, upside: 77, risk: 25 }
          }
        ],
        lowRisk: [],
        uncertainty: []
      }
    },
    modelBacktest: {
      summary: {
        topPickPodiumRate: 67
      },
      blindSpots: [{ reason: "Blind spot", count: 2 }]
    },
    participation: {
      summary: {
        analysisState: "complete-results"
      }
    },
    manifest: {
      summary: {
        yearRange: "2020-2025"
      }
    }
  });

  assert.equal(payload.sourceYear, 2025);
  assert.equal(payload.picks.scoreLeader.horseName, "LEADER");
  assert.equal(payload.picks.upsideWatch.horseName, "UP");
  assert.equal(payload.modelPerformance.topPickPodiumRate, 67);
  assert.ok(payload.decisionNotes.some((note) => note.includes("%67")));
  assert.ok(payload.decisionNotes.some((note) => note.includes("sample warning")));
});
