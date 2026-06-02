import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseRows } from "./parse-tjk-named-races.mjs";

const endpoint = "https://www.tjk.org/TR/YarisSever/Query/DataRows/TumOnemliKosular";
const defaultSort = "KOSUTARIHI Desc";

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

const toSlug = (value) => {
  return String(value)
    .trim()
    .replace(/\./g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
};

const buildUrl = (args, pageOverride) => {
  const params = new URLSearchParams();
  const page = pageOverride ?? getArgValue(args, "--page") ?? "1";
  params.set("PageNumber", page);
  params.set("Sort", getArgValue(args, "--sort") ?? defaultSort);

  const raceCode = getArgValue(args, "--race-code");
  if (raceCode) params.set("QueryParameter_OnemliKosuKodu", raceCode);

  for (const pair of getRepeatedArgValues(args, "--param")) {
    const [key, ...rest] = pair.split("=");
    const value = rest.join("=");
    if (!key || !value) {
      throw new Error(`Invalid --param value: ${pair}. Expected KEY=VALUE.`);
    }
    params.append(key, value);
  }

  return `${endpoint}?${params.toString()}`;
};

const buildRunName = (args, pageOverride) => {
  const raceCode = getArgValue(args, "--race-code") ?? "all";
  const page = pageOverride ?? getArgValue(args, "--page") ?? "1";
  return `${toSlug(raceCode)}_page-${toSlug(page)}`;
};

const fetchPage = async (args, page) => {
  const runName = buildRunName(args, page);
  const rawDir = join("data", "raw", "tjk", "named-races");
  const processedDir = join("data", "processed", "tjk", "named-races");
  const rawPath = join(rawDir, `${runName}.html`);
  const processedPath = join(processedDir, `${runName}.json`);
  const url = buildUrl(args, page);

  await mkdir(rawDir, { recursive: true });
  await mkdir(processedDir, { recursive: true });

  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "user-agent": "PadokNamedRaceIndexer/0.1"
    }
  });

  if (response.status === 404) {
    const html = "";
    const rows = [];
    await writeFile(rawPath, html, "utf8");
    await writeFile(processedPath, `${JSON.stringify({ source: url, rowCount: rows.length, rows }, null, 2)}\n`, "utf8");
    return { page: Number(page), source: url, rawPath, processedPath, rowCount: rows.length };
  }

  if (!response.ok) {
    throw new Error(`TJK request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const rows = parseRows(html);

  await writeFile(rawPath, html, "utf8");
  await writeFile(processedPath, `${JSON.stringify({ source: url, rowCount: rows.length, rows }, null, 2)}\n`, "utf8");

  return { page: Number(page), source: url, rawPath, processedPath, rowCount: rows.length };
};

const main = async () => {
  const args = process.argv.slice(2);
  const startPage = Number.parseInt(getArgValue(args, "--page") ?? "1", 10);
  const pageCount = Number.parseInt(getArgValue(args, "--pages") ?? "1", 10);
  const untilEmpty = args.includes("--until-empty");
  const results = [];

  for (let offset = 0; offset < pageCount; offset += 1) {
    const page = startPage + offset;
    const result = await fetchPage(args, String(page));
    results.push(result);
    console.log(JSON.stringify(result));

    if (untilEmpty && result.rowCount === 0) break;
  }

  console.log(JSON.stringify({
    pagesRequested: pageCount,
    pagesFetched: results.length,
    totalRows: results.reduce((sum, result) => sum + result.rowCount, 0),
    results
  }, null, 2));
};

main();
