import assert from "node:assert/strict";
import test from "node:test";
import { buildRacePrediction } from "../scripts/build-race-prediction.mjs";

test("buildRacePrediction ranks a single race card with explainable scores", () => {
  const payload = buildRacePrediction({
    raceCard: {
      source: { name: "fixture" },
      race: {
        name: "Test Koşusu",
        date: "2026-06-06",
        venue: "Ankara",
        distance: 2200,
        surface: "Çim"
      },
      entries: [
        {
          programNo: 1,
          horseName: "FORM LEADER",
          sire: "TOROK",
          dam: "STAMINA",
          jockey: "G.KOCAKAYA",
          handicapPoint: 100,
          recentForm: "1111"
        },
        {
          programNo: 2,
          horseName: "UPSET",
          sire: "NATIVE KHAN",
          dam: "LATE RUN",
          jockey: "A.ÇELİK",
          handicapPoint: 72,
          recentForm: "2-133"
        },
        {
          programNo: 3,
          horseName: "SCRATCHED",
          sire: "TOROK",
          dam: "OUT",
          jockey: null,
          handicapPoint: 90,
          recentForm: "111",
          scratch: true
        }
      ]
    }
  });

  assert.equal(payload.summary.runnerCount, 2);
  assert.equal(payload.summary.scratchCount, 1);
  assert.equal(payload.summary.leaderHorse, "FORM LEADER");
  assert.equal(payload.predictions[0].role, "Birincilik adayı");
  assert.ok(payload.predictions.some((entry) => entry.horseName === "SCRATCHED" && entry.role === "Koşmaz"));
  assert.ok(payload.predictions[0].notes.length > 0);
});
