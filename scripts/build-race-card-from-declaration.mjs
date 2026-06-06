import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const defaultRace = {
  id: "2026-06-06-ankara-mehmet-akif-ersoy",
  date: "2026-06-06",
  venue: "Ankara",
  raceNo: 1,
  raceTime: "16:00",
  name: "Mehmet Akif Ersoy Koşusu",
  class: "G2",
  ageBreed: "3 Yaşlı İngilizler",
  distance: 2200,
  surface: "Çim",
  going: "Biraz yumuşak",
  weather: "Az bulutlu",
  temperatureC: 27
};

const defaultSource = {
  name: "TJK Deklareler",
  url: "https://medya-cdn.tjk.org/raporftp/TJKPDF/2026/2026-06-06/PDF/Deklareler/06.06.2026-Ankara-Deklareler-TR.pdf"
};

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const numberArg = (args, name, fallback) => {
  const value = getArgValue(args, name);
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const textArg = (args, name, fallback) => getArgValue(args, name) ?? fallback;

const cleanValue = (value) => {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text.toLocaleUpperCase("tr-TR") === "NULL") return null;
  return text;
};

const parseNumber = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const isScratchStatus = (value) => {
  const status = String(value ?? "").trim().toLocaleUpperCase("tr-TR");
  return ["KOŞMAZ", "KOSMAZ", "SCRATCH", "SCRATCHED", "NON RUNNER", "NON-RUNNER"].includes(status);
};

export const parseDeclarationText = (text) => {
  const entries = [];
  const warnings = [];

  for (const [index, rawLine] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 11) {
      warnings.push({
        lineNumber: index + 1,
        line,
        message: "Declaration row has fewer than 11 pipe-separated columns."
      });
      continue;
    }

    const [
      programNo,
      horseName,
      age,
      sire,
      dam,
      weight,
      jockey,
      trainer,
      owner,
      handicapPoint,
      recentForm,
      status
    ] = parts;

    const entry = {
      programNo: parseNumber(programNo),
      horseName: cleanValue(horseName),
      age: cleanValue(age),
      sire: cleanValue(sire),
      dam: cleanValue(dam),
      weight: parseNumber(weight),
      jockey: cleanValue(jockey),
      trainer: cleanValue(trainer),
      owner: cleanValue(owner),
      handicapPoint: parseNumber(handicapPoint),
      recentForm: cleanValue(recentForm)
    };

    if (isScratchStatus(status)) entry.scratch = true;

    const missingFields = Object.entries(entry)
      .filter(([key, value]) => key !== "jockey" && key !== "scratch" && (value === null || value === undefined))
      .map(([key]) => key);

    if (missingFields.length) {
      warnings.push({
        lineNumber: index + 1,
        programNo: entry.programNo,
        horseName: entry.horseName,
        message: `Declaration row has missing fields: ${missingFields.join(", ")}.`
      });
    }

    entries.push(entry);
  }

  entries.sort((a, b) => (a.programNo ?? 999) - (b.programNo ?? 999));

  return { entries, warnings };
};

export const buildRaceCardFromDeclaration = ({ text, race = defaultRace, source = defaultSource }) => {
  const parsed = parseDeclarationText(text);

  return {
    generatedAt: new Date().toISOString(),
    source,
    race,
    entries: parsed.entries,
    quality: {
      warningCount: parsed.warnings.length,
      warnings: parsed.warnings
    }
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const inputPath = getArgValue(args, "--input") ?? "data/race-cards/sources/2026-06-06-ankara-mehmet-akif-ersoy.txt";
  const outPath = getArgValue(args, "--out") ?? "data/race-cards/2026-06-06-ankara-mehmet-akif-ersoy.json";
  const text = await readFile(inputPath, "utf8");
  const race = {
    id: textArg(args, "--id", defaultRace.id),
    date: textArg(args, "--date", defaultRace.date),
    venue: textArg(args, "--venue", defaultRace.venue),
    raceNo: numberArg(args, "--race-no", defaultRace.raceNo),
    raceTime: textArg(args, "--race-time", defaultRace.raceTime),
    name: textArg(args, "--name", defaultRace.name),
    class: textArg(args, "--class", defaultRace.class),
    ageBreed: textArg(args, "--age-breed", defaultRace.ageBreed),
    distance: numberArg(args, "--distance", defaultRace.distance),
    surface: textArg(args, "--surface", defaultRace.surface),
    going: textArg(args, "--going", defaultRace.going),
    weather: textArg(args, "--weather", defaultRace.weather),
    temperatureC: numberArg(args, "--temperature-c", defaultRace.temperatureC)
  };
  const source = {
    name: textArg(args, "--source-name", defaultSource.name),
    url: textArg(args, "--source-url", defaultSource.url)
  };
  const payload = buildRaceCardFromDeclaration({ text, race, source });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    race: payload.race.name,
    entryCount: payload.entries.length,
    scratchCount: payload.entries.filter((entry) => entry.scratch).length,
    warningCount: payload.quality.warningCount
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-race-card-from-declaration.mjs")) {
  main();
}
