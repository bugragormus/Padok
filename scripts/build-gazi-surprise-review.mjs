import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const normalizeName = (value) => String(value ?? "").trim().toLocaleUpperCase("tr-TR");

const findByHorse = (items = [], horseName) => {
  const targetName = normalizeName(horseName);
  return items.find((item) => normalizeName(item.horseName) === targetName) ?? null;
};

const findReadinessEntry = (readiness, horseName) => {
  return findByHorse(readiness.rankings?.score ?? [], horseName);
};

const profileGroups = (featureProfile) => featureProfile?.groups ?? {};

const groupDelta = (winnerProfile, leaderProfile) => {
  const keys = ["horsePerformance", "routeProfile", "actorContext", "pedigree", "owner", "dataConfidence"];
  return keys.map((key) => {
    const winnerGroup = profileGroups(winnerProfile)[key] ?? {};
    const leaderGroup = profileGroups(leaderProfile)[key] ?? {};
    return {
      key,
      label: winnerGroup.label ?? leaderGroup.label ?? key,
      winnerScore: winnerGroup.score ?? null,
      leaderScore: leaderGroup.score ?? null,
      delta: Number.isFinite(winnerGroup.score) && Number.isFinite(leaderGroup.score)
        ? winnerGroup.score - leaderGroup.score
        : null,
      winnerNote: winnerGroup.note ?? null,
      leaderNote: leaderGroup.note ?? null
    };
  });
};

