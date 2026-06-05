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

const normalizeParts = (entry) => {
  return Object.fromEntries((entry.readiness?.parts ?? []).map((part) => [part.label, part.value]));
};

const completedRows = (readinessReports) => {
  return readinessReports
    .filter((report) => report.calibration?.state === "completed")
    .flatMap((report) => (report.rankings?.score ?? []).map((entry) => ({
      year: report.sourceYear,
      horseName: entry.horseName,
      finishPosition: entry.gaziFinishPosition,
      scoreRank: entry.rank,
      score: entry.readiness?.score ?? null,
      confidence: entry.readiness?.confidence ?? null,
      upside: entry.readiness?.upside ?? null,
      risk: entry.readiness?.risk ?? null,
      parts: normalizeParts(entry),
      isWinner: entry.gaziFinishPosition === 1,
      isPodium: Number.isFinite(entry.gaziFinishPosition) && entry.gaziFinishPosition <= 3
    })));
};

const compareGroups = (rows, valueFor) => {
  const podiumRows = rows.filter((row) => row.isPodium);
  const nonPodiumRows = rows.filter((row) => !row.isPodium);
  const winnerRows = rows.filter((row) => row.isWinner);

  return {
    podiumAverage: average(podiumRows.map(valueFor)),
    nonPodiumAverage: average(nonPodiumRows.map(valueFor)),
    winnerAverage: average(winnerRows.map(valueFor)),
    separation: average(podiumRows.map(valueFor)) === null || average(nonPodiumRows.map(valueFor)) === null
      ? null
      : Math.round((average(podiumRows.map(valueFor)) - average(nonPodiumRows.map(valueFor))) * 10) / 10
  };
};

const buildSignalRows = (rows) => {
  const signalLabels = [...new Set(rows.flatMap((row) => Object.keys(row.parts)))].sort((a, b) => a.localeCompare(b, "tr"));

  return signalLabels.map((label) => {
    const stats = compareGroups(rows, (row) => row.parts[label] ?? 0);
    const podiumHitRows = rows.filter((row) => row.isPodium && (row.parts[label] ?? 0) > 0);
    const allSignalRows = rows.filter((row) => (row.parts[label] ?? 0) > 0);

    return {
      label,
      ...stats,
      podiumPresenceRate: percentage(podiumHitRows.length, rows.filter((row) => row.isPodium).length),
      overallPresenceRate: percentage(allSignalRows.length, rows.length),
      interpretation: stats.separation === null
        ? "Örneklem yetersiz."
        : stats.separation > 2
          ? "Podyum profillerinde daha güçlü görünüyor."
          : stats.separation < -2
            ? "Podyum dışı profillerde daha yüksek; ağırlık dikkatle okunmalı."
            : "Podyum ayrımı sınırlı."
    };
  }).sort((a, b) => Math.abs(b.separation ?? 0) - Math.abs(a.separation ?? 0) || a.label.localeCompare(b.label, "tr"));
};

const buildMetricRows = (rows) => {
  return ["score", "confidence", "upside", "risk"].map((metric) => ({
    metric,
    ...compareGroups(rows, (row) => row[metric]),
    interpretation: metric === "risk"
      ? "Risk yüksekse model bu profili daha oynak okur."
      : "Daha yüksek değer modelin adayı öne alma eğilimini artırır."
  }));
};

const buildMissDiagnostics = (readinessReports) => {
  return readinessReports
    .filter((report) => report.calibration?.state === "completed" && report.calibration?.winnerScoreRank > 1)
    .map((report) => {
      const winnerEntry = (report.rankings?.score ?? []).find((entry) => entry.horseName === report.calibration.winnerName);
      const leaderEntry = report.rankings?.score?.[0] ?? null;
      const winnerParts = normalizeParts(winnerEntry ?? {});
      const leaderParts = normalizeParts(leaderEntry ?? {});
      const partGaps = [...new Set([...Object.keys(winnerParts), ...Object.keys(leaderParts)])]
        .map((label) => ({
          label,
          winner: winnerParts[label] ?? 0,
          leader: leaderParts[label] ?? 0,
          gap: (leaderParts[label] ?? 0) - (winnerParts[label] ?? 0)
        }))
        .sort((a, b) => b.gap - a.gap);

      return {
        year: report.sourceYear,
        winnerName: report.calibration.winnerName,
        winnerScoreRank: report.calibration.winnerScoreRank,
        leaderName: leaderEntry?.horseName ?? null,
        leaderFinish: leaderEntry?.gaziFinishPosition ?? null,
        largestGaps: partGaps.slice(0, 3),
        missReasons: report.calibration.missReasons ?? []
      };
    });
};

