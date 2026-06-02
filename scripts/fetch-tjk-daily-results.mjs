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
    .replace(/[/.]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
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

  await mkdir(rawDir, { recursive: true });
  await mkdir(processedDir, { recursive: true });

  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "user-agent": "PadokDailyResultsIndexer/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`TJK request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const races = parseDailyResults(html);

  await writeFile(rawPath, html, "utf8");
  await writeFile(processedPath, `${JSON.stringify({ source: url, raceCount: races.length, races }, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ source: url, rawPath, processedPath, raceCount: races.length }, null, 2));
};

main();
