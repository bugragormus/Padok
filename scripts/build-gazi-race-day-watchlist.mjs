import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const byHorse = (items = []) => new Map(items.map((item) => [item.horseName, item]));

const uniqueByHorse = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.horseName || seen.has(item.horseName)) return false;
    seen.add(item.horseName);
    return true;
  });
};

const shortCandidate = (candidate, role, reason) => ({
  horseName: candidate.horseName,
  role,
  reason,
  readinessScore: candidate.readiness?.score ?? null,
  calibratedScore: candidate.calibratedReadiness?.score ?? null,
  calibratedRank: candidate.calibratedReadiness?.rank ?? null,
  routeLabel: candidate.route?.label ?? null,
  bestPrep: candidate.route?.bestPrepRaceName
    ? `${candidate.route.bestPrepRaceName} ${candidate.route.bestPrepFinishPosition}.`
    : null,
  strengths: candidate.strengths ?? [],
  cautions: candidate.cautions ?? []
});

const buildCoreContenders = (candidateComparison) => {
  const candidatesByHorse = byHorse(candidateComparison.candidates);
  return (candidateComparison.calibratedRanking ?? [])
    .slice(0, 4)
    .map((entry) => candidatesByHorse.get(entry.horseName))
    .filter(Boolean)
    .map((candidate, index) => shortCandidate(
      candidate,
      index === 0 ? "Ana lider" : "Çekirdek aday",
      index === 0
        ? "Kalibre sıralamada en dengeli aday."
        : "Kalibre sıralamada üst grupta kalıyor."
    ));
};

const buildUpsideWatch = (candidateComparison) => {
  return uniqueByHorse([...(candidateComparison.candidates ?? [])]
    .filter((candidate) => (candidate.readiness?.upside ?? 0) >= 55 || candidate.route?.prepStartCount === 0 || candidate.cautions?.length)
    .sort((a, b) => (b.readiness?.upside ?? 0) - (a.readiness?.upside ?? 0) || (a.calibratedReadiness?.rank ?? 99) - (b.calibratedReadiness?.rank ?? 99)))
    .slice(0, 4)
    .map((candidate) => shortCandidate(
      candidate,
      "Upside / dikkat",
      candidate.cautions?.length
        ? "Potansiyel var ama uyarı sinyalleriyle birlikte okunmalı."
        : "Upside puanı üst grupta."
    ));
};

const buildRiskFlags = (candidateComparison) => {
  return (candidateComparison.candidates ?? [])
    .filter((candidate) => candidate.cautions?.length)
    .slice(0, 5)
    .map((candidate) => ({
      horseName: candidate.horseName,
      flags: candidate.cautions,
      note: candidate.verdict
    }));
};

const buildDataChecklist = ({ participation, signalCalibration }) => {
  const summary = participation.summary ?? {};
  const weightSummary = signalCalibration.weightRecommendations?.summary ?? {};

  return [
    summary.analysisState === "awaiting-gazi-field"
      ? "Gazi koşucu listesi netleşince aday ve kalibre sıralama yeniden üretilmeli."
      : null,
    summary.runnersWithoutPrepStartCount > 0
      ? `${summary.runnersWithoutPrepStartCount} at izlenen prep rotasında görünmedi; rota dışı profiller ayrıca okunmalı.`
      : null,
    weightSummary.decreaseCount > 0
      ? `${weightSummary.decreaseCount} sinyal için azaltma önerisi var; kalibre sıralama bu temkinli okumayı gösterir.`
      : null,
    signalCalibration.whatIfSimulation?.delta
      ? "Ağırlık önerileri gerçek model değişikliği değil; what-if simülasyonu ile birlikte okunmalı."
      : null
  ].filter(Boolean);
};

const buildHeadline = ({ coreContenders, upsideWatch, riskFlags }) => {
  const leader = coreContenders[0]?.horseName;
  if (!leader) return "Takip listesi için aday profili bekleniyor.";

  const alternateUpside = upsideWatch.find((candidate) => candidate.horseName !== leader)?.horseName;
  if (alternateUpside) {
    return `${leader} çekirdek listenin başında; ${alternateUpside} upside tarafında ayrıca izlenmeli.`;
  }

  if (riskFlags.length) {
    return `${leader} çekirdek listenin başında; ${riskFlags.length} aday için risk bayrağı var.`;
  }

  return `${leader} çekirdek listenin başında; aday grubu veri checklist'iyle birlikte okunmalı.`;
};

export const buildRaceDayWatchlist = ({ candidateComparison, signalCalibration, participation }) => {
  const coreContenders = buildCoreContenders(candidateComparison);
  const upsideWatch = buildUpsideWatch(candidateComparison);
  const riskFlags = buildRiskFlags(candidateComparison);

  return {
    generatedAt: new Date().toISOString(),
    sourceYear: candidateComparison.sourceYear ?? participation?.sourceYear ?? null,
    headline: buildHeadline({ coreContenders, upsideWatch, riskFlags }),
    summary: {
      coreCount: coreContenders.length,
      upsideCount: upsideWatch.length,
      riskFlagCount: riskFlags.length,
      calibratedLeaderHorse: candidateComparison.summary?.calibratedLeaderHorse ?? null,
      strongestHorse: candidateComparison.summary?.strongestHorse ?? null
    },
    coreContenders,
    upsideWatch,
    riskFlags,
    dataChecklist: buildDataChecklist({ participation, signalCalibration }),
    methodology: {
      note: "Race day watchlist, aday karşılaştırması ve sinyal kalibrasyonunu son kullanıcı karar akışına uygun gruplara ayırır.",
      disclaimer: "Karar destek çıktısıdır; kesin sonuç tahmini veya bahis önerisi değildir."
    }
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const candidateComparisonPath = getArgValue(args, "--candidate-comparison") ?? "data/gazi-candidate-comparison.json";
  const signalCalibrationPath = getArgValue(args, "--signal-calibration") ?? "data/gazi-signal-calibration.json";
  const participationPath = getArgValue(args, "--participation") ?? "data/gazi-participation-report.json";
  const outPath = getArgValue(args, "--out") ?? "data/gazi-race-day-watchlist.json";
  const payload = buildRaceDayWatchlist({
    candidateComparison: await readJson(candidateComparisonPath),
    signalCalibration: await readJson(signalCalibrationPath),
    participation: await readJson(participationPath)
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    sourceYear: payload.sourceYear,
    coreCount: payload.summary.coreCount,
    riskFlagCount: payload.summary.riskFlagCount
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-race-day-watchlist.mjs")) {
  main();
}
