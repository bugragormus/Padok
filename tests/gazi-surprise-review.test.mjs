import assert from "node:assert/strict";
import test from "node:test";
import { buildSurpriseReview } from "../scripts/build-gazi-surprise-review.mjs";

test("buildSurpriseReview explains the gap between actual winner and model leader", () => {
  const payload = buildSurpriseReview({
    modelBacktest: {
      seasons: [
        {
          year: 2025,
          winnerName: "CUTHA",
          topPickName: "SPECIAL MAN",
          topPickFinish: 4,
          winnerScoreRank: 9,
          surpriseReview: {
            reasons: ["Winner was outside top five."]
          }
        }
      ]
    },
    readiness: {
      sourceYear: 2025,
      rankings: {
        score: [
          { rank: 1, horseName: "SPECIAL MAN", gaziFinishPosition: 4, readiness: { score: 88 } },
          { rank: 9, horseName: "CUTHA", gaziFinishPosition: 1, readiness: { score: 67 } }
        ]
      }
    },
    featureBreakdown: {
      sourceYear: 2025,
      profiles: [
        {
          horseName: "SPECIAL MAN",
          compositeScore: 84,
          strongestGroup: "horsePerformance",
          weakestGroup: "pedigree",
          groups: {
            horsePerformance: { label: "performans", score: 92 },
            routeProfile: { label: "rota", score: 80 },
            actorContext: { label: "aktör geçmişi", score: 70 },
            pedigree: { label: "pedigri", score: 50 },
            owner: { label: "sahip", score: 60 },
            dataConfidence: { label: "veri güveni", score: 90 }
          }
        },
        {
          horseName: "CUTHA",
          compositeScore: 71,
          strongestGroup: "pedigree",
          weakestGroup: "routeProfile",
          flags: ["Top-5 dışı"],
          groups: {
            horsePerformance: { label: "performans", score: 68 },
            routeProfile: { label: "rota", score: 42 },
            actorContext: { label: "aktör geçmişi", score: 75 },
            pedigree: { label: "pedigri", score: 88 },
            owner: { label: "sahip", score: 66 },
            dataConfidence: { label: "veri güveni", score: 74 }
          }
        }
      ]
    }
  });

  assert.equal(payload.sourceYear, 2025);
  assert.equal(payload.state, "completed");
  assert.equal(payload.actualWinner.horseName, "CUTHA");
  assert.equal(payload.modelLeader.horseName, "SPECIAL MAN");
  assert.equal(payload.actualWinner.readinessRank, 9);
  assert.ok(payload.headline.includes("model lideri SPECIAL MAN"));
  assert.ok(payload.featureDeltas.some((delta) => delta.key === "pedigree" && delta.delta > 0));
  assert.ok(payload.lessons.some((lesson) => lesson.includes("top-5")));
});

test("buildSurpriseReview waits when the Gazi winner is not available yet", () => {
  const payload = buildSurpriseReview({
    modelBacktest: { seasons: [] },
    readiness: {
      sourceYear: 2026,
      rankings: {
        score: [{ rank: 1, horseName: "EARLY LEADER", readiness: { score: 81 } }]
      }
    },
    featureBreakdown: {
      sourceYear: 2026,
      profiles: []
    }
  });

  assert.equal(payload.sourceYear, 2026);
  assert.equal(payload.state, "awaiting-result");
  assert.equal(payload.actualWinner, null);
  assert.equal(payload.modelLeader.horseName, "EARLY LEADER");
});
