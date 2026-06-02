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

const extractProgramVenue = (html) => {
  const match = String(html ?? "").match(/<div class=["']program["'] id=["']([^"']+)["']/i);
  return stripTags(match?.[1] ?? "");
};

const parseRaceTabs = (html) => {
  const tabs = new Map();
  const anchors = [...String(html ?? "").matchAll(/<a\b([^>]*)href=["']#(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  for (const [, attrs, sourceRaceId, labelHtml] of anchors) {
    const label = stripTags(labelHtml);
    const raceNo = Number.parseInt(label.match(/(\d+)\.\s*Koşu/i)?.[1] ?? "", 10);
    const raceTime = label.match(/(\d{1,2}\.\d{2})/)?.[1] ?? "";
    const venue = stripTags(attrs.match(/sehir=["']([^"']+)["']/i)?.[1] ?? "");

    if (!Number.isFinite(raceNo)) continue;
    tabs.set(sourceRaceId, { raceNo, raceTime, venue });
  }

  return tabs;
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
  const programVenue = extractProgramVenue(html);
  const raceTabs = parseRaceTabs(html);
  const raceBlocks = [...String(html).matchAll(/<div id=["']kosubilgisi-(\d+)["'][^>]*>([\s\S]*?)(?=<div id=["']kosubilgisi-\d+["']|<input type=["']hidden["'] class=["']totalKosuSayisi|$)/gi)];

  return raceBlocks.map(([, sourceRaceId, blockHtml]) => {
    const tab = raceTabs.get(sourceRaceId);
    const rows = [...blockHtml.matchAll(/<tr class=["'](?:even|odd)["']>([\s\S]*?)<\/tr>/gi)].map(([, rowHtml]) => parseEntry(rowHtml));

    return {
      sourceRaceId,
      venue: tab?.venue || programVenue,
      raceNo: tab?.raceNo ?? null,
      raceTime: tab?.raceTime ?? "",
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
