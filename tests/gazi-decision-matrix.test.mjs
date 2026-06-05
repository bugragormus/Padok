import assert from "node:assert/strict";
import test from "node:test";
import { buildDecisionMatrix } from "../scripts/build-gazi-decision-matrix.mjs";

test("buildDecisionMatrix scores candidate roles with feature and surprise context", () => {
  const payload = buildDecisionMatrix({
    candidateComparison: {
      sourceYear: 2025,
      candidates: [
        {
          horseName: "LEADER",
          readiness: { score: 91, confidence: 82, upside: 58, risk: 8 },
          route: { prepStartCount: 2 },
          actors: { jockeyChanged: false },
          calibratedReadiness: { rank: 1, scoreDelta: 2 },
          strengths: ["Yüksek readiness"],
          cautions: []
        },
        {
          horseName: "UPSET",
          readiness: { score: 66, confidence: 54, upside: 82, risk: 34 },
          route: { prepStartCount: 0 },
          actors: { jockeyChanged: true },
          strengths: ["Upside"],
          cautions: ["İzlenen rotada start yok"]
        }
      ]
    },
    featureBreakdown: {
      sourceYear: 2025,
      profiles: [
        {
          horseName: "LEADER",
          strongestGroup: "horsePerformance",
          weakestGroup: "routeProfile",
          compositeScore: 80,
          groups: {
            horsePerformance: { label: "performans", score: 88 },
            actorContext: { label: "aktör", score: 70 },
            pedigree: { label: "pedigri", score: 62 },
            owner: { label: "sahip", score: 65 },
            dataConfidence: { label: "veri", score: 86 }
          }
        },
        {
          horseName: "UPSET",
          strongestGroup: "pedigree",
          weakestGroup: "routeProfile",
          compositeScore: 68,
          groups: {
            horsePerformance: { label: "performans", score: 55 },
            actorContext: { label: "aktör", score: 72 },
            pedigree: { label: "pedigri", score: 91 },
            owner: { label: "sahip", score: 60 },
            dataConfidence: { label: "veri", score: 50 }
          }
        }
      ]
    },
    signalCalibration: {
      missDiagnostics: [{ reason: "Top-5 dışı profiller ayrıca izlenmeli." }]
    },
    surpriseReview: {
      lessons: ["Kazanan top-5 dışından gelebilir."]
    }
  });

  assert.equal(payload.sourceYear, 2025);
  assert.equal(payload.summary.leaderHorse, "LEADER");
  assert.equal(payload.summary.upsetHorse, "UPSET");
  assert.equal(payload.candidates[0].role, "Ana aday");
  assert.equal(payload.upsetWatch[0].horseName, "UPSET");
  assert.ok(payload.riskWatch.some((candidate) => candidate.horseName === "UPSET"));
  assert.ok(payload.lessons.includes("Kazanan top-5 dışından gelebilir."));
});
