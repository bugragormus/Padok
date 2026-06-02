import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const raceSourceName = "TJK KosuSorgulama";
const raceSourceBaseUrl = "https://www.tjk.org/TR/YarisSever/Query/DataRows/KosuSorgulama";

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

const toRealSql = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0] ?? "");
  return Number.isFinite(parsed) ? String(parsed) : "NULL";
};

const runSqlite = (args) => {
  const result = spawnSync("sqlite3", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "sqlite3 failed");
  }
  return result.stdout;
};

const ensureRuntimeSchema = (dbPath) => {
  const sql = `
    ALTER TABLE horses ADD COLUMN source_horse_id TEXT;
    ALTER TABLE jockeys ADD COLUMN source_jockey_id TEXT;
    ALTER TABLE trainers ADD COLUMN source_trainer_id TEXT;
    ALTER TABLE race_entries ADD COLUMN owner TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_horses_source_horse_id ON horses(source_horse_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_jockeys_source_jockey_id ON jockeys(source_jockey_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trainers_source_trainer_id ON trainers(source_trainer_id);
  `;

  for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
    const result = spawnSync("sqlite3", [dbPath, `${statement};`], { encoding: "utf8" });
    const stderr = result.stderr ?? "";
    if (result.status !== 0 && !stderr.includes("duplicate column name") && !stderr.includes("no such table")) {
      throw new Error(stderr || result.stdout || "sqlite3 migration failed");
    }
  }
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

const buildSql = (races) => {
  const statements = [
    "PRAGMA foreign_keys = ON;",
    "BEGIN;",
    `INSERT INTO sources (name, base_url, reliability)
      VALUES (${escapeSql(raceSourceName)}, ${escapeSql(raceSourceBaseUrl)}, 'official')
      ON CONFLICT(name) DO UPDATE SET
        base_url = excluded.base_url,
        reliability = excluded.reliability;`
  ];

  for (const race of races) {
    if (race.sourceRaceId && race.date && race.venue) {
      statements.push(`INSERT INTO races (
          source_id,
          source_race_id,
          date,
          venue,
          race_no,
          name,
          race_class,
          distance_m,
          surface
        )
        VALUES (
          (SELECT id FROM sources WHERE name = ${escapeSql(raceSourceName)}),
          ${escapeSql(race.sourceRaceId)},
          ${escapeSql(race.date)},
          ${escapeSql(race.venue)},
          ${toIntegerSql(race.raceNo)},
          (SELECT race_name FROM important_race_results WHERE source_race_id = ${escapeSql(race.sourceRaceId)} LIMIT 1),
          (SELECT race_class FROM important_race_results WHERE source_race_id = ${escapeSql(race.sourceRaceId)} LIMIT 1),
          (SELECT distance_m FROM important_race_results WHERE source_race_id = ${escapeSql(race.sourceRaceId)} LIMIT 1),
          (SELECT surface FROM important_race_results WHERE source_race_id = ${escapeSql(race.sourceRaceId)} LIMIT 1)
        )
        ON CONFLICT(source_id, source_race_id) DO UPDATE SET
          date = excluded.date,
          venue = excluded.venue,
          race_no = excluded.race_no,
          name = COALESCE(races.name, excluded.name),
          race_class = COALESCE(races.race_class, excluded.race_class),
          distance_m = COALESCE(races.distance_m, excluded.distance_m),
          surface = COALESCE(races.surface, excluded.surface);`);
    }

    const raceIdSql = `(SELECT id FROM races
      WHERE source_race_id = ${escapeSql(race.sourceRaceId)}
         OR (
          date = ${escapeSql(race.date)}
          AND venue = ${escapeSql(race.venue)}
          AND race_no = ${toIntegerSql(race.raceNo)}
        )
      ORDER BY CASE WHEN source_race_id = ${escapeSql(race.sourceRaceId)} THEN 0 ELSE 1 END
      LIMIT 1)`;

    for (const entry of race.entries ?? []) {
      if (!race.sourceRaceId || !entry.horseName) continue;

      statements.push(`INSERT INTO horses (source_horse_id, canonical_name)
        VALUES (${escapeSql(entry.horseId)}, ${escapeSql(entry.horseName)})
        ON CONFLICT(source_horse_id) DO UPDATE SET canonical_name = excluded.canonical_name;`);

      if (entry.jockeyName) {
        statements.push(`INSERT INTO jockeys (source_jockey_id, canonical_name)
          VALUES (${escapeSql(entry.jockeyId)}, ${escapeSql(entry.jockeyName)})
          ON CONFLICT(source_jockey_id) DO UPDATE SET canonical_name = excluded.canonical_name;`);
      }

      if (entry.trainerName) {
        statements.push(`INSERT INTO trainers (source_trainer_id, canonical_name)
          VALUES (${escapeSql(entry.trainerId)}, ${escapeSql(entry.trainerName)})
          ON CONFLICT(source_trainer_id) DO UPDATE SET canonical_name = excluded.canonical_name;`);
      }

      statements.push(`INSERT INTO race_entries (
          race_id,
          horse_id,
          jockey_id,
          trainer_id,
          gate,
          weight,
          handicap_point,
          starting_price,
          finish_position,
          finish_time,
          margin,
          scratched,
          owner
	        )
	        VALUES (
	          ${raceIdSql},
	          (SELECT id FROM horses WHERE source_horse_id = ${escapeSql(entry.horseId)}),
	          (SELECT id FROM jockeys WHERE source_jockey_id = ${escapeSql(entry.jockeyId)}),
          (SELECT id FROM trainers WHERE source_trainer_id = ${escapeSql(entry.trainerId)}),
          ${toIntegerSql(entry.gate)},
          ${toRealSql(entry.weight)},
          ${toRealSql(entry.handicapPoint)},
          ${escapeSql(entry.winOdds)},
          ${toIntegerSql(entry.finishPosition)},
          ${escapeSql(entry.finishTime)},
          ${escapeSql(entry.margin)},
          0,
          ${escapeSql(entry.ownerName)}
        )
        ON CONFLICT(race_id, horse_id) DO UPDATE SET
          jockey_id = excluded.jockey_id,
          trainer_id = excluded.trainer_id,
          gate = excluded.gate,
          weight = excluded.weight,
          handicap_point = excluded.handicap_point,
          starting_price = excluded.starting_price,
          finish_position = excluded.finish_position,
          finish_time = excluded.finish_time,
          margin = excluded.margin,
          owner = excluded.owner;`);
    }
  }

  statements.push("COMMIT;");
  return `${statements.join("\n")}\n`;
};

