import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

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

export const distanceScore = (distanceM) => {
  const distance = Number(distanceM);
  if (!Number.isFinite(distance)) return 0;
  if (distance === 2400) return 35;
  if (distance >= 2100 && distance <= 2300) return 30;
  if (distance === 2000) return 22;
  if (distance >= 1800 && distance < 2000) return 16;
  if (distance === 1600) return 11;
  return Math.max(0, 12 - Math.round(Math.abs(distance - 2400) / 100));
};

export const surfaceScore = (surface) => {
  if (surface === "Çim") return 25;
  if (surface === "Sentetik") return 8;
  return 0;
};

export const breedScore = (breed) => {
  return breed === "İngiliz" ? 20 : 0;
};

export const ageScore = (ageCondition) => {
  const text = String(ageCondition ?? "").toLocaleLowerCase("tr-TR");
  if (text.includes("3 yaşlı") && text.includes("ingiliz")) return 15;
  if (text.includes("3 ve yukarı") && text.includes("ingiliz")) return 5;
  return 0;
};

export const classScore = (raceClass) => {
  const text = String(raceClass ?? "").toLocaleUpperCase("tr-TR");
  if (/\bG\s*1\b/.test(text)) return 5;
  if (/\bG\s*2\b/.test(text)) return 4;
  if (/\bG\s*3\b/.test(text)) return 3;
  if (text.includes("A 2") || text.includes("A 3")) return 2;
  if (text.includes("KV")) return 1;
  return 0;
};

export const normalizeName = (value) => {
  return String(value ?? "").toLocaleUpperCase("tr-TR");
};

export const classifyNamedPrep = (name) => {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  if (normalized === "GAZİ") return "target-race";
  if (normalized.includes("MEHMET AKİF ERSOY")) return "core-prep";
  if (normalized.includes("SAİT AKSON")) return "core-prep";
  if (normalized.includes("KISRAK")) return "core-prep";
  if (normalized.includes("ERKEK TAY DENEME")) return "classic-speed";
  if (normalized.includes("DİŞİ TAY DENEME")) return "classic-speed";
  return null;
};

export const scoreRace = (race) => {
  const factors = {
    distance: distanceScore(race.distance_m),
    surface: surfaceScore(race.surface),
    breed: breedScore(race.breed),
    age: ageScore(race.age_condition),
    class: classScore(race.race_class)
  };

  return {
    ...race,
    factors,
    similarityScore: Object.values(factors).reduce((sum, value) => sum + value, 0)
  };
};

export const classifySignalTier = (race) => {
  const namedPrep = classifyNamedPrep(race.name);
  if (namedPrep) return namedPrep;

  const isThreeYearOldEnglish = race.breed === "İngiliz" && ageScore(race.age_condition) === 15;
  const isTurf = race.surface === "Çim";
  const distance = Number(race.distance_m);

  if (isThreeYearOldEnglish && isTurf && distance >= 2000) return "core-prep";
  if (isThreeYearOldEnglish && distance >= 2000) return "stamina-proxy";
  if (isThreeYearOldEnglish && isTurf && distance >= 1500 && distance <= 1700) return "classic-speed";
  if (race.breed === "İngiliz" && isTurf) return "surface-breed";
  return "weak-context";
};

export const buildExplanation = (race) => {
  const notes = [];
  if (race.factors.distance >= 30) notes.push("Gazi mesafesine çok yakın");
  else if (race.factors.distance >= 20) notes.push("orta-uzun mesafe sinyali");
  else if (race.factors.distance > 0) notes.push("zayıf mesafe sinyali");

  if (race.factors.surface === 25) notes.push("çim pist uyumu");
  if (race.factors.breed === 20) notes.push("İngiliz at koşusu");
  if (race.factors.age === 15) notes.push("3 yaşlı İngiliz profili");
  if (race.factors.class > 0) notes.push("sınıf sinyali var");
  if (race.name) notes.push(`${race.name} isimli koşusu`);

  return notes.join(", ");
};

export const readRaces = (dbPath, year) => {
  const yearFilter = year ? `WHERE strftime('%Y', date) = '${year.replace(/'/g, "''")}'` : "";
  const sql = `
    SELECT json_group_array(json_object(
      'id', id,
      'source_race_id', source_race_id,
      'date', date,
      'venue', venue,
      'race_no', race_no,
      'name', name,
      'race_class', race_class,
      'age_condition', age_condition,
      'breed', breed,
      'sex_condition', sex_condition,
      'distance_m', distance_m,
      'surface', surface,
      'winner_time', winner_time
    ))
    FROM races
    ${yearFilter};
  `;
  const output = runSqlite([dbPath, sql]).trim();
  return JSON.parse(output || "[]").filter(Boolean);
};

const main = async () => {
  const args = process.argv.slice(2);
  const dbPath = getArgValue(args, "--db") ?? "data/padok.sqlite";
  const year = getArgValue(args, "--year");
  const limit = Number.parseInt(getArgValue(args, "--limit") ?? "20", 10);
  const outPath = getArgValue(args, "--out");

  const races = readRaces(dbPath, year)
    .map(scoreRace)
    .map((race) => ({ ...race, signalTier: classifySignalTier(race), explanation: buildExplanation(race) }))
    .sort((a, b) => b.similarityScore - a.similarityScore || a.date.localeCompare(b.date))
    .slice(0, Number.isFinite(limit) ? limit : 20);

  const payload = {
    dbPath,
    year: year ?? null,
    targetProfile: {
      age: "3 yaşlı",
      breed: "İngiliz",
      surface: "Çim",
      distanceM: 2400
    },
    count: races.length,
    races
  };

  const json = `${JSON.stringify(payload, null, 2)}\n`;

  if (outPath) {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, "utf8");
  }

  console.log(json);
};

if (process.argv[1]?.endsWith("score-gazi-race-similarity.mjs")) {
  main();
}
