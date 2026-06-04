import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
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

const toRankingEntry = ({ row, readiness, profileSummary, historicalMatches }, lens, index) => {
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
    historicalMatches
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

export const buildReadinessReport = (participationReport, options = {}) => {
  const comparisonReports = options.comparisonReports ?? [];
  const tableColumns = participationReport.columns ?? [];
  const profiles = (participationReport.rows ?? []).map((row) => {
    const historicalMatches = getHistoricalProfileMatches(row, participationReport, comparisonReports);
    const profileSummary = summarizeProfileMatches(historicalMatches);
    const readiness = getReadinessAssessment(row, profileSummary, {
      hasJockeyChange: rowHasJockeyChange(row, tableColumns)
    });

    return {
      row,
      readiness,
      profileSummary,
      historicalMatches
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
