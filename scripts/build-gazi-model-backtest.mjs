import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const getArgValues = (args, name) => {
  return args.flatMap((arg, index) => arg === name && args[index + 1] ? [args[index + 1]] : []);
};

const average = (values) => {
  const numericValues = values.filter(Number.isFinite);
  if (!numericValues.length) return null;
  return Math.round((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length) * 10) / 10;
};

const percentage = (count, total) => total > 0 ? Math.round((count / total) * 100) : 0;

const countByReason = (seasons) => {
  const counts = new Map();

  seasons
    .flatMap((season) => season.missReasons)
    .forEach((reason) => counts.set(reason, (counts.get(reason) ?? 0) + 1));

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "tr"));
};

const buildSeasonBacktest = (report) => {
  const calibration = report.calibration;
  if (calibration?.state !== "completed") return null;

  const topScoreEntries = report.rankings?.score?.slice(0, 3) ?? [];
  const topPick = topScoreEntries[0] ?? null;
  const topThreeOverlap = topScoreEntries.filter((entry) => Number.isFinite(entry.gaziFinishPosition) && entry.gaziFinishPosition <= 3).length;
  const winnerInTopThree = Number.isFinite(calibration.winnerScoreRank) && calibration.winnerScoreRank <= 3;

  return {
    year: report.sourceYear,
    runnerCount: report.summary?.runnerCount ?? null,
    topPickName: topPick?.horseName ?? calibration.topScoreHorse ?? null,
    topPickFinish: topPick?.gaziFinishPosition ?? calibration.topScoreFinish ?? null,
    topPickScore: topPick?.lensValue ?? null,
    topPickWon: (topPick?.gaziFinishPosition ?? calibration.topScoreFinish) === 1,
    topPickPodium: Boolean(calibration.topPickHit),
    scoreTopThree: topScoreEntries.map((entry) => ({
      rank: entry.rank,
      horseName: entry.horseName,
      gaziFinishPosition: entry.gaziFinishPosition,
      score: entry.lensValue
    })),
    topThreeOverlap,
    winnerName: calibration.winnerName,
    winnerScore: calibration.winnerScore,
    winnerScoreRank: calibration.winnerScoreRank,
    winnerGap: calibration.winnerGap,
    winnerInTopThree,
    missReasons: calibration.missReasons ?? []
  };
};

export const buildModelBacktest = (readinessReports) => {
  const seasons = readinessReports
    .map(buildSeasonBacktest)
    .filter(Boolean)
    .sort((a, b) => a.year - b.year);
  const topPickPodiumCount = seasons.filter((season) => season.topPickPodium).length;
  const topPickWinCount = seasons.filter((season) => season.topPickWon).length;
  const winnerTopThreeCount = seasons.filter((season) => season.winnerInTopThree).length;

  return {
    generatedAt: new Date().toISOString(),
    methodology: {
      target: "Readiness model backtest",
      warning: "Bu metrikler karar destek doğrulamasıdır; bahis önerisi veya kesin sonuç tahmini değildir.",
      leakageControl: "Her sezonun readiness raporu yalnızca o sezondan önceki karşılaştırma sezonlarından üretilmelidir."
    },
    summary: {
      seasonCount: seasons.length,
      yearRange: seasons.length ? `${seasons[0].year}-${seasons.at(-1).year}` : null,
      topPickPodiumCount,
      topPickPodiumRate: percentage(topPickPodiumCount, seasons.length),
      topPickWinCount,
      topPickWinRate: percentage(topPickWinCount, seasons.length),
      winnerTopThreeCount,
      winnerTopThreeRate: percentage(winnerTopThreeCount, seasons.length),
      averageWinnerScoreRank: average(seasons.map((season) => season.winnerScoreRank)),
      averageWinnerGap: average(seasons.map((season) => season.winnerGap)),
      averageTopThreeOverlap: average(seasons.map((season) => season.topThreeOverlap))
    },
    blindSpots: countByReason(seasons),
    seasons
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const inputPaths = getArgValues(args, "--input");
  const outPath = getArgValue(args, "--out") ?? "data/gazi-model-backtest.json";

  if (!inputPaths.length) {
    console.error("Usage: node scripts/build-gazi-model-backtest.mjs --input <readiness.json> [--input <readiness.json>] [--out data/gazi-model-backtest.json]");
    process.exit(1);
  }

  const reports = await Promise.all(inputPaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
  const payload = buildModelBacktest(reports);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    seasonCount: payload.summary.seasonCount,
    topPickPodiumRate: payload.summary.topPickPodiumRate,
    winnerTopThreeRate: payload.summary.winnerTopThreeRate
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-model-backtest.mjs")) {
  main();
}
