import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const getRepeatedArgValues = (args, name) => {
  return args.flatMap((arg, index) => {
    if (arg !== name) return [];
    return args[index + 1] ? [args[index + 1]] : [];
  });
};

const percentage = (count, total) => {
  return total > 0 ? Math.round((count / total) * 100) : 0;
};

const average = (values) => {
  const numericValues = values.filter(Number.isFinite);
  if (numericValues.length === 0) return null;
  return Math.round((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length) * 10) / 10;
};

const normalizeName = (value) => {
  return String(value ?? "").toLocaleUpperCase("tr-TR");
};

export const classifyRouteRace = (name) => {
  const normalized = normalizeName(name);
  if (normalized === "GAZİ") return { key: "gazi", label: "Gazi" };
  if (normalized.includes("MEHMET AKİF ERSOY")) return { key: "mehmet-akif-ersoy", label: "Mehmet Akif Ersoy" };
  if (normalized.includes("SAİT AKSON")) return { key: "sait-akson", label: "Sait Akson" };
  if (normalized.includes("KISRAK")) return { key: "kisrak", label: "Kısrak" };
  if (normalized.includes("ERKEK TAY DENEME")) return { key: "erkek-tay-deneme", label: "Erkek Tay Deneme" };
  if (normalized.includes("DİŞİ TAY DENEME")) return { key: "disi-tay-deneme", label: "Dişi Tay Deneme" };
  return { key: normalized.toLocaleLowerCase("tr-TR"), label: name };
};

const finishedEntries = (race) => {
  return (race.entries ?? []).filter((entry) => Number.isFinite(entry.finish_position));
};

const topThreeEntries = (race) => {
  return finishedEntries(race).filter((entry) => entry.finish_position >= 1 && entry.finish_position <= 3);
};

export const buildSeasonResult = (report) => {
  const gaziRace = (report.routeRaces ?? []).find((race) => classifyRouteRace(race.name).key === "gazi");
  if (!gaziRace || finishedEntries(gaziRace).length === 0) return null;

  const gaziEntries = finishedEntries(gaziRace);
  const gaziByHorse = new Map(gaziEntries.map((entry) => [entry.horse_name, entry]));
  const gaziTopThree = topThreeEntries(gaziRace);
  const gaziTopThreeNames = new Set(gaziTopThree.map((entry) => entry.horse_name));

  const prepRaces = (report.routeRaces ?? [])
    .filter((race) => classifyRouteRace(race.name).key !== "gazi")
    .map((race) => {
      const raceType = classifyRouteRace(race.name);
      const entries = finishedEntries(race);
      const prepTopThree = topThreeEntries(race);
      const gaziRunners = entries.filter((entry) => gaziByHorse.has(entry.horse_name));
      const gaziTopThreeParticipants = entries.filter((entry) => gaziTopThreeNames.has(entry.horse_name));
      const prepTopThreeHits = prepTopThree.filter((entry) => gaziTopThreeNames.has(entry.horse_name));
      const winner = entries.find((entry) => entry.finish_position === 1);
      const winnerGaziEntry = winner ? gaziByHorse.get(winner.horse_name) : null;
      const bestGaziEntry = gaziRunners
        .map((entry) => gaziByHorse.get(entry.horse_name))
        .sort((a, b) => a.finish_position - b.finish_position)[0] ?? null;

      return {
        key: raceType.key,
        name: raceType.label,
        sourceName: race.name,
        date: race.date,
        participantCount: entries.length,
        gaziRunnerCount: gaziRunners.length,
        gaziTopThreeCoverageCount: gaziTopThreeParticipants.length,
        gaziTopThreeCoverageRate: percentage(gaziTopThreeParticipants.length, gaziTopThree.length),
        prepTopThreeHitCount: prepTopThreeHits.length,
        prepTopThreeHitRate: percentage(prepTopThreeHits.length, prepTopThree.length),
        winnerName: winner?.horse_name ?? null,
        winnerGaziFinish: winnerGaziEntry?.finish_position ?? null,
        bestGaziHorse: bestGaziEntry?.horse_name ?? null,
        bestGaziFinish: bestGaziEntry?.finish_position ?? null,
        gaziTopThreeParticipants: gaziTopThreeParticipants.map((entry) => entry.horse_name),
        prepTopThreeHits: prepTopThreeHits.map((entry) => entry.horse_name)
      };
    });

  const routeParticipantNames = new Set(prepRaces.flatMap((race) => race.gaziTopThreeParticipants));
  const coveredGaziTopThree = gaziTopThree.filter((entry) => routeParticipantNames.has(entry.horse_name));

  return {
    year: report.year,
    gaziDate: gaziRace.date,
    gaziTopThree: gaziTopThree.map((entry) => ({
      finishPosition: entry.finish_position,
      horseName: entry.horse_name,
      seenInRoute: routeParticipantNames.has(entry.horse_name)
    })),
    routeCoverageCount: coveredGaziTopThree.length,
    routeCoverageRate: percentage(coveredGaziTopThree.length, gaziTopThree.length),
    prepRaces
  };
};

