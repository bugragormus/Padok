import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const normalizeName = (value) => String(value ?? "").trim().toLocaleUpperCase("tr-TR");

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const partsByLabel = (readiness = {}) => {
  return Object.fromEntries((readiness.parts ?? []).map((part) => [part.label, part.value]));
};

const rowByHorse = (participation, horseName) => {
  const targetName = normalizeName(horseName);
  return (participation.rows ?? []).find((row) => normalizeName(row.horseName) === targetName) ?? null;
};

const scoreEntryByHorse = (readiness, horseName) => {
  const targetName = normalizeName(horseName);
  return (readiness.rankings?.score ?? []).find((entry) => normalizeName(entry.horseName) === targetName) ?? null;
};

const actorContextScore = (entry, label) => {
  const signal = (entry?.actorContext?.signals ?? []).find((item) => item.label === label);
  if (!signal) return 0;
  return clamp(Math.round(((signal.score ?? 0) / 12) * 100));
};

const hasJockeyChange = (row) => {
  const jockeyNames = new Set((row?.prepRaceStates ?? [])
    .filter((race) => race.status === "ran" && race.jockeyName)
    .map((race) => race.jockeyName));

  if (row?.gaziJockeyName) jockeyNames.add(row.gaziJockeyName);
  return jockeyNames.size > 1;
};

const pedigreeScore = (row, entry) => {
  const availability = [row?.sire, row?.dam, row?.damsire].filter(Boolean).length;
  const availabilityScore = Math.round((availability / 3) * 62);
  const sireSignal = actorContextScore(entry, "baba hattı");
  return clamp(availabilityScore + Math.round(sireSignal * 0.38));
};

const ownerScore = (row) => {
  if (!row?.owner) return 0;
  return 42;
};

const groupScores = ({ row, entry }) => {
  const readiness = entry?.readiness ?? {};
  const parts = partsByLabel(readiness);
  const routeScore = row?.routeVisibility?.score ?? (row?.prepStartCount ? 45 : 18);
  const actorScore = clamp(Math.round(((parts["aktör geçmişi"] ?? 0) / 12) * 100));
  const continuityScore = clamp(Math.round(((parts["jokey sürekliliği"] ?? 0) / 13) * 100));
  const formScore = clamp(Math.round(((parts["prep formu"] ?? 0) / 28) * 100));
  const profileScore = clamp(Math.round(((parts["profil kanıtı"] ?? 0) / 30) * 100));

  return {
    horsePerformance: {
      score: clamp(Math.round((formScore * 0.65) + (profileScore * 0.35))),
      label: "At performansı",
      note: row?.bestPrepRaceName
        ? `${row.bestPrepRaceName} ${row.bestPrepFinishPosition}. ve geçmiş profil kanıtı birlikte okunur.`
        : "Prep performans referansı sınırlı."
    },
    routeProfile: {
      score: clamp(routeScore),
      label: "Rota profili",
      note: row?.routeVisibility?.reason ?? "Rota görünürlüğü katılım matrisinden hesaplanır."
    },
    actorContext: {
      score: clamp(Math.round((actorScore * 0.55) + (continuityScore * 0.45))),
      label: "Jokey/aktör",
      note: hasJockeyChange(row)
        ? "Jokey sürekliliği kırılmış; aktör geçmişiyle birlikte okunmalı."
        : "Jokey hattı daha sabit görünüyor."
    },
    pedigree: {
      score: pedigreeScore(row, entry),
      label: "Soy hattı",
      note: row?.sire && row?.dam
        ? `${row.sire} / ${row.dam} bilgisi mevcut; tarihsel soy performansı sınırlı ağırlıkla okunur.`
        : "Soy hattı eksik olduğu için pedigree prior düşük güvenlidir."
    },
    owner: {
      score: ownerScore(row),
      label: "Sahip",
      note: row?.owner
        ? `${row.owner} bilgisi mevcut; gerçek sahip başarı oranı sonraki veri genişletmede hesaplanacak.`
        : "Sahip bilgisi eksik."
    },
    dataConfidence: {
      score: readiness.confidence ?? 0,
      label: "Veri güveni",
      note: readiness.confidenceLabel ?? "Veri güven etiketi bekleniyor."
    }
  };
};

