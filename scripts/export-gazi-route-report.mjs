import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { scoreRace, buildExplanation, classifySignalTier } from "./score-gazi-race-similarity.mjs";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const runSqlite = (args) => {
  const result = spawnSync("sqlite3", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "sqlite3 failed");
  }
  return result.stdout;
};

const readRouteRaces = (dbPath, year) => {
  const sql = `
    SELECT json_group_array(json_object(
      'id', r.id,
      'source_race_id', r.source_race_id,
      'date', COALESCE(r.date, irr.race_date),
      'venue', r.venue,
      'race_no', r.race_no,
      'name', COALESCE(r.name, irr.race_name),
      'race_class', COALESCE(r.race_class, irr.race_class),
      'age_condition', r.age_condition,
      'breed', r.breed,
      'sex_condition', r.sex_condition,
      'distance_m', COALESCE(r.distance_m, irr.distance_m),
      'surface', COALESCE(r.surface, irr.surface),
	      'winner_time', COALESCE(r.winner_time, irr.winner_time),
	      'winner_name', irr.winner_name,
	      'jockey_name', irr.jockey_name,
	      'owner_name', irr.owner_name,
	      'entries', json(COALESCE((
	        SELECT json_group_array(json_object(
	          'finish_position', ordered_entries.finish_position,
	          'horse_name', ordered_entries.horse_name,
	          'jockey_name', ordered_entries.jockey_name,
	          'sire', ordered_entries.sire,
	          'dam', ordered_entries.dam,
	          'damsire', ordered_entries.damsire,
	          'owner', ordered_entries.owner,
	          'weight', ordered_entries.weight,
	          'finish_time', ordered_entries.finish_time,
	          'margin', ordered_entries.margin,
	          'handicap_point', ordered_entries.handicap_point,
	          'starting_price', ordered_entries.starting_price
	        ))
	        FROM (
	          SELECT
	            re.finish_position,
	            h.canonical_name AS horse_name,
	            j.canonical_name AS jockey_name,
	            h.sire,
	            h.dam,
	            h.damsire,
	            re.owner,
	            re.weight,
	            re.finish_time,
	            re.margin,
	            re.handicap_point,
	            re.starting_price
	          FROM race_entries re
	          JOIN horses h ON h.id = re.horse_id
	          LEFT JOIN jockeys j ON j.id = re.jockey_id
	          WHERE re.race_id = r.id
	          ORDER BY re.finish_position
	        ) ordered_entries
	      ), '[]'))
	    ))
    FROM important_race_results irr
    LEFT JOIN races r ON r.source_race_id = irr.source_race_id
    WHERE irr.race_year = ${Number.parseInt(year, 10)}
      AND (
        irr.race_name = 'GAZİ'
        OR irr.race_name LIKE '%MEHMET AKİF ERSOY%'
        OR irr.race_name LIKE '%SAİT AKSON%'
        OR irr.race_name LIKE '%KISRAK%'
        OR irr.race_name LIKE '%ERKEK TAY DENEME%'
        OR irr.race_name LIKE '%DİŞİ TAY DENEME%'
      )
    ORDER BY COALESCE(r.date, irr.race_date), COALESCE(r.race_no, 999);
  `;

  const output = runSqlite([dbPath, sql]).trim();
  return JSON.parse(output || "[]").filter(Boolean);
};

const enrichRace = (race) => {
  const scored = scoreRace(race);
  return {
    ...scored,
    signalTier: classifySignalTier(scored),
    explanation: buildExplanation(scored)
  };
};

const percentage = (count, total) => {
  return total > 0 ? Math.round((count / total) * 100) : 0;
};

const buildSummary = (routeRaces) => {
  const entries = routeRaces.flatMap((race) => race.entries ?? []);
  const completedRaces = routeRaces.filter((race) => (race.entries?.length ?? 0) > 0);
  const uniqueHorses = new Set(entries.map((entry) => entry.horse_name).filter(Boolean));
  const pedigreeEntries = entries.filter((entry) => entry.sire && entry.dam && entry.damsire);
  const ownerEntries = entries.filter((entry) => entry.owner);
  const jockeyEntries = entries.filter((entry) => entry.jockey_name);

  let analysisState = "awaiting-route-data";
  if (routeRaces.length > 0 && completedRaces.length === routeRaces.length) {
    analysisState = "complete-results";
  } else if (completedRaces.length > 0) {
    analysisState = "partial-results";
  }

  return {
    analysisState,
    raceCount: routeRaces.length,
    completedRaceCount: completedRaces.length,
    pendingRaceCount: routeRaces.length - completedRaces.length,
    entryCount: entries.length,
    uniqueHorseCount: uniqueHorses.size,
    pedigreeCoverage: percentage(pedigreeEntries.length, entries.length),
    ownerCoverage: percentage(ownerEntries.length, entries.length),
    jockeyCoverage: percentage(jockeyEntries.length, entries.length)
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const dbPath = getArgValue(args, "--db") ?? "data/padok.sqlite";
  const year = getArgValue(args, "--year") ?? "2025";
  const outPath = getArgValue(args, "--out") ?? `data/gazi-route-${year}.json`;

  const routeRaces = readRouteRaces(dbPath, year)
    .map(enrichRace)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.race_no ?? 999) - Number(b.race_no ?? 999));
  const payload = {
    generatedAt: new Date().toISOString(),
    dbPath,
    year: Number.parseInt(year, 10),
    summary: buildSummary(routeRaces),
    routeRaces
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ outPath, year, raceCount: routeRaces.length }, null, 2));
};

main();
