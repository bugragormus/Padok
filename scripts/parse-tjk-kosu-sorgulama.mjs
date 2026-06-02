import { readFile } from "node:fs/promises";

const columns = [
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

const stripTags = (html) => {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
};

const parseRows = (html) => {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];

  return rows
    .map(([, rowHtml]) => {
      const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cellHtml]) => stripTags(cellHtml));

      if (cells.length !== columns.length) return null;

      return Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
    })
    .filter(Boolean);
};

const main = async () => {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error("Usage: node scripts/parse-tjk-kosu-sorgulama.mjs <html-file>");
    process.exit(1);
  }

  const html = await readFile(inputPath, "utf8");
  const rows = parseRows(html);
  console.log(JSON.stringify(rows, null, 2));
};

main();
