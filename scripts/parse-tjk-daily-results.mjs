import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { stripTags } from "./parse-tjk-kosu-sorgulama.mjs";

const entryFields = {
  finishPosition: "SONUCNO",
  horse: "AtAdi3",
  age: "Yas",
  pedigree: "Baba",
  weight: "Kilo",
  jockey: "JokeAdi",
  owner: "SahipAdi",
  trainer: "AntronorAdi",
  finishTime: "Derece",
  winOdds: "Gny",
  agf: "AGFORAN",
  gate: "StartId",
  margin: "Fark",
  lateStart: "GecCikis",
  handicapPoint: "Hc"
};

const extractFirstAnchor = (html) => {
  const match = String(html ?? "").match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
  if (!match) return { text: stripTags(html), href: "", title: "" };

  const attrs = match[1];
  const title = attrs.match(/title=["']([^"']+)["']/i)?.[1] ?? "";
  const href = attrs.match(/href=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&") ?? "";
  return { text: stripTags(match[2]), href, title: stripTags(title) };
};

const extractQueryId = (href, key) => {
  const match = String(href ?? "").match(new RegExp(`${key}=([^&]+)`));
  return match ? decodeURIComponent(match[1]) : "";
};

const normalizeHorseName = (value) => {
  return String(value ?? "")
    .replace(/\(\d+\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
};

const extractCell = (rowHtml, classSuffix) => {
  const pattern = new RegExp(`<td[^>]*class=["'][^"']*gunluk-GunlukYarisSonuclari-${classSuffix}[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, "i");
  return rowHtml.match(pattern)?.[1] ?? "";
};

const parseEntry = (rowHtml) => {
  const cells = Object.fromEntries(
    Object.entries(entryFields).map(([field, suffix]) => [field, extractCell(rowHtml, suffix)])
  );

  const horseLink = extractFirstAnchor(cells.horse);
  const jockeyLink = extractFirstAnchor(cells.jockey);
  const ownerLink = extractFirstAnchor(cells.owner);
  const trainerLink = extractFirstAnchor(cells.trainer);

  return {
    finishPosition: stripTags(cells.finishPosition),
    horseId: extractQueryId(horseLink.href, "QueryParameter_AtId"),
    horseName: normalizeHorseName(horseLink.text),
    age: stripTags(cells.age),
    pedigree: stripTags(cells.pedigree),
    weight: stripTags(cells.weight).match(/\d+(?:[,.]\d+)?/)?.[0]?.replace(",", ".") ?? "",
    jockeyId: extractQueryId(jockeyLink.href, "QueryParameter_JokeyId"),
    jockeyName: jockeyLink.title || jockeyLink.text,
    jockeyShortName: jockeyLink.text,
    ownerName: ownerLink.title || ownerLink.text,
    trainerId: extractQueryId(trainerLink.href, "QueryParameter_AntrenorId"),
    trainerName: trainerLink.title || trainerLink.text,
    trainerShortName: trainerLink.text,
    finishTime: stripTags(cells.finishTime),
    winOdds: stripTags(cells.winOdds),
    agf: stripTags(cells.agf),
    gate: stripTags(cells.gate),
    margin: stripTags(cells.margin),
    lateStart: stripTags(cells.lateStart),
    handicapPoint: stripTags(cells.handicapPoint)
  };
};

export const parseDailyResults = (html) => {
  const raceBlocks = [...String(html).matchAll(/<div id=["']kosubilgisi-(\d+)["'][^>]*>([\s\S]*?)(?=<div id=["']kosubilgisi-\d+["']|<input type=["']hidden["'] class=["']totalKosuSayisi|$)/gi)];

  return raceBlocks.map(([, sourceRaceId, blockHtml]) => {
    const rows = [...blockHtml.matchAll(/<tr class=["'](?:even|odd)["']>([\s\S]*?)<\/tr>/gi)].map(([, rowHtml]) => parseEntry(rowHtml));

    return {
      sourceRaceId,
      entries: rows.filter((entry) => entry.horseName)
    };
  });
};

export const parseFile = async (inputPath) => {
  const html = await readFile(inputPath, "utf8");
  return parseDailyResults(html);
};

const main = async () => {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error("Usage: node scripts/parse-tjk-daily-results.mjs <html-file>");
    process.exit(1);
  }

  const races = await parseFile(inputPath);
  console.log(JSON.stringify(races, null, 2));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