const weightedComposite = (groups) => {
  const weights = {
    horsePerformance: 0.3,
    routeProfile: 0.2,
    actorContext: 0.16,
    pedigree: 0.12,
    owner: 0.07,
    dataConfidence: 0.15
  };

  return Math.round(Object.entries(weights)
    .reduce((sum, [key, weight]) => sum + ((groups[key]?.score ?? 0) * weight), 0));
};

const strongestAndWeakest = (groups) => {
  const sorted = Object.entries(groups)
    .filter(([, group]) => Number.isFinite(group.score))
    .sort((a, b) => b[1].score - a[1].score);

  return {
    strongestGroup: sorted[0]?.[0] ?? null,
    weakestGroup: sorted.at(-1)?.[0] ?? null
  };
};

const buildProfile = ({ row, entry }) => {
  const groups = groupScores({ row, entry });
  const extremes = strongestAndWeakest(groups);

  return {
    horseName: entry.horseName,
    gaziFinishPosition: entry.gaziFinishPosition ?? row?.gaziFinishPosition ?? null,
    compositeScore: weightedComposite(groups),
    readinessScore: entry.readiness?.score ?? null,
    groups,
    strongestGroup: extremes.strongestGroup,
    weakestGroup: extremes.weakestGroup,
    flags: [
      row?.prepStartCount === 0 ? "route-blind" : null,
      hasJockeyChange(row) ? "jockey-change" : null,
      !row?.sire || !row?.dam ? "pedigree-incomplete" : null,
      !row?.owner ? "owner-missing" : null
    ].filter(Boolean)
  };
};

const buildGroupAverages = (profiles) => {
  const groupKeys = ["horsePerformance", "routeProfile", "actorContext", "pedigree", "owner", "dataConfidence"];
  return Object.fromEntries(groupKeys.map((key) => {
    const scores = profiles.map((profile) => profile.groups[key]?.score).filter(Number.isFinite);
    const average = scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : null;
    return [key, average];
  }));
};

export const buildFeatureBreakdown = ({ readiness, participation }) => {
  const profiles = (readiness.rankings?.score ?? [])
    .map((entry) => {
      const row = rowByHorse(participation, entry.horseName);
      return row ? buildProfile({ row, entry }) : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.compositeScore - a.compositeScore || b.readinessScore - a.readinessScore);

  return {
    generatedAt: new Date().toISOString(),
    sourceYear: readiness.sourceYear ?? participation?.sourceYear ?? null,
    summary: {
      runnerCount: profiles.length,
      leaderHorse: profiles[0]?.horseName ?? null,
      averageCompositeScore: profiles.length
        ? Math.round(profiles.reduce((sum, profile) => sum + profile.compositeScore, 0) / profiles.length)
        : null,
      groupAverages: buildGroupAverages(profiles)
    },
    profiles,
    methodology: {
      note: "Feature breakdown, readiness ve katılım raporlarını ayrı feature gruplarına ayırır; tek başına sonuç tahmini değildir.",
      weights: {
        horsePerformance: 0.3,
        routeProfile: 0.2,
        actorContext: 0.16,
        pedigree: 0.12,
        owner: 0.07,
        dataConfidence: 0.15
      },
      safeguards: [
        "Sahip ve pedigree skorları ilk sürümde veri varlığı ve sınırlı actor sinyaliyle hesaplanır.",
        "Eksik veri düşük güven olarak gösterilir; otomatik performans cezası sayılmaz.",
        "Gazi sonucu feature üretiminde kullanılmaz; yalnızca tamamlanmış sezonlarda değerlendirme alanı olarak taşınır."
      ]
    }
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const readinessPath = getArgValue(args, "--readiness") ?? "data/gazi-readiness-report.json";
  const participationPath = getArgValue(args, "--participation") ?? "data/gazi-participation-report.json";
  const outPath = getArgValue(args, "--out") ?? "data/gazi-feature-breakdown.json";
  const payload = buildFeatureBreakdown({
    readiness: await readJson(readinessPath),
    participation: await readJson(participationPath)
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    sourceYear: payload.sourceYear,
    runnerCount: payload.summary.runnerCount,
    leaderHorse: payload.summary.leaderHorse
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-feature-breakdown.mjs")) {
  main();
}
