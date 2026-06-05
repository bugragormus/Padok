import assert from "node:assert/strict";
import test from "node:test";
import { buildCandidateComparison } from "../scripts/build-gazi-candidate-comparison.mjs";

test("buildCandidateComparison compares decision picks with route and actor context", () => {
  const payload = buildCandidateComparison({
    decisionBrief: {
      picks: {
        scoreLeader: { horseName: "LEADER" },
        upsideWatch: { horseName: "UP" }
      }
    },
    readiness: {
      sourceYear: 2025,
      rankings: {
        score: [
          {
            rank: 1,
            horseName: "LEADER",
            lensValue: 92,
            badge: "Strong",
            reason: "Prep win",
            gaziFinishPosition: null,
            readiness: {
              score: 92,
              confidence: 82,
              upside: 64,
              risk: 8,
              label: "Strong",
              parts: [
                { label: "prep formu", value: 28 },
                { label: "profil kanıtı", value: 20 }
              ]
            },
            profileSummary: { count: 4, averageFinish: "1.5" },
            historicalMatches: [{ horseName: "OLD", year: 2021, gaziFinishPosition: 1 }],
            actorContext: { totalScore: 2, summary: "jokey: 1/2 ilk 3" }
          },
          {
            rank: 2,
            horseName: "UP",
            lensValue: 80,
            badge: "Upside",
            reason: "Late profile",
            readiness: {
              score: 80,
              confidence: 50,
              upside: 75,
              risk: 35,
              label: "Watch",
              parts: [
                { label: "prep formu", value: 8 },
                { label: "profil kanıtı", value: 30 }
              ]
            },
            profileSummary: { count: 1, averageFinish: "3.0" }
          }
        ],
        upside: [
          {
            rank: 1,
            horseName: "UP",
            lensValue: 75,
            badge: "Upside",
            readiness: { score: 80, confidence: 50, upside: 75, risk: 35 }
          }
        ],
        lowRisk: [],
        uncertainty: []
      }
    },
    participation: {
      rows: [
        {
          horseName: "LEADER",
          prepStartCount: 2,
          bestPrepFinishPosition: 1,
          bestPrepRaceName: "Mehmet Akif Ersoy",
          gaziJockeyName: "JOCKEY A",
          sire: "SIRE",
          dam: "DAM",
          owner: "OWNER",
          routeVisibility: { label: "Geniş rota görünürlüğü", score: 40, ranCount: 2 },
          prepRaceStates: [{ status: "ran", jockeyName: "JOCKEY A" }]
        },
        {
          horseName: "UP",
          prepStartCount: 0,
          gaziJockeyName: "JOCKEY B",
          routeVisibility: { label: "Rota dışı profil", score: 0, ranCount: 0 },
          prepRaceStates: []
        }
      ]
    },
    signalCalibration: {
      weightRecommendations: {
        recommendations: [
          { label: "prep formu", currentMax: 28, suggestedDelta: -2 },
          { label: "profil kanıtı", currentMax: 30, suggestedDelta: 3 }
        ]
      }
    }
  });

  assert.equal(payload.sourceYear, 2025);
  assert.equal(payload.summary.candidateCount, 2);
  assert.equal(payload.summary.strongestHorse, "LEADER");
  assert.equal(payload.candidates[0].horseName, "LEADER");
  assert.ok(payload.candidates[0].strengths.includes("Prep galibiyeti"));
  assert.ok(payload.candidates[0].strengths.includes("Aktör geçmişi katkısı"));
  assert.ok(payload.candidates[1].cautions.includes("İzlenen rotada start yok"));
  assert.ok(payload.candidates[1].verdict.includes("Potansiyeli"));
  assert.ok(payload.candidates[0].calibratedReadiness);
  assert.equal(payload.calibratedRanking.length, 2);
  assert.equal(payload.summary.calibratedLeaderHorse, "LEADER");
});
