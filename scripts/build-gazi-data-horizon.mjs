import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { classifyRouteRace } from "./backtest-gazi-route.mjs";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const percentage = (count, total) => {
  return total > 0 ? Math.round((count / total) * 100) : 0;
};

const isRouteReportFile = (fileName) => {
  return /^gazi-route-\d{4}\.json$/.test(fileName);
};

const finishedEntries = (race) => {
  return (race?.entries ?? []).filter((entry) => Number.isFinite(entry.finish_position));
};

const summarizeSeason = (report, sourceFile) => {
  const races = report.routeRaces ?? [];
  const prepRaces = races.filter((race) => classifyRouteRace(race.name).key !== "gazi");
  const gaziRace = races.find((race) => classifyRouteRace(race.name).key === "gazi");
  const completedRaces = races.filter((race) => finishedEntries(race).length > 0);
  const gaziEntries = finishedEntries(gaziRace);
  const prepEntries = prepRaces.flatMap(finishedEntries);
  const expectedCoreRaceCount = 6;
  const coreCoverageRate = percentage(races.length, expectedCoreRaceCount);
  const horseLevelCompletenessRate = percentage(completedRaces.length, races.length);
  const isHighConfidence = races.length >= expectedCoreRaceCount
    && prepRaces.length >= expectedCoreRaceCount - 1
    && gaziEntries.length > 0
    && horseLevelCompletenessRate === 100;

  return {
    year: report.year,
    sourceFile,
    routeRaceCount: races.length,
    prepRaceCount: prepRaces.length,
    completedRaceCount: completedRaces.length,
    coreCoverageRate,
    horseLevelCompletenessRate,
    gaziRunnerCount: gaziEntries.length,
    prepEntryCount: prepEntries.length,
    totalEntryCount: [...prepEntries, ...gaziEntries].length,
    dataConfidence: isHighConfidence ? "high" : "partial",
    raceNames: races.map((race) => race.name)
  };
};

const sortNumeric = (values) => {
  return [...values].sort((a, b) => a - b);
};

export const buildDataHorizonReport = (routeReports) => {
  const seasons = routeReports
    .map(({ report, sourceFile }) => summarizeSeason(report, sourceFile))
    .sort((a, b) => a.year - b.year);
  const years = seasons.map((season) => season.year);
  const highConfidenceYears = seasons
    .filter((season) => season.dataConfidence === "high")
    .map((season) => season.year);
  const currentYearCount = years.length;
  const primaryTargetYears = sortNumeric([2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  const primaryCoveredYears = primaryTargetYears.filter((year) => years.includes(year));
  const expansionTargetYears = sortNumeric([2015, 2016, 2017, 2018, 2019]);
  const expansionCoveredYears = expansionTargetYears.filter((year) => years.includes(year));

  return {
    generatedAt: new Date().toISOString(),
    methodology: {
      target: "Gazi historical data horizon",
      warning: "Daha eski veri daha fazla örneklem sağlar; fakat pist, program, veri kalitesi ve yarış ekosistemi değiştiği için tüm yıllar aynı ağırlıkla kullanılmamalıdır."
    },
    summary: {
      currentYearCount,
      currentYearRange: years.length ? `${years[0]}-${years.at(-1)}` : null,
      highConfidenceYearCount: highConfidenceYears.length,
      highConfidenceYears,
      primaryTargetYearRange: "2020-2026",
      primaryTargetCoverageRate: percentage(primaryCoveredYears.length, primaryTargetYears.length),
      expansionTargetYearRange: "2015-2019",
      expansionTargetCoverageRate: percentage(expansionCoveredYears.length, expansionTargetYears.length),
      totalRouteRaceCount: seasons.reduce((sum, season) => sum + season.routeRaceCount, 0),
      totalHorseStartCount: seasons.reduce((sum, season) => sum + season.totalEntryCount, 0)
    },
    tiers: [
      {
        key: "primary",
        label: "High-confidence modeling window",
        yearRange: "2020-2026",
        purpose: "Modern Gazi route, horse-level entries, UI and first scoring/backtest work.",
        status: primaryCoveredYears.length === primaryTargetYears.length ? "complete" : "in-progress",
        coveredYears: primaryCoveredYears,
        targetYears: primaryTargetYears
      },
      {
        key: "expansion",
        label: "Expansion window",
        yearRange: "2015-2019",
        purpose: "Increase sample size after the current pipeline is stable.",
        status: expansionCoveredYears.length > 0 ? "in-progress" : "planned",
        coveredYears: expansionCoveredYears,
        targetYears: expansionTargetYears
      },
      {
        key: "archive",
        label: "Archive research window",
        yearRange: "1927-2014",
        purpose: "Historical context and lower-confidence enrichment; not equal-weight model training by default.",
        status: "research",
        coveredYears: [],
        targetYears: []
      }
    ],
    seasons
  };
};

const readRouteReports = async (dataDir) => {
  const fileNames = (await readdir(dataDir)).filter(isRouteReportFile).sort();
  return Promise.all(fileNames.map(async (fileName) => ({
    sourceFile: join(dataDir, fileName),
    report: JSON.parse(await readFile(join(dataDir, fileName), "utf8"))
  })));
};

const main = async () => {
  const args = process.argv.slice(2);
  const dataDir = getArgValue(args, "--data-dir") ?? "data";
  const outPath = getArgValue(args, "--out") ?? "data/gazi-data-horizon.json";
  const reports = await readRouteReports(dataDir);
  const payload = buildDataHorizonReport(reports);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    currentYearRange: payload.summary.currentYearRange,
    currentYearCount: payload.summary.currentYearCount,
    highConfidenceYearCount: payload.summary.highConfidenceYearCount
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-data-horizon.mjs")) {
  main();
}