const signalWeightDirections = {
  "prep formu": {
    currentMax: 28,
    modelPart: "prepForm"
  },
  "profil kanıtı": {
    currentMax: 30,
    modelPart: "profileEvidence"
  },
  "rota şekli": {
    currentMax: 18,
    modelPart: "routeShape"
  },
  "jokey sürekliliği": {
    currentMax: 13,
    modelPart: "continuity"
  },
  "veri derinliği": {
    currentMax: 10,
    modelPart: "dataDepth"
  },
  "aktör geçmişi": {
    currentMax: 12,
    modelPart: "actorSignal"
  }
};

const recommendationForSignal = (signal, missDiagnostics) => {
  const config = signalWeightDirections[signal.label] ?? {};
  const repeatedMissGapCount = missDiagnostics.filter((miss) => {
    return (miss.largestGaps ?? []).some((gap) => gap.label === signal.label && gap.gap >= 8);
  }).length;
  const separation = signal.separation ?? 0;
  const confidence = signal.overallPresenceRate >= 80 ? "high" : signal.overallPresenceRate >= 45 ? "medium" : "low";
  const direction = separation >= 4 && repeatedMissGapCount <= 1
    ? "increase"
    : separation <= -2 || repeatedMissGapCount >= 2
      ? "decrease"
      : "keep";
  const delta = direction === "increase"
    ? Math.min(4, Math.max(1, Math.round(separation / 2)))
    : direction === "decrease"
      ? -Math.min(4, Math.max(1, repeatedMissGapCount || Math.round(Math.abs(separation) / 2)))
      : 0;

  return {
    label: signal.label,
    modelPart: config.modelPart ?? signal.label,
    currentMax: config.currentMax ?? null,
    direction,
    suggestedDelta: delta,
    suggestedMax: Number.isFinite(config.currentMax) ? Math.max(0, config.currentMax + delta) : null,
    confidence,
    reason: direction === "increase"
      ? `${signal.label} podyum profillerinde +${signal.separation} ayrışıyor; ağırlık kontrollü artırılabilir.`
      : direction === "decrease"
        ? repeatedMissGapCount >= 2
          ? `${signal.label} model kaçırmalarında lider lehine sık büyüyor; ağırlık azaltılıp sürpriz profiller korunmalı.`
          : `${signal.label} podyum dışı profillerde daha yüksek; ağırlık dikkatle azaltılmalı.`
        : `${signal.label} için ayrım sınırlı veya örneklem düşük; ağırlık şimdilik korunmalı.`
  };
};

const buildWeightRecommendations = (signals, missDiagnostics) => {
  const recommendations = signals.map((signal) => recommendationForSignal(signal, missDiagnostics));
  const actionCounts = recommendations.reduce((counts, recommendation) => {
    counts[recommendation.direction] = (counts[recommendation.direction] ?? 0) + 1;
    return counts;
  }, {});

  return {
    summary: {
      increaseCount: actionCounts.increase ?? 0,
      decreaseCount: actionCounts.decrease ?? 0,
      keepCount: actionCounts.keep ?? 0,
      strongestIncrease: recommendations.find((recommendation) => recommendation.direction === "increase")?.label ?? null,
      strongestDecrease: recommendations.find((recommendation) => recommendation.direction === "decrease")?.label ?? null
    },
    recommendations
  };
};

const adjustedScoreForRow = (row, recommendations) => {
  const delta = recommendations.reduce((sum, recommendation) => {
    if (!Number.isFinite(recommendation.currentMax) || recommendation.currentMax <= 0) return sum;
    const partValue = row.parts[recommendation.label] ?? 0;
    return sum + (recommendation.suggestedDelta * (partValue / recommendation.currentMax));
  }, 0);

  return Math.min(100, Math.max(0, Math.round(((row.score ?? 0) + delta) * 10) / 10));
};

const rankRows = (rows, scoreKey) => {
  return [...rows].sort((a, b) => (b[scoreKey] ?? 0) - (a[scoreKey] ?? 0) || (a.finishPosition ?? 99) - (b.finishPosition ?? 99));
};

