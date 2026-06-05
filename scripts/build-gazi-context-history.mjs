import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const getArgValues = (args, name) => {
  return args.flatMap((arg, index) => (arg === name ? [args[index + 1]] : [])).filter(Boolean);
};

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const defaultInputs = async (dataDir = "data") => {
  const files = await readdir(dataDir);
  return files
    .filter((file) => /^gazi-participation-\d{4}\.json$/.test(file))
    .sort()
    .map((file) => join(dataDir, file));
};

const entityValue = (row, type) => {
  if (type === "jockey") return row.gaziJockeyName;
  if (type === "owner") return row.owner;
  if (type === "sire") return row.sire;
  if (type === "dam") return row.dam;
  if (type === "damsire") return row.damsire;
  return null;
};

const addEntity = (index, type, name, row, year) => {
  if (!name || !Number.isFinite(row.gaziFinishPosition)) return;
  const key = `${type}:${name}`;
  const current = index.get(key) ?? {
    entityType: type,
    entityName: name,
    starts: 0,
    wins: 0,
    topThree: 0,
    finishTotal: 0,
    seasons: new Set(),
    horses: new Set()
  };

  current.starts += 1;
  current.wins += row.gaziFinishPosition === 1 ? 1 : 0;
  current.topThree += row.gaziFinishPosition <= 3 ? 1 : 0;
  current.finishTotal += row.gaziFinishPosition;
  current.seasons.add(year);
  current.horses.add(row.horseName);
  index.set(key, current);
};

const scoreEntity = (entity) => {
  const topThreeRate = entity.starts ? Math.round((entity.topThree / entity.starts) * 100) : 0;
  const winRate = entity.starts ? Math.round((entity.wins / entity.starts) * 100) : 0;
  const averageFinish = entity.starts ? Math.round((entity.finishTotal / entity.starts) * 10) / 10 : null;
  const sampleConfidence = Math.min(100, Math.round((entity.starts / 6) * 100));
  const score = Math.round((topThreeRate * 0.56) + (winRate * 0.24) + (sampleConfidence * 0.2));

  return {
    entityType: entity.entityType,
    entityName: entity.entityName,
    starts: entity.starts,
    wins: entity.wins,
    topThree: entity.topThree,
    topThreeRate,
    winRate,
    averageFinish,
    seasonCount: entity.seasons.size,
    distinctHorseCount: entity.horses.size,
    sampleConfidence,
    score
  };
};

const rankByType = (entities) => {
  return entities.reduce((groups, entity) => {
    const list = groups[entity.entityType] ?? [];
    list.push(entity);
    groups[entity.entityType] = list;
    return groups;
  }, {});
};

export const buildContextHistory = async ({ inputPaths }) => {
  const reports = await Promise.all(inputPaths.map(readJson));
  const index = new Map();
  const entityTypes = ["jockey", "owner", "sire", "dam", "damsire"];

  reports.forEach((report) => {
    const year = report.sourceYear;
    (report.rows ?? []).forEach((row) => {
      entityTypes.forEach((type) => addEntity(index, type, entityValue(row, type), row, year));
    });
  });

  const entities = [...index.values()].map(scoreEntity)
    .sort((a, b) => b.score - a.score || b.starts - a.starts || a.entityName.localeCompare(b.entityName, "tr"));
  const byType = rankByType(entities);

  Object.values(byType).forEach((list) => {
    list.sort((a, b) => b.score - a.score || b.starts - a.starts || a.entityName.localeCompare(b.entityName, "tr"));
    list.forEach((entity, index) => {
      entity.rank = index + 1;
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      seasonCount: reports.length,
      yearRange: reports.length
        ? `${Math.min(...reports.map((report) => report.sourceYear))}-${Math.max(...reports.map((report) => report.sourceYear))}`
        : null,
      entityCount: entities.length,
      entityTypeCounts: Object.fromEntries(Object.entries(byType).map(([type, list]) => [type, list.length]))
    },
    entities,
    byType,
    methodology: {
      note: "Context history, tamamlanmış Gazi participation raporlarından jokey, sahip ve soy hattı entity performansını çıkarır.",
      score: "score = topThreeRate * 0.56 + winRate * 0.24 + sampleConfidence * 0.20",
      safeguards: [
        "Bu rapor tamamlanmış sezonların Gazi sonucunu tarihsel context olarak özetler; pre-race scoring için as-of filtreleri ileride ayrıca uygulanmalıdır.",
        "Küçük örnekler sampleConfidence ile sınırlanır.",
        "Sahip ve soy hattı sinyalleri tek başına tahmin sayılmaz; at performansı ve rota sinyaliyle birlikte okunur."
      ]
    }
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const dataDir = getArgValue(args, "--data-dir") ?? "data";
  const inputPaths = getArgValues(args, "--input");
  const outPath = getArgValue(args, "--out") ?? "data/gazi-context-history.json";
  const payload = await buildContextHistory({
    inputPaths: inputPaths.length ? inputPaths : await defaultInputs(dataDir)
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    seasonCount: payload.summary.seasonCount,
    entityCount: payload.summary.entityCount
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-context-history.mjs")) {
  main();
}
