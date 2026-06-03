import { copyFile, readFile } from "node:fs/promises";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const readReport = async (path) => {
  const payload = JSON.parse(await readFile(path, "utf8"));
  return { path, payload, raceCount: payload.routeRaces?.length ?? 0 };
};

const main = async () => {
  const args = process.argv.slice(2);
  const preferredPath = getArgValue(args, "--preferred");
  const fallbackPath = getArgValue(args, "--fallback");
  const outPath = getArgValue(args, "--out") ?? "data/gazi-route-report.json";

  if (!preferredPath || !fallbackPath) {
    console.error("Usage: node scripts/select-gazi-route-report.mjs --preferred <report> --fallback <report> [--out <report>]");
    process.exit(1);
  }

  const preferred = await readReport(preferredPath);
  const fallback = await readReport(fallbackPath);
  const selected = preferred.raceCount > 0 ? preferred : fallback;

  await copyFile(selected.path, outPath);
  console.log(JSON.stringify({
    outPath,
    selectedPath: selected.path,
    selectedYear: selected.payload.year,
    selectedRaceCount: selected.raceCount
  }, null, 2));
};

main();

