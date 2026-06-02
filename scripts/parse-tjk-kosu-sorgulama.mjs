import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const columns = [
  "date",
  "city",
  "raceNo",
  "raceGroup",
  "raceType",
  "apprenticeType",
  "distanceMeters",
  "surface",
  "weight",
  "pedigree",
  "prize",
  "winner",
  "winnerAgeSex",
  "winnerTime",
  "handicapPoint"
];

export const stripTags = (html) => {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/\s+/g, " ")
    .trim();
};

export const extractHref = (html) => {
  const match = html.match(/href=["']([^"']+)["']/i);
  if (!match) return "";
  return match[1].replace(/&amp;/g, "&");
};

export const extractRaceId = (href) => {
  const match = href.match(/#(\d+)/);
  return match ? match[1] : "";
};

export const parseRows = (html) => {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];

  return rows
    .map(([, rowHtml]) => {
      const cellHtmlBlocks = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cellHtml]) => cellHtml);
      const cells = cellHtmlBlocks.map((cellHtml) => stripTags(cellHtml));

      if (cells.length !== columns.length) return null;

      const resultHref = extractHref(cellHtmlBlocks[0]);

      return {
        sourceRaceId: extractRaceId(resultHref),
        resultHref,
        ...Object.fromEntries(columns.map((column, index) => [column, cells[index]]))
      };
    })
    .filter(Boolean);
};

export const parseFile = async (inputPath) => {
  const html = await readFile(inputPath, "utf8");
  return parseRows(html);
};

const main = async () => {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error("Usage: node scripts/parse-tjk-kosu-sorgulama.mjs <html-file>");
    process.exit(1);
  }

  const rows = await parseFile(inputPath);
  console.log(JSON.stringify(rows, null, 2));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
