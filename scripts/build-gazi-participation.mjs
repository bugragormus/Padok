import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { classifyRouteRace } from "./backtest-gazi-route.mjs";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const percentage = (count, total) => {
  return total > 0 ? Math.round((count / total) * 100) : 0;
};

const average = (values) => {
  const numericValues = values.filter(Number.isFinite);
  if (numericValues.length === 0) return null;
  return Math.round((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length) * 10) / 10;
};

const hasFinishedEntry = (entry) => {
  return Number.isFinite(entry?.finish_position);
};

const toEntrySummary = (entry) => {
  if (!entry) return null;

  return {
    finishPosition: entry.finish_position ?? null,
    horseName: entry.horse_name ?? null,
    jockeyName: entry.jockey_name ?? null,
    sire: entry.sire ?? null,
    dam: entry.dam ?? null,
    damsire: entry.damsire ?? null,
    owner: entry.owner ?? null,
    weight: entry.weight ?? null,
    finishTime: entry.finish_time ?? null,
    margin: entry.margin ?? null,
    handicapPoint: entry.handicap_point ?? null,
    startingPrice: entry.starting_price ?? null
  };
};

const inferResultState = (race) => {
  if ((race.entries ?? []).some(hasFinishedEntry)) return "complete-results";
  if ((race.entries ?? []).length > 0) return "declared-field";
  return race.resultState ?? "awaiting-results";
};

const sortRouteRaces = (races) => {
  return [...races].sort((a, b) => {
    const aKey = classifyRouteRace(a.name).key;
    const bKey = classifyRouteRace(b.name).key;
    if (aKey === "gazi" && bKey !== "gazi") return 1;
    if (bKey === "gazi" && aKey !== "gazi") return -1;
    return String(a.date ?? "").localeCompare(String(b.date ?? ""))
      || String(a.name ?? "").localeCompare(String(b.name ?? ""), "tr");
  });
};

const buildColumns = (routeRaces) => {
  return sortRouteRaces(routeRaces).map((race) => {
    const raceType = classifyRouteRace(race.name);
    return {
      key: raceType.key,
      name: raceType.label,
      sourceName: race.name,
      date: race.date ?? null,
      venue: race.venue ?? null,
      isTarget: raceType.key === "gazi",
      resultState: inferResultState(race),
      participantCount: race.entries?.length ?? 0
    };
  });
};

const buildRaceLookup = (routeRaces) => {
  return new Map(routeRaces.map((race) => {
    const raceType = classifyRouteRace(race.name);
    const entriesByHorse = new Map((race.entries ?? [])
      .filter((entry) => entry.horse_name)
      .map((entry) => [entry.horse_name, entry]));
    return [raceType.key, { race, entriesByHorse, resultState: inferResultState(race) }];
  }));
};

const buildCell = (raceContext, horseName) => {
  if (!raceContext) {
    return { status: "missing-race" };
  }

  const entry = raceContext.entriesByHorse.get(horseName);
  if (entry) {
    return {
      status: "ran",
      ...toEntrySummary(entry)
    };
  }

  if (raceContext.resultState === "awaiting-results" || raceContext.resultState === "declared-field") {
    return { status: "pending" };
  }

  return { status: "not-run" };
};

const findBestPrep = (cells, columns) => {
  return columns
    .filter((column) => !column.isTarget)
    .map((column) => ({
      raceKey: column.key,
      raceName: column.name,
      ...cells[column.key]
    }))
    .filter((cell) => cell.status === "ran" && Number.isFinite(cell.finishPosition))
    .sort((a, b) => a.finishPosition - b.finishPosition)[0] ?? null;
};

