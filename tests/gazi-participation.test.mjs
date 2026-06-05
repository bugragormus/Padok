import assert from "node:assert/strict";
import test from "node:test";
import { buildParticipationReport } from "../scripts/build-gazi-participation.mjs";

const entry = (finishPosition, horseName, jockeyName = "JOCKEY") => ({
  finish_position: finishPosition,
  horse_name: horseName,
  jockey_name: jockeyName,
  sire: `${horseName} SIRE`,
  dam: `${horseName} DAM`,
  damsire: `${horseName} DAMSIRE`,
  owner: `${horseName} OWNER`,
  finish_time: "2.30.00"
});

test("buildParticipationReport marks Gazi runners that skipped tracked prep races", () => {
  const report = buildParticipationReport({
    year: 2025,
    generatedAt: "2025-06-30T12:00:00.000Z",
    routeRaces: [
      {
        name: "MEHMET AKİF ERSOY",
        date: "2025-06-07",
        entries: [
          entry(1, "ALPHA"),
          entry(2, "GAMMA")
        ]
      },
      {
        name: "SAİT AKSON",
        date: "2025-06-08",
        entries: [
          entry(1, "BETA"),
          entry(2, "ALPHA")
        ]
      },
      {
        name: "GAZİ",
        date: "2025-06-29",
        entries: [
          entry(1, "ALPHA", "GAZI JOCKEY A"),
          entry(2, "BETA", "GAZI JOCKEY B"),
          entry(3, "OMEGA", "GAZI JOCKEY O")
        ]
      }
    ]
  });

  assert.equal(report.summary.gaziRunnerCount, 3);
  assert.equal(report.summary.prepRaceCount, 2);
  assert.equal(report.summary.runnersWithPrepStartCount, 2);
  assert.equal(report.summary.runnersWithoutPrepStartCount, 1);
  assert.equal(report.summary.topThreeWithoutPrepStartCount, 1);

  const alpha = report.rows.find((row) => row.horseName === "ALPHA");
  assert.equal(alpha.prepStartCount, 2);
  assert.equal(alpha.bestPrepRaceName, "Mehmet Akif Ersoy");
  assert.equal(alpha.cells["mehmet-akif-ersoy"].status, "ran");
  assert.equal(alpha.cells["sait-akson"].finishPosition, 2);
  assert.deepEqual(alpha.prepRaceStates.map((race) => [race.raceKey, race.status, race.finishPosition]), [
    ["mehmet-akif-ersoy", "ran", 1],
    ["sait-akson", "ran", 2]
  ]);

  const omega = report.rows.find((row) => row.horseName === "OMEGA");
  assert.equal(omega.hasPrepStart, false);
  assert.equal(omega.prepStartCount, 0);
  assert.equal(omega.skippedPrepCount, 2);
  assert.equal(omega.cells["mehmet-akif-ersoy"].status, "not-run");
  assert.equal(omega.cells["sait-akson"].status, "not-run");
  assert.equal(omega.cells.gazi.status, "ran");
  assert.deepEqual(omega.prepRaceStates.map((race) => [race.raceKey, race.status]), [
    ["mehmet-akif-ersoy", "not-run"],
    ["sait-akson", "not-run"]
  ]);
});

test("buildParticipationReport handles seasons before the Gazi field is known", () => {
  const report = buildParticipationReport({
    year: 2026,
    routeRaces: [
      {
        name: "SAİT AKSON",
        date: "2026-06-07",
        entries: [
          entry(1, "FUTURE SIGNAL")
        ]
      }
    ]
  });

  assert.equal(report.summary.analysisState, "awaiting-gazi-field");
  assert.equal(report.summary.gaziRunnerCount, 0);
  assert.equal(report.columns.length, 1);
  assert.deepEqual(report.rows, []);
});
