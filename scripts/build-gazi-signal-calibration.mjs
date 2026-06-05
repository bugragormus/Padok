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

export const buildSignalCalibration = (readinessReports) => {
  const rows = completedRows(readinessReports);
  const completedSeasonCount = new Set(rows.map((row) => row.year)).size;
  const podiumRows = rows.filter((row) => row.isPodium);
  const signals = buildSignalRows(rows);

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
    missDiagnostics: buildMissDiagnostics(readinessReports),
    methodology: {
      note: "Signal calibration, tamamlanmış sezonlarda readiness parça puanlarının Gazi podyumu ve kazanan profilleriyle ilişkisini özetler.",
      limitation: "Örneklem küçük olduğu için bu rapor otomatik ağırlık değiştirmez; ağırlık kararları için yön gösterir."
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
    strongestPositiveSignal: payload.summary.strongestPositiveSignal
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-signal-calibration.mjs")) {
  main();
}
