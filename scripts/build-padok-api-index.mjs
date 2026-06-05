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

export const buildApiIndex = ({ manifest, modelBacktest }) => {
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
      modelWinnerTopThreeRate: modelBacktest?.summary?.winnerTopThreeRate ?? null
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
  const outPath = getArgValue(args, "--out") ?? "data/padok-api-index.json";
  const payload = buildApiIndex({
    manifest: await readOptionalJson(manifestPath),
    modelBacktest: await readOptionalJson(modelBacktestPath)
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    endpointCount: payload.endpoints.length,
    modelBacktestSeasonCount: payload.summary.modelBacktestSeasonCount
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-padok-api-index.mjs")) {
  main();
}
