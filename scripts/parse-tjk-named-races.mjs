import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extractHref, extractRaceId, stripTags } from "./parse-tjk-kosu-sorgulama.mjs";

export const columns = [
  "year",
  "raceDate",
  "raceName",
  "origin",
  "winner",
  "raceClass",
  "jockey",
  "owner",
  "distanceMeters",
  "surface",
  "winnerTime",
  "prize"
];

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
    console.error("Usage: node scripts/parse-tjk-named-races.mjs <html-file>");
    process.exit(1);
  }

  const rows = await parseFile(inputPath);
  console.log(JSON.stringify(rows, null, 2));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
