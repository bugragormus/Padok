import assert from "node:assert/strict";
import test from "node:test";
import {
  getReadinessAssessment,
  getReadinessLensBadge,
  getReadinessLensValue,
  sortReadinessProfiles
} from "../scripts/readiness-model.mjs";

const profileSummary = {
  count: 3,
  averageFinish: "1.7"
};

const fullData = {
  sire: "SIRE",
  dam: "DAM",
  owner: "OWNER",
  gaziJockeyName: "JOCKEY",
  bestPrepRaceName: "Sait Akson"
};

test("getReadinessAssessment rewards strong prep form without using Gazi finish", () => {
  const winnerRow = {
    ...fullData,
    horseName: "PREP WINNER",
    gaziFinishPosition: 12,
    hasPrepStart: true,
    prepStartCount: 1,
    bestPrepFinishPosition: 1
  };
  const sameProfileBetterGaziResult = {
    ...winnerRow,
    horseName: "PAST RESULT COPY",
    gaziFinishPosition: 1
  };

  const winner = getReadinessAssessment(winnerRow, profileSummary);
  const copied = getReadinessAssessment(sameProfileBetterGaziResult, profileSummary);

  assert.equal(winner.score, copied.score);
  assert.equal(winner.upside, copied.upside);
  assert.equal(winner.label, "Güçlü aday profili");
});

test("uncertainty lens surfaces incomplete route profiles with a visible index", () => {
  const noPrepRow = {
    horseName: "ROUTE OUTSIDER",
    hasPrepStart: false,
    prepStartCount: 0,
    bestPrepFinishPosition: null,
    sire: "SIRE",
    dam: "DAM",
    owner: "OWNER"
  };
  const readiness = getReadinessAssessment(noPrepRow, { count: 0, averageFinish: "-" });

  assert.ok(getReadinessLensValue(readiness, "uncertainty") > 0);
  assert.match(getReadinessLensBadge(readiness, "uncertainty"), /^Belirsizlik /);
});

test("sortReadinessProfiles supports different decision lenses", () => {
  const profiles = [
    {
      row: { horseName: "SAFE" },
      readiness: { score: 80, confidence: 95, risk: 5, upside: 20 }
    },
    {
      row: { horseName: "UPSIDE" },
      readiness: { score: 70, confidence: 65, risk: 20, upside: 80 }
    },
    {
      row: { horseName: "UNKNOWN" },
      readiness: { score: 45, confidence: 45, risk: 45, upside: 50 }
    }
  ];

  assert.equal(sortReadinessProfiles(profiles, "score")[0].row.horseName, "SAFE");
  assert.equal(sortReadinessProfiles(profiles, "upside")[0].row.horseName, "UPSIDE");
  assert.equal(sortReadinessProfiles(profiles, "lowRisk")[0].row.horseName, "SAFE");
  assert.equal(sortReadinessProfiles(profiles, "uncertainty")[0].row.horseName, "UNKNOWN");
});
