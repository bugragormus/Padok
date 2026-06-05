import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const normalizeName = (value) => String(value ?? "").trim().toLocaleUpperCase("tr-TR");

const firstByLens = (readiness, lens) => readiness.rankings?.[lens]?.[0] ?? null;

const rankEntryByHorse = (readiness, horseName) => {
  const targetName = normalizeName(horseName);
  const lensRows = Object.entries(readiness.rankings ?? {})
    .map(([lens, entries]) => {
      const entry = entries.find((candidate) => normalizeName(candidate.horseName) === targetName);
      return entry ? { lens, entry } : null;
    })
    .filter(Boolean);

  return {
    scoreEntry: lensRows.find((row) => row.lens === "score")?.entry ?? lensRows[0]?.entry ?? null,
    lensRows
  };
};

const rowByHorse = (participation, horseName) => {
  const targetName = normalizeName(horseName);
  return (participation.rows ?? []).find((row) => normalizeName(row.horseName) === targetName) ?? null;
};

const hasJockeyChange = (row) => {
  const jockeyNames = new Set((row?.prepRaceStates ?? [])
    .filter((race) => race.status === "ran" && race.jockeyName)
    .map((race) => race.jockeyName));

  if (row?.gaziJockeyName) jockeyNames.add(row.gaziJockeyName);
  return jockeyNames.size > 1;
};

const decisionHorseNames = (decisionBrief) => Object.values(decisionBrief?.picks ?? {})
  .map((pick) => pick?.horseName)
  .filter(Boolean);

const comparisonHorseNames = ({ readiness, decisionBrief }) => {
  const names = [];
  const add = (horseName) => {
    if (!horseName) return;
    const normalized = normalizeName(horseName);
    if (names.some((name) => normalizeName(name) === normalized)) return;
    names.push(horseName);
  };

  decisionHorseNames(decisionBrief).forEach(add);
  ["score", "upside", "lowRisk", "uncertainty"].forEach((lens) => add(firstByLens(readiness, lens)?.horseName));
  return names.slice(0, 6);
};

const strengthSignals = ({ entry, row }) => {
  const readiness = entry?.readiness ?? {};
  const profileSummary = entry?.profileSummary ?? {};
  const visibility = row?.routeVisibility ?? {};
  const signals = [];

  if (readiness.score >= 75) signals.push("Yüksek readiness");
  if (readiness.upside >= 60) signals.push("Upside potansiyeli");
  if (readiness.confidence >= 70) signals.push("Veri güveni yüksek");
  if (row?.bestPrepFinishPosition === 1) signals.push("Prep galibiyeti");
  if (entry?.actorContext?.totalScore > 0) signals.push("Aktör geçmişi katkısı");
  if (profileSummary.count >= 3) signals.push("Geçmiş benzerlik");
  if (visibility.ranCount >= 2) signals.push("Geniş rota görünürlüğü");
  if (row?.sire && row?.dam) signals.push("Soy hattı okunabilir");
  if (row?.owner) signals.push("Sahip bilgisi mevcut");

  return signals.slice(0, 5);
};

const cautionSignals = ({ entry, row }) => {
  const readiness = entry?.readiness ?? {};
  const visibility = row?.routeVisibility ?? {};
  const signals = [];

  if (row?.prepStartCount === 0) signals.push("İzlenen rotada start yok");
  if (visibility.ranCount === 1) signals.push("Tek koşu sinyali");
  if (readiness.risk >= 30) signals.push("Risk göstergesi yüksek");
  if (readiness.confidence < 60) signals.push("Veri güveni sınırlı");
  if (!row?.sire || !row?.dam) signals.push("Soy hattı eksik");
  if (!row?.owner) signals.push("Sahip bilgisi eksik");
  if (hasJockeyChange(row)) signals.push("Jokey sürekliliği kırılmış");

  return signals.slice(0, 5);
};

const comparisonVerdict = ({ entry, row, strengths, cautions }) => {
  const readiness = entry?.readiness ?? {};

  if (readiness.score >= 85 && strengths.length > cautions.length) {
    return "Ana aday grubunda güçlü ve dengeli profil.";
  }

  if (readiness.upside >= 60 && cautions.length) {
    return "Potansiyeli var; karar için uyarı sinyalleriyle birlikte okunmalı.";
  }

  if (row?.prepStartCount === 0) {
    return "Klasik rota dışında kaldığı için sürpriz/kapalı profil olarak izlenmeli.";
  }

  if (cautions.length > strengths.length) {
    return "Aday havuzunda duruyor, fakat veri veya süreklilik tarafında soru işareti var.";
  }

  return "Destekleyici sinyalleri olan izleme profili.";
};

