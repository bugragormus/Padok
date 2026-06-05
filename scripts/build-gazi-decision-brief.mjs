import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const topEntry = (readiness, lens) => readiness.rankings?.[lens]?.[0] ?? null;

const formatPick = (entry, lens) => {
  if (!entry) return null;

  return {
    lens,
    rank: entry.rank,
    horseName: entry.horseName,
    gaziFinishPosition: entry.gaziFinishPosition,
    value: entry.lensValue,
    badge: entry.badge,
    reason: entry.reason,
    meta: entry.meta,
    readiness: {
      score: entry.readiness?.score ?? null,
      confidence: entry.readiness?.confidence ?? null,
      upside: entry.readiness?.upside ?? null,
      risk: entry.readiness?.risk ?? null
    },
    actorSummary: entry.actorContext?.summary ?? null
  };
};

const pickDistinct = (readiness) => {
  const used = new Set();
  const pickFromLens = (lens) => {
    const entries = readiness.rankings?.[lens] ?? [];
    const entry = entries.find((candidate) => !used.has(candidate.horseName)) ?? entries[0] ?? null;
    if (entry) used.add(entry.horseName);
    return formatPick(entry, lens);
  };

  return {
    scoreLeader: pickFromLens("score"),
    upsideWatch: pickFromLens("upside"),
    lowRisk: pickFromLens("lowRisk"),
    uncertaintyWatch: pickFromLens("uncertainty")
  };
};

const buildDecisionNotes = ({ readiness, modelBacktest, participation }) => {
  const calibration = readiness.calibration;
  const notes = [
    modelBacktest?.summary?.topPickPodiumRate !== null && modelBacktest?.summary?.topPickPodiumRate !== undefined
      ? `Model top adayı geçmiş backtestte %${modelBacktest.summary.topPickPodiumRate} ilk 3 oranına sahip.`
      : null,
    calibration?.state === "completed" && calibration.winnerGap > 0
      ? `${readiness.sourceYear} kazananı ${calibration.winnerName}, ana skorda ${calibration.winnerScoreRank}. sıradaydı; bu sezon model kör noktası olarak kaydedildi.`
      : null,
    participation?.summary?.analysisState === "awaiting-gazi-field"
      ? "Gazi koşucu listesi henüz tamamlanmadığı için karar notu ön hazırlık seviyesindedir."
      : null,
    readiness.quality?.warnings?.length
      ? `Veri kalite uyarısı: ${readiness.quality.warnings[0]}`
      : null
  ].filter(Boolean);

  return notes;
};

export const buildDecisionBrief = ({ readiness, modelBacktest, participation, manifest }) => {
  const picks = pickDistinct(readiness);
  const scoreLeader = topEntry(readiness, "score");

  return {
    generatedAt: new Date().toISOString(),
    sourceYear: readiness.sourceYear ?? participation?.sourceYear ?? null,
    state: {
      analysisState: readiness.summary?.analysisState ?? participation?.summary?.analysisState ?? "unknown",
      runnerCount: readiness.summary?.runnerCount ?? participation?.summary?.gaziRunnerCount ?? null,
      dataYearRange: manifest?.summary?.yearRange ?? null,
      qualityWarningCount: readiness.quality?.warningCount ?? 0
    },
    headline: scoreLeader
      ? `${scoreLeader.horseName} ana skor lideri; karar desteği ${readiness.sourceYear} readiness ve model backtest ile kalibre edildi.`
      : "Readiness lideri henüz oluşmadı.",
    picks,
    modelPerformance: modelBacktest?.summary ?? null,
    calibration: readiness.calibration ?? null,
    blindSpots: (modelBacktest?.blindSpots ?? []).slice(0, 5),
    decisionNotes: buildDecisionNotes({ readiness, modelBacktest, participation }),
    nextActions: [
      "Geniş veri workflow'u ile yıl aralığı büyütüldüğünde decision brief yeniden üretilmeli.",
      "Sonuç sonrası yüksek sürpriz sezonlar için miss reason dağılımı model ağırlık kalibrasyonunda kullanılmalı.",
      "Canlı Gazi koşucu listesi netleştiğinde readiness ve decision brief tekrar okunmalı."
    ],
    disclaimer: "Karar destek çıktısıdır; kesin sonuç tahmini veya bahis önerisi değildir."
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const readinessPath = getArgValue(args, "--readiness") ?? "data/gazi-readiness-report.json";
  const modelBacktestPath = getArgValue(args, "--model-backtest") ?? "data/gazi-model-backtest.json";
  const participationPath = getArgValue(args, "--participation") ?? "data/gazi-participation-report.json";
  const manifestPath = getArgValue(args, "--manifest") ?? "data/padok-data-manifest.json";
  const outPath = getArgValue(args, "--out") ?? "data/gazi-decision-brief.json";
  const payload = buildDecisionBrief({
    readiness: await readJson(readinessPath),
    modelBacktest: await readJson(modelBacktestPath),
    participation: await readJson(participationPath),
    manifest: await readJson(manifestPath)
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    sourceYear: payload.sourceYear,
    scoreLeader: payload.picks.scoreLeader?.horseName ?? null,
    noteCount: payload.decisionNotes.length
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-decision-brief.mjs")) {
  main();
}
