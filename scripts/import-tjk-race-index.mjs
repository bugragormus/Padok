import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const sourceName = "TJK KosuSorgulama";
const sourceBaseUrl = "https://www.tjk.org/TR/YarisSever/Query/DataRows/KosuSorgulama";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
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
  const match = String(value ?? "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
};

const inferBreed = (raceGroup) => {
  const text = String(raceGroup ?? "").toLocaleLowerCase("tr-TR");
  if (text.includes("ingiliz")) return "İngiliz";
  if (text.includes("arap")) return "Arap";
  return null;
};

const inferSexCondition = (raceType) => {
  const text = String(raceType ?? "").toLocaleLowerCase("tr-TR");
  if (text.includes("/dişi") || text.includes("dişi")) return "Dişi";
  if (text.includes("/erkek") || text.includes("erkek")) return "Erkek";
  return null;
};

const normalizeRace = (row) => {
  return {
    sourceRaceId: row.sourceRaceId,
    date: parseDate(row.date),
    venue: row.city,
    raceNo: row.raceNo,
    raceClass: row.raceType,
    ageCondition: row.raceGroup,
    breed: inferBreed(row.raceGroup),
    sexCondition: inferSexCondition(row.raceType),
    distanceM: row.distanceMeters,
    surface: row.surface,
    winnerTime: row.winnerTime
  };
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
    const race = normalizeRace(row);
    if (!race.sourceRaceId || !race.date || !race.venue) continue;

    statements.push(`INSERT INTO races (
        source_id,
        source_race_id,
        date,
        venue,
        race_no,
        name,
        race_class,
        age_condition,
        breed,
        sex_condition,
        distance_m,
        surface,
        winner_time
      )
      VALUES (
        (SELECT id FROM sources WHERE name = ${escapeSql(sourceName)}),
        ${escapeSql(race.sourceRaceId)},
        ${escapeSql(race.date)},
        ${escapeSql(race.venue)},
        ${toIntegerSql(race.raceNo)},
        NULL,
        ${escapeSql(race.raceClass)},
        ${escapeSql(race.ageCondition)},
        ${escapeSql(race.breed)},
        ${escapeSql(race.sexCondition)},
        ${toIntegerSql(race.distanceM)},
        ${escapeSql(race.surface)},
        ${escapeSql(race.winnerTime)}
      )
      ON CONFLICT(source_id, source_race_id) DO UPDATE SET
        date = excluded.date,
        venue = excluded.venue,
        race_no = excluded.race_no,
        race_class = excluded.race_class,
        age_condition = excluded.age_condition,
        breed = excluded.breed,
        sex_condition = excluded.sex_condition,
        distance_m = excluded.distance_m,
        surface = excluded.surface,
        winner_time = excluded.winner_time;`);
  }

  statements.push("COMMIT;");
  return `${statements.join("\n")}\n`;
};

const runSqlite = (args) => {
  const result = spawnSync("sqlite3", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "sqlite3 failed");
  }
  return result.stdout;
};

const main = async () => {
  const args = process.argv.slice(2);
  const inputPath = getArgValue(args, "--input") ?? args[0];
  const dbPath = getArgValue(args, "--db") ?? "data/padok.sqlite";

  if (!inputPath) {
    console.error("Usage: node scripts/import-tjk-race-index.mjs --input <processed-json> [--db data/padok.sqlite]");
    process.exit(1);
  }

  const payload = JSON.parse(await readFile(inputPath, "utf8"));
  const tempDir = await mkdtemp(join(tmpdir(), "padok-import-"));
  const importSqlPath = join(tempDir, "import.sql");

  try {
    runSqlite([dbPath, ".read db/schema.sql"]);
    await writeFile(importSqlPath, buildSql(payload.rows ?? []), "utf8");
    runSqlite([dbPath, `.read ${importSqlPath}`]);

    const importedCount = runSqlite([
      dbPath,
      `SELECT COUNT(*) FROM races WHERE source_id = (SELECT id FROM sources WHERE name = '${sourceName}');`
    ]).trim();

    console.log(JSON.stringify({ dbPath, inputPath, inputRows: payload.rows?.length ?? 0, importedRaceCount: Number(importedCount) }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

main();