const main = async () => {
  const args = process.argv.slice(2);
  const inputPaths = await resolveInputPaths(args);
  const dbPath = getArgValue(args, "--db") ?? "data/padok.sqlite";

  if (inputPaths.length === 0) {
    console.error("Usage: node scripts/import-tjk-daily-results.mjs --input <processed-json-or-directory> [--db data/padok.sqlite]");
    process.exit(1);
  }

  const tempDir = await mkdtemp(join(tmpdir(), "padok-daily-import-"));
  const importSqlPath = join(tempDir, "import.sql");
  let raceCount = 0;
  let entryCount = 0;

  try {
    ensureRuntimeSchema(dbPath);
    runSqlite([dbPath, ".read db/schema.sql"]);
    ensureRuntimeSchema(dbPath);

    const races = [];
    for (const inputPath of inputPaths) {
      const payload = JSON.parse(await readFile(inputPath, "utf8"));
      races.push(...(payload.races ?? []));
      raceCount += payload.races?.length ?? 0;
      entryCount += (payload.races ?? []).reduce((sum, race) => sum + (race.entries?.length ?? 0), 0);
    }

    await writeFile(importSqlPath, buildSql(races), "utf8");
    runSqlite([dbPath, `.read ${importSqlPath}`]);

    const importedEntries = runSqlite([dbPath, "SELECT COUNT(*) FROM race_entries;"]).trim();

    console.log(JSON.stringify({ dbPath, importedFiles: inputPaths.length, raceCount, entryCount, importedEntries: Number(importedEntries) }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

main();
