import { spawnSync } from "node:child_process";
import { findTjkCity } from "./tjk-city-map.mjs";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const escapeSql = (value) => {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
};

const toDisplayDate = (value) => {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
};

const runSqlite = (args) => {
  const result = spawnSync("sqlite3", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "sqlite3 failed");
  }
  return result.stdout;
};

const runNodeScript = (scriptPath, args) => {
  const result = spawnSync("node", [scriptPath, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${scriptPath} failed`);
  }
  return JSON.parse(result.stdout);
};

const routeRaceWhereClause = (year) => `
  irr.race_year = ${Number.parseInt(year, 10)}
  AND (
    irr.race_name = 'GAZİ'
    OR irr.race_name LIKE '%MEHMET AKİF ERSOY%'
    OR irr.race_name LIKE '%SAİT AKSON%'
    OR irr.race_name LIKE '%KISRAK%'
    OR irr.race_name LIKE '%ERKEK TAY DENEME%'
    OR irr.race_name LIKE '%DİŞİ TAY DENEME%'
  )
`;

const expectedVenueSql = `
  CASE
    WHEN irr.race_name LIKE '%MEHMET AKİF ERSOY%' THEN 'Ankara'
    WHEN irr.race_name = 'GAZİ' THEN 'İstanbul'
    WHEN irr.race_name LIKE '%SAİT AKSON%' THEN 'İstanbul'
    WHEN irr.race_name LIKE '%KISRAK%' THEN 'İstanbul'
    WHEN irr.race_name LIKE '%ERKEK TAY DENEME%' THEN 'İstanbul'
    WHEN irr.race_name LIKE '%DİŞİ TAY DENEME%' THEN 'İstanbul'
    ELSE r.venue
  END
`;

const readMissingDailyGroups = (dbPath, year, today) => {
  const sql = `
    SELECT json_group_array(json_object(
      'date', route.date,
      'venue', route.venue,
      'missingRaceCount', route.missing_race_count
    ))
    FROM (
      SELECT
        COALESCE(r.date, irr.race_date) AS date,
        COALESCE(r.venue, ${expectedVenueSql}) AS venue,
        SUM(CASE WHEN (
          SELECT COUNT(*)
          FROM race_entries re
          WHERE re.race_id = r.id
        ) > 0 THEN 0 ELSE 1 END) AS missing_race_count
      FROM important_race_results irr
      LEFT JOIN races r ON r.source_race_id = irr.source_race_id
      WHERE ${routeRaceWhereClause(year)}
        AND COALESCE(r.date, irr.race_date) <= ${escapeSql(today)}
      GROUP BY COALESCE(r.date, irr.race_date), COALESCE(r.venue, ${expectedVenueSql})
      HAVING missing_race_count > 0
      ORDER BY COALESCE(r.date, irr.race_date), r.venue
    ) route;
  `;

  return JSON.parse(runSqlite([dbPath, sql]).trim() || "[]").filter(Boolean);
};

const main = async () => {
  const args = process.argv.slice(2);
  const dbPath = getArgValue(args, "--db") ?? "data/padok.sqlite";
  const year = getArgValue(args, "--year") ?? "2025";
  const today = getArgValue(args, "--today") ?? new Date().toISOString().slice(0, 10);
  const outPath = getArgValue(args, "--out") ?? "data/gazi-route-report.json";

  const groups = readMissingDailyGroups(dbPath, year, today);
  const fetched = [];
  const skipped = [];

  for (const group of groups) {
    const city = findTjkCity(group.venue);
    if (!city) {
      skipped.push({ ...group, reason: "missing_city_mapping" });
      continue;
    }

    const fetchResult = runNodeScript("scripts/fetch-tjk-daily-results.mjs", [
      "--city-id", city.id,
      "--city-name", city.name,
      "--date", toDisplayDate(group.date)
    ]);

    runNodeScript("scripts/import-tjk-daily-results.mjs", ["--input", fetchResult.processedPath, "--db", dbPath]);
    fetched.push({ ...group, cityId: city.id, processedPath: fetchResult.processedPath });
  }

  const exportResult = runNodeScript("scripts/export-gazi-route-report.mjs", [
    "--year", year,
    "--db", dbPath,
    "--out", outPath
  ]);

  console.log(JSON.stringify({ dbPath, year, today, fetched, skipped, exportResult }, null, 2));
};

main();
