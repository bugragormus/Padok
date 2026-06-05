import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  clamp,
  getReadinessAssessment,
  getReadinessLensBadge,
  getReadinessLensMeta,
  getReadinessLensReason,
  getReadinessLensValue,
  readinessLensLabels,
  sortReadinessProfiles
} from "./readiness-model.mjs";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const getArgValues = (args, name) => {
  return args.flatMap((arg, index) => arg === name && args[index + 1] ? [args[index + 1]] : []);
};

const rowHasJockeyChange = (row, tableColumns) => {
  const jockeyNames = tableColumns
    .map((column) => row.cells?.[column.key])
    .filter((cell) => cell?.status === "ran" && cell.jockeyName)
    .map((cell) => cell.jockeyName);

  return new Set(jockeyNames).size > 1;
};

const normalizeEntityName = (value) => String(value ?? "").trim().toLocaleUpperCase("tr-TR");

const addEntityResult = (statsMap, key, finishPosition) => {
  const normalizedKey = normalizeEntityName(key);
  if (!normalizedKey || !Number.isFinite(finishPosition)) return;

  const stats = statsMap.get(normalizedKey) ?? {
    starts: 0,
    wins: 0,
    topThree: 0,
    finishTotal: 0
  };

  stats.starts += 1;
  stats.wins += finishPosition === 1 ? 1 : 0;
  stats.topThree += finishPosition <= 3 ? 1 : 0;
  stats.finishTotal += finishPosition;
  statsMap.set(normalizedKey, stats);
};

const buildActorHistoryIndex = (participationReport, comparisonReports) => {
  const selectedYear = participationReport.sourceYear;
  const index = {
    jockey: new Map(),
    owner: new Map(),
    sire: new Map()
  };

  comparisonReports
    .filter((report) => Number.isFinite(report.sourceYear) && (!Number.isFinite(selectedYear) || report.sourceYear < selectedYear))
    .forEach((report) => {
      (report.rows ?? []).forEach((row) => {
        addEntityResult(index.jockey, row.gaziJockeyName, row.gaziFinishPosition);
        addEntityResult(index.owner, row.owner, row.gaziFinishPosition);
        addEntityResult(index.sire, row.sire, row.gaziFinishPosition);
      });
    });

  return index;
};

const toActorSignal = (statsMap, key, label, maxScore) => {
  const stats = statsMap.get(normalizeEntityName(key));
  if (!stats || stats.starts === 0) return null;

  const topThreeRate = stats.topThree / stats.starts;
  const winRate = stats.wins / stats.starts;
  const averageFinish = stats.finishTotal / stats.starts;
  const score = clamp(Math.round((topThreeRate * maxScore * 0.7) + (winRate * maxScore * 0.3)), 0, maxScore);

  return {
    label,
    name: key,
    starts: stats.starts,
    wins: stats.wins,
    topThree: stats.topThree,
    topThreeRate: Math.round(topThreeRate * 100),
    winRate: Math.round(winRate * 100),
    averageFinish: averageFinish.toFixed(1),
    score
  };
};

const buildActorContext = (row, actorHistoryIndex) => {
  const signals = [
    toActorSignal(actorHistoryIndex.jockey, row.gaziJockeyName, "jokey", 5),
    toActorSignal(actorHistoryIndex.owner, row.owner, "sahip", 4),
    toActorSignal(actorHistoryIndex.sire, row.sire, "baba hattı", 3)
  ].filter(Boolean);

  const totalScore = signals.reduce((sum, signal) => sum + signal.score, 0);

  return {
    totalScore,
    signals,
    summary: signals.length
      ? signals.map((signal) => `${signal.label}: ${signal.topThree}/${signal.starts} ilk 3`).join(" · ")
      : "Geçmiş aktör sinyali bulunamadı."
  };
};