export const buildAggregate = (seasons) => {
  const raceTypes = new Map();

  for (const season of seasons) {
    for (const race of season.prepRaces) {
      const existing = raceTypes.get(race.key) ?? {
        key: race.key,
        name: race.name,
        seasonsObserved: 0,
        participantCount: 0,
        gaziRunnerCount: 0,
        gaziTopThreeCoverageCount: 0,
        prepTopThreeHitCount: 0,
        winnerGaziFinishes: []
      };

      existing.seasonsObserved += 1;
      existing.participantCount += race.participantCount;
      existing.gaziRunnerCount += race.gaziRunnerCount;
      existing.gaziTopThreeCoverageCount += race.gaziTopThreeCoverageCount;
      existing.prepTopThreeHitCount += race.prepTopThreeHitCount;
      if (Number.isFinite(race.winnerGaziFinish)) existing.winnerGaziFinishes.push(race.winnerGaziFinish);
      raceTypes.set(race.key, existing);
    }
  }

  return [...raceTypes.values()]
    .map((race) => ({
      key: race.key,
      name: race.name,
      seasonsObserved: race.seasonsObserved,
      participantCount: race.participantCount,
      gaziRunnerCount: race.gaziRunnerCount,
      gaziRunnerRate: percentage(race.gaziRunnerCount, race.participantCount),
      gaziTopThreeCoverageCount: race.gaziTopThreeCoverageCount,
      gaziTopThreeCoverageRate: percentage(race.gaziTopThreeCoverageCount, race.seasonsObserved * 3),
      prepTopThreeHitCount: race.prepTopThreeHitCount,
      prepTopThreeHitRate: percentage(race.prepTopThreeHitCount, race.seasonsObserved * 3),
      winnerGaziTopThreeCount: race.winnerGaziFinishes.filter((finish) => finish <= 3).length,
      winnerGaziTopThreeRate: percentage(
        race.winnerGaziFinishes.filter((finish) => finish <= 3).length,
        race.seasonsObserved
      ),
      averageWinnerGaziFinish: average(race.winnerGaziFinishes),
      sampleConfidence: Math.min(1, Math.round((race.seasonsObserved / 5) * 100) / 100)
    }))
    .sort((a, b) => b.gaziTopThreeCoverageRate - a.gaziTopThreeCoverageRate
      || b.prepTopThreeHitRate - a.prepTopThreeHitRate
      || a.name.localeCompare(b.name, "tr"));
};

const main = async () => {
  const args = process.argv.slice(2);
  const inputPaths = getRepeatedArgValues(args, "--input");
  const outPath = getArgValue(args, "--out") ?? "data/gazi-backtest-report.json";

  if (inputPaths.length === 0) {
    console.error("Usage: node scripts/backtest-gazi-route.mjs --input <route-report.json> [--input <route-report.json>] [--out data/gazi-backtest-report.json]");
    process.exit(1);
  }

  const reports = await Promise.all(inputPaths.map(async (inputPath) => {
    return JSON.parse(await readFile(inputPath, "utf8"));
  }));
  const seasons = reports
    .map(buildSeasonResult)
    .filter(Boolean)
    .sort((a, b) => a.year - b.year);
  const aggregate = buildAggregate(seasons);
  const totalGaziTopThreeSlots = seasons.length * 3;
  const coveredGaziTopThreeSlots = seasons.reduce((sum, season) => sum + season.routeCoverageCount, 0);

  const payload = {
    generatedAt: new Date().toISOString(),
    methodology: {
      target: "Gazi ilk 3",
      routeRaceScope: "Gazi öncesi isimli rota koşuları",
      warning: "Bu rapor ilişkiyi ölçer; nedensellik veya kesin tahmin üretmez."
    },
    summary: {
      seasonCount: seasons.length,
      years: seasons.map((season) => season.year),
      prepRaceCount: seasons.reduce((sum, season) => sum + season.prepRaces.length, 0),
      totalGaziTopThreeSlots,
      coveredGaziTopThreeSlots,
      routeCoverageRate: percentage(coveredGaziTopThreeSlots, totalGaziTopThreeSlots),
      sampleState: seasons.length < 5 ? "early-sample" : "usable-sample"
    },
    aggregate,
    seasons
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outPath, seasonCount: seasons.length, aggregateCount: aggregate.length }, null, 2));
};

if (process.argv[1]?.endsWith("backtest-gazi-route.mjs")) {
  main();
}