export const buildParticipationReport = (routeReport) => {
  const routeRaces = routeReport.routeRaces ?? [];
  const columns = buildColumns(routeRaces);
  const raceLookup = buildRaceLookup(routeRaces);
  const gaziRace = raceLookup.get("gazi");
  const gaziEntries = (gaziRace?.race.entries ?? [])
    .filter((entry) => entry.horse_name)
    .sort((a, b) => {
      if (Number.isFinite(a.finish_position) && Number.isFinite(b.finish_position)) {
        return a.finish_position - b.finish_position;
      }
      return String(a.horse_name).localeCompare(String(b.horse_name), "tr");
    });

  const rows = gaziEntries.map((gaziEntry) => {
    const cells = Object.fromEntries(columns.map((column) => {
      return [column.key, buildCell(raceLookup.get(column.key), gaziEntry.horse_name)];
    }));
    const prepCells = columns
      .filter((column) => !column.isTarget)
      .map((column) => cells[column.key]);
    const prepStartCount = prepCells.filter((cell) => cell.status === "ran").length;
    const skippedPrepCount = prepCells.filter((cell) => cell.status === "not-run").length;
    const pendingPrepCount = prepCells.filter((cell) => cell.status === "pending").length;
    const bestPrep = findBestPrep(cells, columns);

    return {
      horseName: gaziEntry.horse_name,
      gaziFinishPosition: gaziEntry.finish_position ?? null,
      gaziJockeyName: gaziEntry.jockey_name ?? null,
      sire: gaziEntry.sire ?? null,
      dam: gaziEntry.dam ?? null,
      damsire: gaziEntry.damsire ?? null,
      owner: gaziEntry.owner ?? null,
      hasPrepStart: prepStartCount > 0,
      prepStartCount,
      skippedPrepCount,
      pendingPrepCount,
      bestPrepRaceKey: bestPrep?.raceKey ?? null,
      bestPrepRaceName: bestPrep?.raceName ?? null,
      bestPrepFinishPosition: bestPrep?.finishPosition ?? null,
      cells
    };
  });

  const topThreeRows = rows.filter((row) => Number.isFinite(row.gaziFinishPosition) && row.gaziFinishPosition <= 3);
  const runnersWithPrepStartCount = rows.filter((row) => row.prepStartCount > 0).length;
  const runnersWithoutPrepStartCount = rows.filter((row) => row.prepStartCount === 0).length;
  const topThreeWithPrepStartCount = topThreeRows.filter((row) => row.prepStartCount > 0).length;
  const topThreeWithoutPrepStartCount = topThreeRows.length - topThreeWithPrepStartCount;

  return {
    generatedAt: new Date().toISOString(),
    sourceYear: routeReport.year ?? null,
    sourceGeneratedAt: routeReport.generatedAt ?? null,
    methodology: {
      target: "Gazi field route participation",
      routeRaceScope: "Selected named Gazi route races in the same season",
      warning: "Katılmama bilgisi kötü performans anlamına gelmez; kampanya tercihi, koşu programı veya veri eksikliği olabilir."
    },
    summary: {
      analysisState: rows.length > 0 ? "field-available" : "awaiting-gazi-field",
      gaziRunnerCount: rows.length,
      routeRaceCount: columns.length,
      prepRaceCount: columns.filter((column) => !column.isTarget).length,
      runnersWithPrepStartCount,
      runnersWithoutPrepStartCount,
      runnersWithPrepStartRate: percentage(runnersWithPrepStartCount, rows.length),
      topThreeRunnerCount: topThreeRows.length,
      topThreeWithPrepStartCount,
      topThreeWithoutPrepStartCount,
      topThreePrepStartRate: percentage(topThreeWithPrepStartCount, topThreeRows.length),
      averagePrepStartCount: average(rows.map((row) => row.prepStartCount))
    },
    columns,
    rows
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const inputPath = getArgValue(args, "--input") ?? "data/gazi-route-report.json";
  const outPath = getArgValue(args, "--out") ?? "data/gazi-participation-report.json";
  const routeReport = JSON.parse(await readFile(inputPath, "utf8"));
  const payload = buildParticipationReport(routeReport);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    sourceYear: payload.sourceYear,
    gaziRunnerCount: payload.summary.gaziRunnerCount,
    runnersWithPrepStartCount: payload.summary.runnersWithPrepStartCount
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-participation.mjs")) {
  main();
}
