import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const readOptionalJson = async (path) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
};

const endpoint = ({ id, path, description, freshness, schema }) => ({
  id,
  path,
  description,
  freshness,
  schema
});

export const buildApiIndex = ({ manifest, modelBacktest, candidateComparison, contextHistory, featureBreakdown, signalCalibration, raceDayWatchlist }) => {
  const defaultReports = manifest?.defaultReports ?? {};

  return {
    generatedAt: new Date().toISOString(),
    name: "Padok Static API",
    version: "0.1.0",
    description: "GitHub Pages üzerinden yayınlanan Padok veri ve analiz artifact katalogu.",
    basePath: "./data/",
    summary: {
      yearRange: manifest?.summary?.yearRange ?? null,
      yearCount: manifest?.summary?.yearCount ?? null,
      readinessReportCount: manifest?.summary?.readinessReportCount ?? null,
      modelBacktestSeasonCount: modelBacktest?.summary?.seasonCount ?? null,
      modelTopPickPodiumRate: modelBacktest?.summary?.topPickPodiumRate ?? null,
      modelWinnerTopThreeRate: modelBacktest?.summary?.winnerTopThreeRate ?? null,
      candidateComparisonCount: candidateComparison?.summary?.candidateCount ?? null,
      contextHistoryEntityCount: contextHistory?.summary?.entityCount ?? null,
      featureBreakdownRunnerCount: featureBreakdown?.summary?.runnerCount ?? null,
      signalCalibrationSeasonCount: signalCalibration?.summary?.completedSeasonCount ?? null,
      raceDayCoreCount: raceDayWatchlist?.summary?.coreCount ?? null
    },
    endpoints: [
      endpoint({
        id: "manifest",
        path: "data/padok-data-manifest.json",
        description: "Yayınlanan yıllık artifact dosyalarının keşif kataloğu.",
        freshness: "Her data build/deploy sonrası yenilenir.",
        schema: ["summary", "defaultReports", "years", "reports"]
      }),
      endpoint({
        id: "route-report",
        path: defaultReports.route ?? "data/gazi-route-report.json",
        description: "Varsayılan Gazi rota koşuları, sonuçları ve yarış benzerlik sinyalleri.",
        freshness: "Canlı/scheduled veri yenileme ile güncellenir.",
        schema: ["summary", "routeRaces"]
      }),
      endpoint({
        id: "participation-report",
        path: defaultReports.participation ?? "data/gazi-participation-report.json",
        description: "Gazi koşucularının takip edilen prep rotalarındaki katılım matrisi.",
        freshness: "Route report sonrası yeniden üretilir.",
        schema: ["summary", "columns", "rows"]
      }),
      endpoint({
        id: "readiness-report",
        path: defaultReports.readiness ?? "data/gazi-readiness-report.json",
        description: "At bazlı readiness sıralamaları, lensler, kalibrasyon ve aktör geçmişi sinyalleri.",
        freshness: "Participation report sonrası yeniden üretilir.",
        schema: ["summary", "quality", "calibration", "lensSummaries", "rankings"]
      }),
      endpoint({
        id: "decision-brief",
        path: defaultReports.decisionBrief ?? "data/gazi-decision-brief.json",
        description: "Güncel Gazi karar destek özeti, ayrıştırılmış aday rolleri, model performansı ve aksiyon notları.",
        freshness: "Readiness ve model backtest sonrası yeniden üretilir.",
        schema: ["state", "headline", "picks", "modelPerformance", "calibration", "decisionNotes"]
      }),
      endpoint({
        id: "candidate-comparison",
        path: defaultReports.candidateComparison ?? "data/gazi-candidate-comparison.json",
        description: "Öne çıkan Gazi adaylarının readiness, rota, jokey, soy hattı, sahip, güçlü taraf ve dikkat sinyali karşılaştırması.",
        freshness: "Decision brief ve readiness sonrası yeniden üretilir.",
        schema: ["summary", "candidates", "methodology"]
      }),
      endpoint({
        id: "context-history",
        path: defaultReports.contextHistory ?? "data/gazi-context-history.json",
        description: "Tamamlanmış Gazi sezonlarından jokey, sahip, baba, anne ve anne-baba entity context istatistikleri.",
        freshness: "Yıllık participation raporları sonrası yeniden üretilir.",
        schema: ["summary", "entities", "byType", "methodology"]
      }),
      endpoint({
        id: "feature-breakdown",
        path: defaultReports.featureBreakdown ?? "data/gazi-feature-breakdown.json",
        description: "Gazi adaylarını at performansı, rota, aktör, pedigree, sahip ve veri güveni feature gruplarına ayıran rapor.",
        freshness: "Readiness ve participation report sonrası yeniden üretilir.",
        schema: ["summary", "profiles", "methodology"]
      }),
      endpoint({
        id: "signal-calibration",
        path: defaultReports.signalCalibration ?? "data/gazi-signal-calibration.json",
        description: "Readiness parça puanlarının geçmiş Gazi podyum/kazanan ayrımı ve model kaçırma davranışı üzerindeki kalibrasyon özeti.",
        freshness: "Yıllık readiness raporları ve model backtest sonrası yeniden üretilir.",
        schema: ["summary", "signals", "metrics", "missDiagnostics", "weightRecommendations", "whatIfSimulation", "methodology"]
      }),
      endpoint({
        id: "race-day-watchlist",
        path: defaultReports.raceDayWatchlist ?? "data/gazi-race-day-watchlist.json",
        description: "Kalibre adayları yarış günü takip gruplarına ayıran çekirdek aday, upside, risk bayrağı ve veri checklist raporu.",
        freshness: "Candidate comparison ve signal calibration sonrası yeniden üretilir.",
        schema: ["summary", "headline", "coreContenders", "upsideWatch", "riskFlags", "dataChecklist", "methodology"]
      }),
      endpoint({
        id: "model-backtest",
        path: defaultReports.modelBacktest ?? "data/gazi-model-backtest.json",
        description: "Readiness modelinin tamamlanmış sezonlardaki performansı ve sürpriz sonuç açıklamaları.",
        freshness: "Yıllık readiness raporları sonrası yeniden üretilir.",
        schema: ["summary", "blindSpots", "seasons"]
      }),
      endpoint({
        id: "route-backtest",
        path: defaultReports.backtest ?? "data/gazi-backtest-report.json",
        description: "Prep rota koşularının Gazi ilk 3 kapsama ve isabet metrikleri.",
        freshness: "Route raporları sonrası yeniden üretilir.",
        schema: ["summary", "aggregate", "seasons"]
      }),
      endpoint({
        id: "data-horizon",
        path: defaultReports.horizon ?? "data/gazi-data-horizon.json",
        description: "Mevcut veri kapsamı, hedef yıl aralıkları ve genişletme planı.",
        freshness: "Data manifest sonrası yeniden üretilir.",
        schema: ["summary", "tiers", "seasons"]
      })
    ],
    mcpBridge: {
      recommendedResources: [
        "manifest",
        "decision-brief",
        "candidate-comparison",
        "context-history",
        "feature-breakdown",
        "signal-calibration",
        "race-day-watchlist",
        "readiness-report",
        "model-backtest",
        "participation-report"
      ],
      note: "MCP server ilk aşamada bu statik artifactleri resource olarak sunabilir; daha sonra canlı refresh komutları tool olarak eklenebilir."
    }
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const manifestPath = getArgValue(args, "--manifest") ?? "data/padok-data-manifest.json";
  const modelBacktestPath = getArgValue(args, "--model-backtest") ?? "data/gazi-model-backtest.json";
  const candidateComparisonPath = getArgValue(args, "--candidate-comparison") ?? "data/gazi-candidate-comparison.json";
  const contextHistoryPath = getArgValue(args, "--context-history") ?? "data/gazi-context-history.json";
  const featureBreakdownPath = getArgValue(args, "--feature-breakdown") ?? "data/gazi-feature-breakdown.json";
  const signalCalibrationPath = getArgValue(args, "--signal-calibration") ?? "data/gazi-signal-calibration.json";
  const raceDayWatchlistPath = getArgValue(args, "--race-day-watchlist") ?? "data/gazi-race-day-watchlist.json";
  const outPath = getArgValue(args, "--out") ?? "data/padok-api-index.json";
  const payload = buildApiIndex({
    manifest: await readOptionalJson(manifestPath),
    modelBacktest: await readOptionalJson(modelBacktestPath),
    candidateComparison: await readOptionalJson(candidateComparisonPath),
    contextHistory: await readOptionalJson(contextHistoryPath),
    featureBreakdown: await readOptionalJson(featureBreakdownPath),
    signalCalibration: await readOptionalJson(signalCalibrationPath),
    raceDayWatchlist: await readOptionalJson(raceDayWatchlistPath)
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    endpointCount: payload.endpoints.length,
    modelBacktestSeasonCount: payload.summary.modelBacktestSeasonCount,
    candidateComparisonCount: payload.summary.candidateComparisonCount,
    contextHistoryEntityCount: payload.summary.contextHistoryEntityCount,
    featureBreakdownRunnerCount: payload.summary.featureBreakdownRunnerCount,
    signalCalibrationSeasonCount: payload.summary.signalCalibrationSeasonCount,
    raceDayCoreCount: payload.summary.raceDayCoreCount
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-padok-api-index.mjs")) {
  main();
}