const summarizeRankingSimulation = (seasonRows, scoreKey) => {
  const seasons = [...new Set(seasonRows.map((row) => row.year))].sort((a, b) => a - b);
  const seasonSummaries = seasons.map((year) => {
    const ranked = rankRows(seasonRows.filter((row) => row.year === year), scoreKey);
    const topPick = ranked[0] ?? null;
    const winnerIndex = ranked.findIndex((row) => row.isWinner);
    const topThreeOverlap = ranked.slice(0, 3).filter((row) => row.isPodium).length;

    return {
      year,
      topPickName: topPick?.horseName ?? null,
      topPickFinish: topPick?.finishPosition ?? null,
      topPickPodium: Number.isFinite(topPick?.finishPosition) && topPick.finishPosition <= 3,
      topPickWon: topPick?.finishPosition === 1,
      winnerScoreRank: winnerIndex === -1 ? null : winnerIndex + 1,
      topThreeOverlap
    };
  });

  return {
    seasonCount: seasonSummaries.length,
    topPickPodiumRate: percentage(seasonSummaries.filter((season) => season.topPickPodium).length, seasonSummaries.length),
    topPickWinRate: percentage(seasonSummaries.filter((season) => season.topPickWon).length, seasonSummaries.length),
    averageWinnerScoreRank: average(seasonSummaries.map((season) => season.winnerScoreRank)),
    averageTopThreeOverlap: average(seasonSummaries.map((season) => season.topThreeOverlap)),
    seasons: seasonSummaries
  };
};

const buildWhatIfSimulation = (rows, recommendations) => {
  const simulatedRows = rows.map((row) => ({
    ...row,
    adjustedScore: adjustedScoreForRow(row, recommendations)
  }));
  const baseline = summarizeRankingSimulation(rows, "score");
  const adjusted = summarizeRankingSimulation(simulatedRows, "adjustedScore");

  return {
    baseline,
    adjusted,
    delta: {
      topPickPodiumRate: adjusted.topPickPodiumRate - baseline.topPickPodiumRate,
      topPickWinRate: adjusted.topPickWinRate - baseline.topPickWinRate,
      averageWinnerScoreRank: Math.round(((adjusted.averageWinnerScoreRank ?? 0) - (baseline.averageWinnerScoreRank ?? 0)) * 10) / 10,
      averageTopThreeOverlap: Math.round(((adjusted.averageTopThreeOverlap ?? 0) - (baseline.averageTopThreeOverlap ?? 0)) * 10) / 10
    },
    note: "What-if simülasyonu önerilen ağırlık deltalarını mevcut skor parçalarına oransal uygular; gerçek model değişikliği değildir."
  };
};

export const buildSignalCalibration = (readinessReports) => {
  const rows = completedRows(readinessReports);
  const completedSeasonCount = new Set(rows.map((row) => row.year)).size;
  const podiumRows = rows.filter((row) => row.isPodium);
  const signals = buildSignalRows(rows);
  const missDiagnostics = buildMissDiagnostics(readinessReports);
  const weightRecommendations = buildWeightRecommendations(signals, missDiagnostics);
  const whatIfSimulation = buildWhatIfSimulation(rows, weightRecommendations.recommendations);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      completedSeasonCount,
      runnerCount: rows.length,
      podiumRunnerCount: podiumRows.length,
      yearRange: rows.length ? `${Math.min(...rows.map((row) => row.year))}-${Math.max(...rows.map((row) => row.year))}` : null,
      strongestPositiveSignal: signals.find((signal) => (signal.separation ?? 0) > 0)?.label ?? null
    },
    signals,
    metrics: buildMetricRows(rows),
    missDiagnostics,
    weightRecommendations,
    whatIfSimulation,
    methodology: {
      note: "Signal calibration, tamamlanmış sezonlarda readiness parça puanlarının Gazi podyumu ve kazanan profilleriyle ilişkisini özetler.",
      limitation: "Örneklem küçük olduğu için bu rapor otomatik ağırlık değiştirmez; önerilen ağırlıklar manuel inceleme ve backtest sonrası uygulanmalıdır."
    }
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const inputPaths = getArgValues(args, "--input");
  const outPath = getArgValue(args, "--out") ?? "data/gazi-signal-calibration.json";

  if (!inputPaths.length) {
    console.error("Usage: node scripts/build-gazi-signal-calibration.mjs --input <readiness.json> [--input <readiness.json>] [--out data/gazi-signal-calibration.json]");
    process.exit(1);
  }

  const reports = await Promise.all(inputPaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
  const payload = buildSignalCalibration(reports);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    completedSeasonCount: payload.summary.completedSeasonCount,
    runnerCount: payload.summary.runnerCount,
    strongestPositiveSignal: payload.summary.strongestPositiveSignal,
    increaseCount: payload.weightRecommendations.summary.increaseCount,
    decreaseCount: payload.weightRecommendations.summary.decreaseCount
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-signal-calibration.mjs")) {
  main();
}