const formatCandidate = ({ readiness, participation, horseName }) => {
  const { scoreEntry, lensRows } = rankEntryByHorse(readiness, horseName);
  const row = rowByHorse(participation, horseName);
  if (!scoreEntry) return null;

  const strengths = strengthSignals({ entry: scoreEntry, row });
  const cautions = cautionSignals({ entry: scoreEntry, row });

  return {
    horseName: scoreEntry.horseName,
    gaziFinishPosition: scoreEntry.gaziFinishPosition ?? row?.gaziFinishPosition ?? null,
    readiness: {
      score: scoreEntry.readiness?.score ?? null,
      confidence: scoreEntry.readiness?.confidence ?? null,
      upside: scoreEntry.readiness?.upside ?? null,
      risk: scoreEntry.readiness?.risk ?? null,
      label: scoreEntry.readiness?.label ?? scoreEntry.badge ?? null
    },
    route: {
      label: row?.routeVisibility?.label ?? null,
      score: row?.routeVisibility?.score ?? null,
      prepStartCount: row?.prepStartCount ?? null,
      bestPrepRaceName: row?.bestPrepRaceName ?? null,
      bestPrepFinishPosition: row?.bestPrepFinishPosition ?? null
    },
    actors: {
      jockey: row?.gaziJockeyName ?? null,
      jockeyChanged: hasJockeyChange(row),
      sire: row?.sire ?? null,
      dam: row?.dam ?? null,
      damsire: row?.damsire ?? null,
      owner: row?.owner ?? null,
      actorSummary: scoreEntry.actorContext?.summary ?? null
    },
    rankings: lensRows.map(({ lens, entry }) => ({
      lens,
      rank: entry.rank,
      value: entry.lensValue,
      badge: entry.badge
    })),
    strengths,
    cautions,
    verdict: comparisonVerdict({ entry: scoreEntry, row, strengths, cautions }),
    reason: scoreEntry.reason,
    profileSummary: scoreEntry.profileSummary ?? null,
    historicalMatches: scoreEntry.historicalMatches ?? []
  };
};

const buildSummary = (candidates) => {
  const strongest = [...candidates].sort((a, b) => (b.readiness.score ?? 0) - (a.readiness.score ?? 0))[0] ?? null;
  const upside = [...candidates]
    .filter((candidate) => candidate.horseName !== strongest?.horseName)
    .sort((a, b) => (b.readiness.upside ?? 0) - (a.readiness.upside ?? 0))[0] ?? strongest;
  const riskWatch = [...candidates].sort((a, b) => (b.readiness.risk ?? 0) - (a.readiness.risk ?? 0))[0] ?? null;
  const routeBlindCount = candidates.filter((candidate) => candidate.route.prepStartCount === 0).length;

  return {
    candidateCount: candidates.length,
    strongestHorse: strongest?.horseName ?? null,
    upsideHorse: upside?.horseName ?? null,
    riskWatchHorse: riskWatch?.horseName ?? null,
    routeBlindCount,
    headline: strongest
      ? `${strongest.horseName} karşılaştırmada en dengeli profil; ${upside?.horseName ?? strongest.horseName} upside tarafında ayrıca izlenmeli.`
      : "Karşılaştırma için aday profili bekleniyor."
  };
};

export const buildCandidateComparison = ({ readiness, participation, decisionBrief }) => {
  const candidates = comparisonHorseNames({ readiness, decisionBrief })
    .map((horseName) => formatCandidate({ readiness, participation, horseName }))
    .filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    sourceYear: readiness.sourceYear ?? participation?.sourceYear ?? null,
    summary: buildSummary(candidates),
    candidates,
    methodology: {
      note: "Aday karşılaştırması readiness sıralamaları, katılım matrisi, rota görünürlüğü, jokey, soy hattı ve sahip bilgisini birlikte okur.",
      disclaimer: "Karar destek çıktısıdır; kesin sonuç tahmini veya bahis önerisi değildir."
    }
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const readinessPath = getArgValue(args, "--readiness") ?? "data/gazi-readiness-report.json";
  const participationPath = getArgValue(args, "--participation") ?? "data/gazi-participation-report.json";
  const decisionBriefPath = getArgValue(args, "--decision-brief") ?? "data/gazi-decision-brief.json";
  const outPath = getArgValue(args, "--out") ?? "data/gazi-candidate-comparison.json";
  const payload = buildCandidateComparison({
    readiness: await readJson(readinessPath),
    participation: await readJson(participationPath),
    decisionBrief: await readJson(decisionBriefPath)
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    sourceYear: payload.sourceYear,
    candidateCount: payload.summary.candidateCount,
    strongestHorse: payload.summary.strongestHorse
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-candidate-comparison.mjs")) {
  main();
}
