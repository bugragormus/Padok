import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const escapeSql = (value) => {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
};

const runSqlite = (args) => {
  const result = spawnSync("sqlite3", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "sqlite3 failed");
  }
  return result.stdout;
};

const routeRaceFilter = `
  (
    r.name = 'GAZİ'
    OR r.name LIKE '%MEHMET AKİF ERSOY%'
    OR r.name LIKE '%SAİT AKSON%'
    OR r.name LIKE '%KISRAK%'
    OR r.name LIKE '%ERKEK TAY DENEME%'
    OR r.name LIKE '%DİŞİ TAY DENEME%'
  )
`;

const readContext = (dbPath, year, asOfDate, minStarts, limitPerType) => {
  const sql = `
    WITH context_entries AS (
      SELECT
        r.date,
        r.name AS race_name,
        re.finish_position,
        re.owner,
        h.id AS horse_id,
        h.canonical_name AS horse_name,
        h.sire,
        h.dam,
        h.damsire
      FROM race_entries re
      JOIN races r ON r.id = re.race_id
      JOIN horses h ON h.id = re.horse_id
      WHERE CAST(strftime('%Y', r.date) AS INTEGER) = ${Number.parseInt(year, 10)}
        AND r.date < ${escapeSql(asOfDate)}
        AND ${routeRaceFilter}
    ),
    entities AS (
      SELECT 'sire' AS entity_type, sire AS entity_name, * FROM context_entries WHERE sire IS NOT NULL
      UNION ALL
      SELECT 'dam' AS entity_type, dam AS entity_name, * FROM context_entries WHERE dam IS NOT NULL
      UNION ALL
      SELECT 'damsire' AS entity_type, damsire AS entity_name, * FROM context_entries WHERE damsire IS NOT NULL
      UNION ALL
      SELECT 'owner' AS entity_type, owner AS entity_name, * FROM context_entries WHERE owner IS NOT NULL
    ),
    summary AS (
      SELECT
        entity_type,
        entity_name,
        COUNT(*) AS starts,
        COUNT(DISTINCT horse_id) AS distinct_horses,
        SUM(CASE WHEN finish_position = 1 THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN finish_position BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS top_three,
        ROUND(AVG(finish_position), 2) AS average_finish,
        ROUND(100.0 * SUM(CASE WHEN finish_position BETWEEN 1 AND 3 THEN 1 ELSE 0 END) / COUNT(*), 1) AS top_three_rate,
        ROUND(MIN(1.0, COUNT(*) / 10.0), 2) AS sample_confidence
      FROM entities
      GROUP BY entity_type, entity_name
    ),
    ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY entity_type
          ORDER BY top_three_rate DESC, starts DESC, entity_name
        ) AS entity_rank
      FROM summary
      WHERE starts >= ${Number.parseInt(minStarts, 10)}
    )
    SELECT json_group_array(json_object(
      'entityType', entity_type,
      'entityName', entity_name,
      'starts', starts,
      'distinctHorses', distinct_horses,
      'wins', wins,
      'topThree', top_three,
      'averageFinish', average_finish,
      'topThreeRate', top_three_rate,
      'sampleConfidence', sample_confidence
    ))
    FROM (
      SELECT *
      FROM ranked
      WHERE entity_rank <= ${Number.parseInt(limitPerType, 10)}
      ORDER BY entity_type, top_three_rate DESC, starts DESC, entity_name
    );
  `;

  return JSON.parse(runSqlite([dbPath, sql]).trim() || "[]").filter(Boolean);
};

const main = async () => {
  const args = process.argv.slice(2);
  const dbPath = getArgValue(args, "--db") ?? "data/padok.sqlite";
  const year = getArgValue(args, "--year") ?? "2025";
  const asOfDate = getArgValue(args, "--as-of-date") ?? `${year}-06-29`;
  const minStarts = getArgValue(args, "--min-starts") ?? "2";
  const limitPerType = getArgValue(args, "--limit-per-type") ?? "20";
  const outPath = getArgValue(args, "--out");
  const context = readContext(dbPath, year, asOfDate, minStarts, limitPerType);
  const payload = {
    generatedAt: new Date().toISOString(),
    dbPath,
    year: Number.parseInt(year, 10),
    asOfDate,
    minStarts: Number.parseInt(minStarts, 10),
    limitPerType: Number.parseInt(limitPerType, 10),
    context
  };
  const output = `${JSON.stringify(payload, null, 2)}\n`;

  if (outPath) {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, output, "utf8");
  }

  console.log(output.trim());
};

main();