const getHistoricalProfileMatches = (selectedRow, selectedReport, comparisonReports) => {
  const selectedColumns = selectedReport.columns ?? [];
  const selectedYear = selectedReport.sourceYear;
  const selectedNoPrep = selectedRow.prepStartCount === 0;
  const selectedPrepWinner = selectedRow.bestPrepFinishPosition === 1;
  const selectedJockeyChange = rowHasJockeyChange(selectedRow, selectedColumns);
  const selectedActivePrep = selectedRow.prepStartCount >= 2;

  return comparisonReports
    .filter((report) => Number.isFinite(report.sourceYear) && (!Number.isFinite(selectedYear) || report.sourceYear < selectedYear))
    .flatMap((report) => {
      const tableColumns = report.columns ?? [];

      return (report.rows ?? [])
        .filter((row) => Number.isFinite(row.gaziFinishPosition) && row.gaziFinishPosition <= 3)
        .map((row) => {
          const matchingSignals = [
            selectedNoPrep && row.prepStartCount === 0 ? "rota dışı" : null,
            selectedPrepWinner && row.bestPrepFinishPosition === 1 ? "prep galibi" : null,
            selectedJockeyChange && rowHasJockeyChange(row, tableColumns) ? "jokey değişimi" : null,
            selectedActivePrep && row.prepStartCount >= 2 ? "yoğun prep" : null
          ].filter(Boolean);

          return {
            horseName: row.horseName,
            year: report.sourceYear,
            gaziFinishPosition: row.gaziFinishPosition,
            matchingSignals
          };
        });
    })
    .filter((row) => row.matchingSignals.length > 0)
    .sort((a, b) => b.matchingSignals.length - a.matchingSignals.length || a.gaziFinishPosition - b.gaziFinishPosition || b.year - a.year)
    .slice(0, 4);
};

