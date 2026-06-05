import assert from "node:assert/strict";
import test from "node:test";
import { buildRaceDayWatchlist } from "../scripts/build-gazi-race-day-watchlist.mjs";

test("buildRaceDayWatchlist groups core contenders, upside, risks, and data notes", () => {
  const payload = buildRaceDayWatchlist({
    candidateComparison: {
      sourceYear: 2025,
      summary: {
        calibratedLeaderHorse: "LEADER",
        strongestHorse: "LEADER"
      },
      calibratedRanking: [
        { horseName: "LEADER" },
        { horseName: "UP" }
      ],
      candidates: [
        {
          horseName: "LEADER",
          readiness: { score: 92, upside: 60 },
          calibratedReadiness: { score: 90, rank: 1 },
          route: { bestPrepRaceName: "Mehmet Akif Ersoy", bestPrepFinishPosition: 1 },
          strengths: ["Prep galibiyeti"],
          cautions: []
        },
        {
          horseName: "UP",
          readiness: { score: 70, upside: 75 },
          calibratedReadiness: { score: 72, rank: 2 },
          route: { prepStartCount: 0 },
          strengths: ["Upside"],
          cautions: ["İzlenen rotada start yok"],
          verdict: "Kapalı profil"
        }
      ]
    },
    signalCalibration: {
      weightRecommendations: {
        summary: { decreaseCount: 1 }
      },
      whatIfSimulation: {
        delta: { topPickPodiumRate: 0 }
      }
    },
    participation: {
      sourceYear: 2025,
      summary: {
        analysisState: "field-available",
        runnersWithoutPrepStartCount: 1
      }
    }
  });

  assert.equal(payload.sourceYear, 2025);
  assert.equal(payload.summary.coreCount, 2);
  assert.equal(payload.coreContenders[0].horseName, "LEADER");
  assert.equal(payload.upsideWatch[0].horseName, "UP");
  assert.equal(payload.riskFlags[0].horseName, "UP");
  assert.ok(payload.dataChecklist.some((note) => note.includes("rota dışı")));
});
