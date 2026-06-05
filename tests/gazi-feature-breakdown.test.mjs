import assert from "node:assert/strict";
import test from "node:test";
import { buildFeatureBreakdown } from "../scripts/build-gazi-feature-breakdown.mjs";

test("buildFeatureBreakdown separates horse, route, actor, pedigree, owner, and data confidence groups", () => {
  const payload = buildFeatureBreakdown({
    readiness: {
      sourceYear: 2025,
      rankings: {
        score: [
          {
            horseName: "LEADER",
            gaziFinishPosition: 2,
            readiness: {
              score: 88,
              confidence: 76,
              confidenceLabel: "Yüksek güven",
              parts: [
                { label: "prep formu", value: 28 },
                { label: "profil kanıtı", value: 20 },
                { label: "rota şekli", value: 18 },
                { label: "jokey sürekliliği", value: 13 },
                { label: "aktör geçmişi", value: 6 }
              ]
            },
            actorContext: {
              signals: [
                { label: "baba hattı", score: 6 }
              ]
            }
          }
        ]
      }
    },
    participation: {
      sourceYear: 2025,
      rows: [
        {
          horseName: "LEADER",
          gaziFinishPosition: 2,
          sire: "SIRE",
          dam: "DAM",
          damsire: "DAMSIRE",
          owner: "OWNER",
          hasPrepStart: true,
          prepStartCount: 2,
          bestPrepRaceName: "Mehmet Akif Ersoy",
          bestPrepFinishPosition: 1,
          routeVisibility: {
            score: 80,
            reason: "Geniş rota görünürlüğü."
          },
          prepRaceStates: [
            { status: "ran", jockeyName: "A" },
            { status: "ran", jockeyName: "A" }
          ]
        }
      ]
    },
    contextHistory: {
      byType: {
        jockey: [{ entityName: "JOCKEY", score: 70, starts: 3, topThree: 2 }],
        owner: [{ entityName: "OWNER", score: 66 }],
        sire: [{ entityName: "SIRE", score: 80 }],
        dam: [{ entityName: "DAM", score: 50 }],
        damsire: [{ entityName: "DAMSIRE", score: 40 }]
      }
    }
  });

  assert.equal(payload.sourceYear, 2025);
  assert.equal(payload.summary.runnerCount, 1);
  assert.equal(payload.summary.leaderHorse, "LEADER");
  assert.ok(payload.profiles[0].compositeScore > 0);
  assert.equal(payload.profiles[0].groups.horsePerformance.label, "At performansı");
  assert.equal(payload.profiles[0].groups.routeProfile.score, 80);
  assert.ok(payload.profiles[0].groups.pedigree.score > 60);
  assert.equal(payload.profiles[0].groups.owner.score, 66);
  assert.equal(payload.profiles[0].groups.dataConfidence.score, 76);
});
