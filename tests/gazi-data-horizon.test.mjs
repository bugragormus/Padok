import assert from "node:assert/strict";
import test from "node:test";
import { buildDataHorizonReport } from "../scripts/build-gazi-data-horizon.mjs";

const entry = (finishPosition, horseName) => ({
  finish_position: finishPosition,
  horse_name: horseName
});

const routeRace = (name, entries = [entry(1, `${name} HORSE`)]) => ({
  name,
  date: "2025-06-01",
  entries
});

const fullSeason = (year) => ({
  year,
  routeRaces: [
    routeRace("ERKEK TAY DENEME"),
    routeRace("DİŞİ TAY DENEME"),
    routeRace("MEHMET AKİF ERSOY"),
    routeRace("SAİT AKSON"),
    routeRace("KISRAK"),
    routeRace("GAZİ", [entry(1, "ALPHA"), entry(2, "BETA"), entry(3, "GAMMA")])
  ]
});

test("buildDataHorizonReport separates current coverage from future data targets", () => {
  const report = buildDataHorizonReport([
    { sourceFile: "data/gazi-route-2020.json", report: fullSeason(2020) },
    { sourceFile: "data/gazi-route-2021.json", report: fullSeason(2021) },
    {
      sourceFile: "data/gazi-route-2026.json",
      report: {
        year: 2026,
        routeRaces: [
          routeRace("SAİT AKSON")
        ]
      }
    }
  ]);

  assert.equal(report.summary.currentYearCount, 3);
  assert.equal(report.summary.currentYearRange, "2020-2026");
  assert.equal(report.summary.highConfidenceYearCount, 2);
  assert.equal(report.summary.primaryTargetCoverageRate, 43);
  assert.equal(report.summary.expansionTargetCoverageRate, 0);

  const primary = report.tiers.find((tier) => tier.key === "primary");
  assert.equal(primary.status, "in-progress");
  assert.deepEqual(primary.coveredYears, [2020, 2021, 2026]);

  const archive = report.tiers.find((tier) => tier.key === "archive");
  assert.equal(archive.status, "research");

  const partialSeason = report.seasons.find((season) => season.year === 2026);
  assert.equal(partialSeason.dataConfidence, "partial");
  assert.equal(partialSeason.gaziRunnerCount, 0);
});
