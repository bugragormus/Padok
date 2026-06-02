import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDailyResults } from "./parse-tjk-daily-results.mjs";

const endpoint = "https://www.tjk.org/TR/YarisSever/Info/Sehir/GunlukYarisSonuclari";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const toSlug = (value) => {
  return String(value)
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[/.]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
};

const normalizeVenue = (value) => {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const parseDate = (value) => {
  const match = String(value ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
};

const buildUrl = ({ cityId, date, cityName }) => {
  const params = new URLSearchParams();
  params.set("SehirId", cityId);
  params.set("QueryParameter_Tarih", date);
  params.set("SehirAdi", cityName);
  params.set("Era", "past");
  return `${endpoint}?${params.toString()}`;
};

const main = async () => {
  const args = process.argv.slice(2);
  const cityId = getArgValue(args, "--city-id");
  const cityName = getArgValue(args, "--city-name");
  const date = getArgValue(args, "--date");
  const timeoutMs = Number.parseInt(getArgValue(args, "--timeout-ms") ?? "20000", 10);
  const allowVenueMismatch = args.includes("--allow-venue-mismatch");

  if (!cityId || !cityName || !date) {
    console.error("Usage: node scripts/fetch-tjk-daily-results.mjs --city-id <id> --city-name <name> --date DD/MM/YYYY");
    process.exit(1);
  }

  const runName = `${toSlug(date)}_${toSlug(cityName)}_${toSlug(cityId)}`;
  const rawDir = join("data", "raw", "tjk", "daily-results");
  const processedDir = join("data", "processed", "tjk", "daily-results");
  const rawPath = join(rawDir, `${runName}.html`);
  const processedPath = join(processedDir, `${runName}.json`);
  const url = buildUrl({ cityId, date, cityName });
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  await mkdir(rawDir, { recursive: true });
  await mkdir(processedDir, { recursive: true });

  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "user-agent": "PadokDailyResultsIndexer/0.1"
    },
    signal: abortController.signal
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`TJK request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const races = parseDailyResults(html).map((race) => ({ ...race, date: parseDate(date) }));
  const actualVenue = races.find((race) => race.venue)?.venue ?? "";

  if (actualVenue && normalizeVenue(actualVenue) !== normalizeVenue(cityName) && !allowVenueMismatch) {
    throw new Error(`TJK venue mismatch: requested ${cityName} (${cityId}) but received ${actualVenue}`);
  }

  await writeFile(rawPath, html, "utf8");
  await writeFile(processedPath, `${JSON.stringify({ source: url, cityId, cityName, date: parseDate(date), raceCount: races.length, races }, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ source: url, rawPath, processedPath, cityId, cityName, actualVenue, raceCount: races.length }, null, 2));
};

main();