const summarizeProfileMatches = (matches) => {
  if (!matches.length) {
    return {
      count: 0,
      averageFinish: "-",
      strongestSignal: "Yok",
      note: "Geçmiş ilk 3 içinde aynı profil sinyaliyle güçlü eşleşme bulunmadı."
    };
  }

  const signalCounts = matches
    .flatMap((match) => match.matchingSignals)
    .reduce((counts, signal) => {
      counts.set(signal, (counts.get(signal) ?? 0) + 1);
      return counts;
    }, new Map());
  const strongestSignal = [...signalCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"))[0][0];
  const averageFinish = matches.reduce((sum, match) => sum + match.gaziFinishPosition, 0) / matches.length;
  const topTwoCount = matches.filter((match) => match.gaziFinishPosition <= 2).length;

  return {
    count: matches.length,
    averageFinish: averageFinish.toFixed(1),
    strongestSignal,
    note: `${topTwoCount}/${matches.length} benzer örnek Gazi'de ilk 2 içinde bitirmiş.`
  };
};

const toRankingEntry = ({ row, readiness, profileSummary, historicalMatches, actorContext }, lens, index) => {
  return {
    rank: index + 1,
    horseName: row.horseName,
    gaziFinishPosition: row.gaziFinishPosition ?? null,
    lensValue: getReadinessLensValue(readiness, lens),
    badge: getReadinessLensBadge(readiness, lens),
    reason: getReadinessLensReason(row, readiness, lens),
    meta: getReadinessLensMeta(readiness, lens),
    readiness,
    profileSummary,
    historicalMatches,
    actorContext: lens === "score" ? actorContext : null
  };
};

const average = (values) => {
  const numericValues = values.filter(Number.isFinite);
  if (!numericValues.length) return null;
  return Math.round((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length) * 10) / 10;
};

const summarizeLens = (entries) => {
  const topThree = entries.slice(0, 3);
  const values = entries.map((entry) => entry.lensValue);

  return {
    topHorse: entries[0]?.horseName ?? null,
    topThree: topThree.map((entry) => entry.horseName),
    averageValue: average(values),
    highSignalCount: entries.filter((entry) => Number.isFinite(entry.lensValue) && entry.lensValue >= 70).length,
    watchlistCount: entries.filter((entry) => Number.isFinite(entry.lensValue) && entry.lensValue >= 50).length
  };
};

const findRankingPosition = (entries, horseName) => {
  const index = entries.findIndex((entry) => entry.horseName === horseName);
  return index === -1 ? null : index + 1;
};

const getWinnerMissReasons = (winnerProfile, scoreLeader, tableColumns) => {
  if (!winnerProfile) return [];

  const { row, readiness } = winnerProfile;
  const reasons = [
    row.bestPrepFinishPosition > 1 ? `Kazanan prep galibi değildi; en iyi takip derecesi ${row.bestPrepRaceName ?? "bilinmeyen koşu"} ${row.bestPrepFinishPosition}. sıra.` : null,
    row.prepStartCount === 0 ? "Kazanan takip edilen prep rotalarında hiç görünmedi." : null,
    row.prepStartCount === 1 ? "Kazanan yalnızca tek takip koşusunda göründü; model geniş rota görünürlüğünü daha çok ödüllendirdi." : null,
    rowHasJockeyChange(row, tableColumns) ? "Kazanan Gazi'ye jokey değişimiyle geldi; mevcut skor sürekliliği daha yüksek puanlıyor." : null,
    readiness.upside < 35 ? "Kazananın upside metriği düşük kaldı; geç gelişen form sıçraması ayrıca modellenmeli." : null,
    scoreLeader && scoreLeader.row.horseName !== row.horseName ? `Model lideri ${scoreLeader.row.horseName} oldu; ana skor görünür prep performansını öne aldı.` : null
  ].filter(Boolean);

  return [...new Set(reasons)];
};

const buildCalibrationSummary = (profiles, rankings, participationReport, tableColumns) => {
  const winnerProfile = profiles.find(({ row }) => row.gaziFinishPosition === 1);
  const scoreLeader = sortReadinessProfiles(profiles, "score")[0] ?? null;

  if (!winnerProfile) {
    return {
      state: participationReport.summary?.analysisState === "completed" ? "winner-missing" : "awaiting-result",
      note: "Gazi sonucu henüz readiness kalibrasyonu için tamamlanmadı."
    };
  }

  const winnerName = winnerProfile.row.horseName;
  const scoreRank = findRankingPosition(rankings.score ?? [], winnerName);
  const upsideRank = findRankingPosition(rankings.upside ?? [], winnerName);
  const lowRiskRank = findRankingPosition(rankings.lowRisk ?? [], winnerName);
  const uncertaintyRank = findRankingPosition(rankings.uncertainty ?? [], winnerName);
  const scoreLeaderEntry = rankings.score?.[0] ?? null;
  const topPickHit = Number.isFinite(scoreLeaderEntry?.gaziFinishPosition) && scoreLeaderEntry.gaziFinishPosition <= 3;
  const winnerGap = Number.isFinite(scoreRank) ? scoreRank - 1 : null;
  const missReasons = getWinnerMissReasons(winnerProfile, scoreLeader, tableColumns);

  return {
    state: "completed",
    winnerName,
    winnerScore: winnerProfile.readiness.score,
    winnerScoreRank: scoreRank,
    winnerUpsideRank: upsideRank,
    winnerLowRiskRank: lowRiskRank,
    winnerUncertaintyRank: uncertaintyRank,
    winnerRouteVisibility: winnerProfile.row.routeVisibility ?? null,
    topScoreHorse: scoreLeaderEntry?.horseName ?? null,
    topScoreFinish: scoreLeaderEntry?.gaziFinishPosition ?? null,
    topPickHit,
    winnerGap,
    missReasons,
    lesson: winnerGap && winnerGap > 0
      ? "Ana skor gerçek kazananı lider seçmedi; tek koşu sinyali, jokey değişimi ve geç form sıçraması kalibrasyonda ayrıca izlenmeli."
      : "Ana skor gerçek kazananı lider seçti; mevcut ağırlıklar bu sezon için hedefe yakın çalıştı."
  };
};

const buildQualitySummary = (profiles, participationReport, comparisonReports) => {
  const runnerCount = profiles.length;
  const comparisonSeasonCount = comparisonReports.filter((report) => Number.isFinite(report.sourceYear) && report.sourceYear < participationReport.sourceYear).length;
  const missingPedigreeCount = profiles.filter(({ row }) => !row.sire || !row.dam).length;
  const missingOwnerCount = profiles.filter(({ row }) => !row.owner).length;
  const prepSignalCount = profiles.filter(({ row }) => row.prepStartCount > 0).length;
  const historicalEvidenceCount = profiles.filter(({ profileSummary }) => profileSummary.count > 0).length;
  const warnings = [
    runnerCount === 0 ? "Gazi koşucu listesi henüz readiness raporuna girmedi." : null,
    comparisonSeasonCount < 2 ? "Profil karşılaştırması için geçmiş sezon sayısı düşük." : null,
    missingPedigreeCount > 0 ? `${missingPedigreeCount} at için anne/baba bilgisi eksik.` : null,
    missingOwnerCount > 0 ? `${missingOwnerCount} at için sahip bilgisi eksik.` : null,
    runnerCount > 0 && prepSignalCount === 0 ? "Hiçbir at için takip edilen prep rotası sinyali yok." : null,
    runnerCount > 0 && historicalEvidenceCount === 0 ? "Geçmiş ilk 3 profil kanıtı henüz oluşmadı." : null
  ].filter(Boolean);

  return {
    runnerCount,
    comparisonSeasonCount,
    missingPedigreeCount,
    missingOwnerCount,
    prepSignalCount,
    historicalEvidenceCount,
    warningCount: warnings.length,
    warnings
  };
};

export const buildReadinessReport = (participationReport, options = {}) => {
  const comparisonReports = options.comparisonReports ?? [];
  const tableColumns = participationReport.columns ?? [];
  const actorHistoryIndex = buildActorHistoryIndex(participationReport, comparisonReports);
  const profiles = (participationReport.rows ?? []).map((row) => {
    const historicalMatches = getHistoricalProfileMatches(row, participationReport, comparisonReports);
    const profileSummary = summarizeProfileMatches(historicalMatches);
    const actorContext = buildActorContext(row, actorHistoryIndex);
    const readiness = getReadinessAssessment(row, profileSummary, {
      hasJockeyChange: rowHasJockeyChange(row, tableColumns),
      actorContext
    });

    return {
      row,
      readiness,
      profileSummary,
      historicalMatches,
      actorContext
    };
  });
  const rankings = Object.fromEntries(Object.keys(readinessLensLabels).map((lens) => {
    return [
      lens,
      sortReadinessProfiles(profiles, lens).map((profile, index) => toRankingEntry(profile, lens, index))
    ];
  }));
  const lensSummaries = Object.fromEntries(Object.entries(rankings).map(([lens, entries]) => {
    return [lens, summarizeLens(entries)];
  }));
  const quality = buildQualitySummary(profiles, participationReport, comparisonReports);
  const calibration = buildCalibrationSummary(profiles, rankings, participationReport, tableColumns);

  return {
    generatedAt: new Date().toISOString(),
    sourceYear: participationReport.sourceYear ?? null,
    sourceGeneratedAt: participationReport.generatedAt ?? null,
    methodology: {
      target: "Gazi horse readiness",
      warning: "Readiness skoru karar destek sinyalidir; kesin sonuç tahmini veya bahis önerisi değildir.",
      leakageControl: "Profil kanıtı yalnızca analiz sezonundan önceki sezonlardan üretilir."
    },
    summary: {
      analysisState: participationReport.summary?.analysisState ?? "unknown",
      runnerCount: profiles.length,
      comparisonSeasonCount: comparisonReports.filter((report) => Number.isFinite(report.sourceYear) && report.sourceYear < participationReport.sourceYear).length,
      topScoreHorse: rankings.score?.[0]?.horseName ?? null,
      topUpsideHorse: rankings.upside?.[0]?.horseName ?? null,
      topUncertaintyHorse: rankings.uncertainty?.[0]?.horseName ?? null
    },
    quality,
    calibration,
    lenses: readinessLensLabels,
    lensSummaries,
    rankings
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const inputPath = getArgValue(args, "--input") ?? "data/gazi-participation-report.json";
  const outPath = getArgValue(args, "--out") ?? "data/gazi-readiness-report.json";
  const comparisonPaths = getArgValues(args, "--comparison");
  const participationReport = JSON.parse(await readFile(inputPath, "utf8"));
  const comparisonReports = await Promise.all(comparisonPaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
  const payload = buildReadinessReport(participationReport, { comparisonReports });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    sourceYear: payload.sourceYear,
    runnerCount: payload.summary.runnerCount,
    topScoreHorse: payload.summary.topScoreHorse
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-readiness-report.mjs")) {
  main();
}
