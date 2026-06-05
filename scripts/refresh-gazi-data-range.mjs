import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const runCommand = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} ${args.join(" ")} failed`);
  }
  return result.stdout;
};

const runNpmScript = (scriptName, args) => {
  const output = runCommand("npm", ["run", scriptName, "--", ...args]);
  const lines = output.trim().split("\n").filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].trim().startsWith("{")) continue;

    try {
      return JSON.parse(lines.slice(index).join("\n"));
    } catch {
      // Keep scanning earlier lines; npm scripts may print multiple JSON blocks.
    }
  }

  return { rawOutput: output };
};

const toDisplayDate = (year, month, day) => `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;

const range = (startYear, endYear) => {
  const years = [];
  for (let year = startYear; year <= endYear; year += 1) years.push(year);
  return years;
};

const main = async () => {
  const args = process.argv.slice(2);
  const startYear = Number.parseInt(getArgValue(args, "--start-year") ?? "2015", 10);
  const endYear = Number.parseInt(getArgValue(args, "--end-year") ?? new Date().getFullYear(), 10);
  const defaultYear = Number.parseInt(getArgValue(args, "--default-year") ?? String(endYear), 10);
  const raceIndexPages = getArgValue(args, "--race-index-pages") ?? "20";
  const namedRacePages = getArgValue(args, "--named-race-pages") ?? "120";
  const today = getArgValue(args, "--today") ?? new Date().toISOString().slice(0, 10);
  const years = range(startYear, endYear);
  const log = {
    startYear,
    endYear,
    defaultYear,
    years,
    steps: []
  };

  await mkdir("data", { recursive: true });

  for (const year of years) {
    const result = runNpmScript("fetch:tjk-race-index", [
      "--start", toDisplayDate(year, 3, 1),
      "--end", toDisplayDate(year, 6, 30),
      "--page", "1",
      "--pages", raceIndexPages,
      "--until-empty"
    ]);
    log.steps.push({ step: "fetch-race-index", year, result });
  }

  log.steps.push({
    step: "import-race-index",
    result: runNpmScript("import:tjk-race-index", ["--input", "data/processed/tjk/kosu-sorgulama"])
  });

  log.steps.push({
    step: "fetch-named-races",
    result: runNpmScript("fetch:tjk-named-races", ["--page", "1", "--pages", namedRacePages, "--until-empty"])
  });

  log.steps.push({
    step: "import-named-races",
    result: runNpmScript("import:tjk-named-races", ["--input", "data/processed/tjk/named-races"])
  });

  for (const year of years) {
    log.steps.push({
      step: "refresh-route",
      year,
      result: runNpmScript("refresh:gazi-route", [
        "--year", String(year),
        "--today", today,
        "--out", `data/gazi-route-${year}.json`
      ])
    });
  }

  const routeInputs = years.flatMap((year) => ["--input", `data/gazi-route-${year}.json`]);
  log.steps.push({
    step: "build-route-backtest",
    result: runNpmScript("backtest:gazi-route", [...routeInputs, "--out", "data/gazi-backtest-report.json"])
  });

  log.steps.push({
    step: "select-default-route",
    result: runNpmScript("select:gazi-route", [
      "--preferred", `data/gazi-route-${defaultYear}.json`,
      "--fallback", `data/gazi-route-${Math.min(defaultYear - 1, endYear)}.json`,
      "--out", "data/gazi-route-report.json"
    ])
  });

  log.steps.push({
    step: "build-default-participation",
    result: runNpmScript("build:gazi-participation", [
      "--input", "data/gazi-route-report.json",
      "--out", "data/gazi-participation-report.json"
    ])
  });

  for (const year of years) {
    log.steps.push({
      step: "build-yearly-participation",
      year,
      result: runNpmScript("build:gazi-participation", [
        "--input", `data/gazi-route-${year}.json`,
        "--out", `data/gazi-participation-${year}.json`
      ])
    });
  }

  const comparisonInputs = years.flatMap((year) => ["--comparison", `data/gazi-participation-${year}.json`]);
  log.steps.push({
    step: "build-default-readiness",
    result: runNpmScript("build:gazi-readiness", [
      "--input", "data/gazi-participation-report.json",
      ...comparisonInputs,
      "--out", "data/gazi-readiness-report.json"
    ])
  });

  for (const year of years) {
    log.steps.push({
      step: "build-yearly-readiness",
      year,
      result: runNpmScript("build:gazi-readiness", [
        "--input", `data/gazi-participation-${year}.json`,
        ...comparisonInputs,
        "--out", `data/gazi-readiness-${year}.json`
      ])
    });
  }

  const readinessInputs = years.flatMap((year) => ["--input", `data/gazi-readiness-${year}.json`]);
  log.steps.push({
    step: "build-model-backtest",
    result: runNpmScript("build:gazi-model-backtest", [...readinessInputs, "--out", "data/gazi-model-backtest.json"])
  });

  log.steps.push({
    step: "build-signal-calibration",
    result: runNpmScript("build:gazi-signal-calibration", [...readinessInputs, "--out", "data/gazi-signal-calibration.json"])
  });

  log.steps.push({
    step: "build-data-horizon",
    result: runNpmScript("build:gazi-data-horizon", ["--data-dir", "data", "--out", "data/gazi-data-horizon.json"])
  });

  log.steps.push({
    step: "build-data-manifest",
    result: runNpmScript("build:data-manifest", ["--data-dir", "data", "--out", "data/padok-data-manifest.json"])
  });

  log.steps.push({
    step: "build-decision-brief",
    result: runNpmScript("build:gazi-decision-brief", ["--out", "data/gazi-decision-brief.json"])
  });

  log.steps.push({
    step: "build-candidate-comparison",
    result: runNpmScript("build:gazi-candidate-comparison", ["--out", "data/gazi-candidate-comparison.json"])
  });

  log.steps.push({
    step: "build-feature-breakdown",
    result: runNpmScript("build:gazi-feature-breakdown", ["--out", "data/gazi-feature-breakdown.json"])
  });

  log.steps.push({
    step: "build-race-day-watchlist",
    result: runNpmScript("build:gazi-race-day-watchlist", ["--out", "data/gazi-race-day-watchlist.json"])
  });

  log.steps.push({
    step: "build-api-index",
    result: runNpmScript("build:api-index", ["--out", "data/padok-api-index.json"])
  });

  await writeFile("data/gazi-range-refresh-log.json", `${JSON.stringify(log, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    startYear,
    endYear,
    defaultYear,
    yearCount: years.length,
    logPath: "data/gazi-range-refresh-log.json"
  }, null, 2));
};

main();
