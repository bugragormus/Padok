import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const reportPatterns = {
  route: /^gazi-route-(\d{4})\.json$/,
  participation: /^gazi-participation-(\d{4})\.json$/,
  readiness: /^gazi-readiness-(\d{4})\.json$/
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const buildEntry = async (dataDir, fileName, year, type) => {
  const report = await readJson(join(dataDir, fileName));

  return {
    year,
    type,
    path: `data/${fileName}`,
    generatedAt: report.generatedAt ?? null,
    sourceGeneratedAt: report.sourceGeneratedAt ?? null,
    summary: {
      analysisState: report.summary?.analysisState ?? null,
      runnerCount: report.summary?.runnerCount ?? report.summary?.gaziRunnerCount ?? null,
      routeRaceCount: report.summary?.routeRaceCount ?? report.routeRaces?.length ?? null,
      warningCount: report.quality?.warningCount ?? null
    }
  };
};

export const buildDataManifest = async (dataDir = "data") => {
  const fileNames = await readdir(dataDir);
  const entriesByType = {
    route: [],
    participation: [],
    readiness: []
  };

  for (const fileName of fileNames) {
    for (const [type, pattern] of Object.entries(reportPatterns)) {
      const match = fileName.match(pattern);
      if (!match) continue;
      entriesByType[type].push(await buildEntry(dataDir, fileName, Number.parseInt(match[1], 10), type));
    }
  }

  for (const entries of Object.values(entriesByType)) {
    entries.sort((a, b) => a.year - b.year);
  }

  const years = [...new Set(Object.values(entriesByType).flatMap((entries) => entries.map((entry) => entry.year)))]
    .sort((a, b) => a - b);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      yearRange: years.length ? `${years[0]}-${years.at(-1)}` : null,
      yearCount: years.length,
      routeReportCount: entriesByType.route.length,
      participationReportCount: entriesByType.participation.length,
      readinessReportCount: entriesByType.readiness.length
    },
    defaultReports: {
      route: "data/gazi-route-report.json",
      participation: "data/gazi-participation-report.json",
      readiness: "data/gazi-readiness-report.json",
      decisionBrief: "data/gazi-decision-brief.json",
      candidateComparison: "data/gazi-candidate-comparison.json",
      contextHistory: "data/gazi-context-history.json",
      featureBreakdown: "data/gazi-feature-breakdown.json",
      signalCalibration: "data/gazi-signal-calibration.json",
      raceDayWatchlist: "data/gazi-race-day-watchlist.json",
      backtest: "data/gazi-backtest-report.json",
      modelBacktest: "data/gazi-model-backtest.json",
      horizon: "data/gazi-data-horizon.json",
      apiIndex: "data/padok-api-index.json"
    },
    years,
    reports: entriesByType
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const dataDir = getArgValue(args, "--data-dir") ?? "data";
  const outPath = getArgValue(args, "--out") ?? "data/padok-data-manifest.json";
  const payload = await buildDataManifest(dataDir);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    yearRange: payload.summary.yearRange,
    routeReportCount: payload.summary.routeReportCount,
    readinessReportCount: payload.summary.readinessReportCount
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-data-manifest.mjs")) {
  main();
}