const buildLessons = ({ winnerProfile, leaderProfile, season }) => {
  const deltas = groupDelta(winnerProfile, leaderProfile);
  const winnerWeakest = profileGroups(winnerProfile)[winnerProfile?.weakestGroup]?.label ?? null;
  const winnerStrongest = profileGroups(winnerProfile)[winnerProfile?.strongestGroup]?.label ?? null;
  const positiveDeltas = deltas.filter((delta) => Number.isFinite(delta.delta) && delta.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  const negativeDeltas = deltas.filter((delta) => Number.isFinite(delta.delta) && delta.delta < 0)
    .sort((a, b) => a.delta - b.delta);

  return [
    season?.winnerScoreRank && season.winnerScoreRank > 5
      ? `Kazanan ana skor sıralamasında ${season.winnerScoreRank}. olduğu için top-5 dışı profiller için ayrı sürpriz taraması gerekir.`
      : null,
    winnerWeakest
      ? `Kazananın en zayıf görünen grubu "${winnerWeakest}"; düşük görünen grup otomatik eleme nedeni olmamalı.`
      : null,
    winnerStrongest
      ? `Kazananın en güçlü grubu "${winnerStrongest}"; sürpriz açıklamasında bu sinyal geriye dönük kontrol edilmeli.`
      : null,
    positiveDeltas[0]
      ? `Kazanan model liderinden "${positiveDeltas[0].label}" tarafında ${positiveDeltas[0].delta} puan önde.`
      : null,
    negativeDeltas[0]
      ? `Model lideri "${negativeDeltas[0].label}" tarafında kazanana göre ${Math.abs(negativeDeltas[0].delta)} puan avantajlıydı.`
      : null
  ].filter(Boolean);
};

const buildNarrative = ({ winnerName, leaderName, season, winnerProfile }) => {
  if (!season?.winnerName) {
    return "Gazi sonucu bekleniyor; sürpriz incelemesi yarış tamamlandıktan sonra üretilecek.";
  }

  if (winnerName === leaderName) {
    return `${winnerName} model lideriydi ve Gazi'yi kazandı; bu sezon sürpriz değil, model teyidi olarak okunur.`;
  }

  return `${winnerName} Gazi'yi kazandı ama model lideri ${leaderName} idi. Kazanan ${season.winnerScoreRank ?? "-"} numaralı readiness profilinden geldi; ${winnerProfile?.weakestGroup ? "en zayıf görünen feature grubu yarış öncesi riski büyüttü." : "feature dağılımı ayrıca okunmalı."}`;
};

export const buildSurpriseReview = ({ modelBacktest, readiness, featureBreakdown }) => {
  const sourceYear = readiness.sourceYear ?? featureBreakdown.sourceYear ?? null;
  const season = (modelBacktest.seasons ?? []).find((item) => item.year === sourceYear) ?? null;
  const winnerName = season?.winnerName
    ?? (readiness.rankings?.score ?? []).find((entry) => entry.gaziFinishPosition === 1)?.horseName
    ?? null;
  const leaderName = season?.topPickName ?? readiness.rankings?.score?.[0]?.horseName ?? null;
  const winnerReadiness = findReadinessEntry(readiness, winnerName);
  const leaderReadiness = findReadinessEntry(readiness, leaderName);
  const winnerProfile = findByHorse(featureBreakdown.profiles, winnerName);
  const leaderProfile = findByHorse(featureBreakdown.profiles, leaderName);

  return {
    generatedAt: new Date().toISOString(),
    sourceYear,
    state: winnerName ? "completed" : "awaiting-result",
    headline: winnerName && leaderName
      ? buildNarrative({ winnerName, leaderName, season, winnerProfile })
      : "Sürpriz incelemesi için Gazi sonucu bekleniyor.",
    actualWinner: winnerName
      ? {
        horseName: winnerName,
        readinessRank: winnerReadiness?.rank ?? season?.winnerScoreRank ?? null,
        readinessScore: winnerReadiness?.readiness?.score ?? season?.winnerScore ?? null,
        compositeScore: winnerProfile?.compositeScore ?? null,
        strongestGroup: winnerProfile?.strongestGroup ?? null,
        weakestGroup: winnerProfile?.weakestGroup ?? null,
        flags: winnerProfile?.flags ?? []
      }
      : null,
    modelLeader: leaderName
      ? {
        horseName: leaderName,
        finishPosition: leaderReadiness?.gaziFinishPosition ?? season?.topPickFinish ?? null,
        readinessRank: leaderReadiness?.rank ?? 1,
        readinessScore: leaderReadiness?.readiness?.score ?? season?.topPickScore ?? null,
        compositeScore: leaderProfile?.compositeScore ?? null,
        strongestGroup: leaderProfile?.strongestGroup ?? null,
        weakestGroup: leaderProfile?.weakestGroup ?? null
      }
      : null,
    featureDeltas: winnerProfile && leaderProfile ? groupDelta(winnerProfile, leaderProfile) : [],
    missReasons: season?.missReasons ?? season?.surpriseReview?.reasons ?? [],
    lessons: buildLessons({ winnerProfile, leaderProfile, season }),
    methodology: {
      note: "Surprise review, tamamlanmış Gazi sezonunda gerçek kazananı model lideriyle karşılaştırır ve kaçırılan sinyalleri açıklar.",
      disclaimer: "Bu rapor yarış sonrası açıklama amaçlıdır; gelecek yarışları kesin bilme iddiası taşımaz."
    }
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const modelBacktestPath = getArgValue(args, "--model-backtest") ?? "data/gazi-model-backtest.json";
  const readinessPath = getArgValue(args, "--readiness") ?? "data/gazi-readiness-report.json";
  const featureBreakdownPath = getArgValue(args, "--feature-breakdown") ?? "data/gazi-feature-breakdown.json";
  const outPath = getArgValue(args, "--out") ?? "data/gazi-surprise-review.json";
  const payload = buildSurpriseReview({
    modelBacktest: await readJson(modelBacktestPath),
    readiness: await readJson(readinessPath),
    featureBreakdown: await readJson(featureBreakdownPath)
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    sourceYear: payload.sourceYear,
    state: payload.state,
    actualWinner: payload.actualWinner?.horseName ?? null,
    modelLeader: payload.modelLeader?.horseName ?? null
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-surprise-review.mjs")) {
  main();
}
