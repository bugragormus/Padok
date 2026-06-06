import assert from "node:assert/strict";
import test from "node:test";
import { buildRacePrediction } from "../scripts/build-race-prediction.mjs";

test("buildRacePrediction ranks a single race card with explainable scores", () => {
  const payload = buildRacePrediction({
    contextHistory: {
      byType: {
        jockey: [
          { entityName: "G.KOCAKAYA", score: 82 },
          { entityName: "A.ÇELİK", score: 88 }
        ],
        owner: [
          { entityName: "OWNER A", score: 80 }
        ],
        sire: [
          { entityName: "NATIVE KHAN", score: 84 }
        ],
        dam: [],
        damsire: []
      }
    },
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
          owner: "OWNER A",
          handicapPoint: 100,
          recentForm: "1111"
        },
        {
          programNo: 2,
          horseName: "UPSET",
          sire: "NATIVE KHAN",
          dam: "LATE RUN",
          jockey: "A.ÇELİK",
          owner: "OWNER B",
          handicapPoint: 72,
          recentForm: "2-133"
        },
        {
          programNo: 3,
          horseName: "SCRATCHED",
          sire: "TOROK",
          dam: "OUT",
          jockey: null,
          owner: "OWNER C",
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
  assert.ok(payload.predictions[0].scores.owner > 0);
  assert.ok(payload.predictions[1].scores.pedigree > 0);
  assert.equal(payload.predictions[0].contextSignals.owner.entityName, "OWNER A");
  assert.ok(payload.predictions[0].notes.length > 0);
});
