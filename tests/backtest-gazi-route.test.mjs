import assert from "node:assert/strict";
import test from "node:test";
import { buildAggregate, buildSeasonResult, classifyRouteRace } from "../scripts/backtest-gazi-route.mjs";

const entry = (finishPosition, horseName) => ({
  finish_position: finishPosition,
  horse_name: horseName
});

test("classifyRouteRace normalizes named route race variants", () => {
  assert.deepEqual(classifyRouteRace("Bİ'TALİH KISRAK"), { key: "kisrak", label: "Kısrak" });
  assert.deepEqual(classifyRouteRace("SAİT AKSON"), { key: "sait-akson", label: "Sait Akson" });
  assert.deepEqual(classifyRouteRace("GAZİ"), { key: "gazi", label: "Gazi" });
});

test("buildSeasonResult measures prep participation against the later Gazi top three", () => {
  const season = buildSeasonResult({
    year: 2025,
    routeRaces: [
      {
        name: "SAİT AKSON",
        date: "2025-06-08",
        entries: [
          entry(1, "ALPHA"),
          entry(2, "BETA"),
          entry(3, "DELTA"),
          entry(4, "GAMMA")
        ]
      },
      {
        name: "GAZİ",
        date: "2025-06-29",
        entries: [
          entry(1, "GAMMA"),
          entry(2, "ALPHA"),
          entry(3, "OMEGA"),
          entry(4, "BETA")
        ]
      }
    ]
  });

  assert.equal(season.routeCoverageCount, 2);
  assert.equal(season.routeCoverageRate, 67);
  assert.deepEqual(season.gaziTopThree.map((horse) => horse.seenInRoute), [true, true, false]);

  const prep = season.prepRaces[0];
  assert.equal(prep.gaziRunnerCount, 3);
  assert.equal(prep.gaziTopThreeCoverageCount, 2);
  assert.equal(prep.gaziTopThreeCoverageRate, 67);
  assert.equal(prep.prepTopThreeHitCount, 1);
  assert.equal(prep.prepTopThreeHitRate, 33);
  assert.equal(prep.winnerGaziFinish, 2);
  assert.equal(prep.bestGaziHorse, "GAMMA");
});

test("buildAggregate combines season-level route signals", () => {
  const seasons = [
    {
      prepRaces: [{
        key: "sait-akson",
        name: "Sait Akson",
        participantCount: 10,
        gaziRunnerCount: 5,
        gaziTopThreeCoverageCount: 2,
        prepTopThreeHitCount: 1,
        winnerGaziFinish: 2
      }]
    },
    {
      prepRaces: [{
        key: "sait-akson",
        name: "Sait Akson",
        participantCount: 8,
        gaziRunnerCount: 4,
        gaziTopThreeCoverageCount: 1,
        prepTopThreeHitCount: 2,
        winnerGaziFinish: 6
      }]
    }
  ];

  const [aggregate] = buildAggregate(seasons);
  assert.equal(aggregate.seasonsObserved, 2);
  assert.equal(aggregate.gaziRunnerRate, 50);
  assert.equal(aggregate.gaziTopThreeCoverageRate, 50);
  assert.equal(aggregate.prepTopThreeHitRate, 50);
  assert.equal(aggregate.winnerGaziTopThreeRate, 50);
  assert.equal(aggregate.averageWinnerGaziFinish, 4);
});
