import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const sourceName = "TJK TumOnemliKosular";
const sourceBaseUrl = "https://www.tjk.org/TR/YarisSever/Query/DataRows/TumOnemliKosular";

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

const escapeSql = (value) => {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
};

const toIntegerSql = (value) => {
  const parsed = Number.parseInt(String(value ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) ? String(parsed) : "NULL";
};

const parseDate = (value) => {
  const match = String(value ?? "").match(/^(\d{1,2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day.padStart(2, "0")}`;
};

const runSqlite = (args) => {
  const result = spawnSync("sqlite3", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "sqlite3 failed");
  }
  return result.stdout;
};

const resolveInputPaths = async (args) => {
  const directInputs = getRepeatedArgValues(args, "--input");
  const positionalInputs = args.filter((arg, index) => index === 0 && !arg.startsWith("--"));
  const inputPaths = [...directInputs, ...positionalInputs];

  const resolved = [];
  for (const inputPath of inputPaths) {
    const inputStat = await stat(inputPath);
    if (!inputStat.isDirectory()) {
      resolved.push(inputPath);
      continue;
    }

    const entries = await readdir(inputPath);
    resolved.push(
      ...entries
        .filter((entry) => entry.endsWith(".json"))
        .sort()
        .map((entry) => join(inputPath, entry))
    );
  }

  return resolved;
};

const buildSql = (rows) => {
  const statements = [
    "PRAGMA foreign_keys = ON;",
    "BEGIN;",
    `INSERT INTO sources (name, base_url, reliability)
      VALUES (${escapeSql(sourceName)}, ${escapeSql(sourceBaseUrl)}, 'official')
      ON CONFLICT(name) DO UPDATE SET
        base_url = excluded.base_url,
        reliability = excluded.reliability;`
  ];

  for (const row of rows) {
    if (!row.sourceRaceId || !row.raceName) continue;

    statements.push(`INSERT INTO important_race_results (
        source_id,
        source_race_id,
        race_year,
        race_date,
        race_name,
        winner_name,
        race_class,
        jockey_name,
        owner_name,
        distance_m,
        surface,
        winner_time,
        prize,
        result_href
      )
      VALUES (
        (SELECT id FROM sources WHERE name = ${escapeSql(sourceName)}),
        ${escapeSql(row.sourceRaceId)},
        ${toIntegerSql(row.year)},
        ${escapeSql(parseDate(row.raceDate))},
        ${escapeSql(row.raceName)},
        ${escapeSql(row.winner)},
        ${escapeSql(row.raceClass)},
        ${escapeSql(row.jockey)},
        ${escapeSql(row.owner)},
        ${toIntegerSql(row.distanceMeters)},
        ${escapeSql(row.surface)},
        ${escapeSql(row.winnerTime)},
        ${escapeSql(row.prize)},
        ${escapeSql(row.resultHref)}
      )
      ON CONFLICT(source_id, source_race_id) DO UPDATE SET
        race_year = excluded.race_year,
        race_date = excluded.race_date,
        race_name = excluded.race_name,
        winner_name = excluded.winner_name,
        race_class = excluded.race_class,
        jockey_name = excluded.jockey_name,
        owner_name = excluded.owner_name,
        distance_m = excluded.distance_m,
        surface = excluded.surface,
        winner_time = excluded.winner_time,
        prize = excluded.prize,
        result_href = excluded.result_href;`);

    statements.push(`UPDATE races
      SET name = ${escapeSql(row.raceName)}
      WHERE source_race_id = ${escapeSql(row.sourceRaceId)};`);
  }

  statements.push("COMMIT;");
  return `${statements.join("\n")}\n`;
};

const main = async () => {
  const args = process.argv.slice(2);
  const inputPaths = await resolveInputPaths(args);
  const dbPath = getArgValue(args, "--db") ?? "data/padok.sqlite";

  if (inputPaths.length === 0) {
    console.error("Usage: node scripts/import-tjk-named-races.mjs --input <processed-json-or-directory> [--db data/padok.sqlite]");
    process.exit(1);
  }

  const tempDir = await mkdtemp(join(tmpdir(), "padok-named-import-"));
  const importSqlPath = join(tempDir, "import.sql");
  let inputRows = 0;

  try {
    runSqlite([dbPath, ".read db/schema.sql"]);

    const rows = [];
    for (const inputPath of inputPaths) {
      const payload = JSON.parse(await readFile(inputPath, "utf8"));
      rows.push(...(payload.rows ?? []));
      inputRows += payload.rows?.length ?? 0;
    }

    await writeFile(importSqlPath, buildSql(rows), "utf8");
    runSqlite([dbPath, `.read ${importSqlPath}`]);

    const namedCount = runSqlite([dbPath, "SELECT COUNT(*) FROM important_race_results;"]).trim();
    const matchedCount = runSqlite([dbPath, "SELECT COUNT(*) FROM races WHERE name IS NOT NULL;"]).trim();

    console.log(JSON.stringify({ dbPath, importedFiles: inputPaths.length, inputRows, namedRaceCount: Number(namedCount), matchedRaceCount: Number(matchedCount) }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

main();
