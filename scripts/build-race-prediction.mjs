import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(value)));

const normalizeName = (value) => String(value ?? "").trim().toLocaleUpperCase("tr-TR");

const eliteJockeyScore = (jockey) => {
  const name = normalizeName(jockey);
  if (["G.KOCAKAYA", "H.KARATAŞ", "A.ÇELİK"].includes(name)) return 92;
  if (["V.ABİŞ", "Ö.YILDIRIM", "M.KAYA", "A.SÖZEN", "A.KURŞUN", "S.KAYA"].includes(name)) return 84;
  if (["M.AKYAVUZ", "E.ÇANKAYA", "E.ÇİZİK", "S.ÇELİK"].includes(name)) return 74;
  return jockey ? 62 : 35;
};

const formDigits = (form) => String(form ?? "").match(/\d/g)?.map(Number) ?? [];

const formScore = (form) => {
  const digits = formDigits(form).filter((value) => value > 0);
  if (!digits.length) return 35;
  const recent = digits.slice(-4);
  const averageFinish = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const winCount = recent.filter((value) => value === 1).length;
  const podiumCount = recent.filter((value) => value <= 3).length;
  return clamp(92 - averageFinish * 7 + winCount * 8 + podiumCount * 3);
};

const staminaScore = (entry, race) => {
  const text = normalizeName(`${entry.sire} ${entry.dam} ${entry.damsire ?? ""}`);
  const staminaHints = ["TOROK", "NAYEF", "SADLER", "NATIVE KHAN", "GAZIBORA", "KING DAVID", "LOPE", "TIZWAY"];
  const speedHints = ["EPAULETTE", "AGRESIVO", "MYBOYCHARLIE"];
  const base = race.distance >= 2200 ? 62 : 58;
  const staminaBonus = staminaHints.some((hint) => text.includes(hint)) ? 18 : 0;
  const speedPenalty = race.distance >= 2200 && speedHints.some((hint) => text.includes(hint)) ? 7 : 0;
  return clamp(base + staminaBonus - speedPenalty);
};

const buildNotes = ({ entry, scores, race }) => [
  scores.hp >= 85 ? `HP ${entry.handicapPoint} ile sınıf sinyali güçlü.` : null,
  scores.form >= 78 ? `Son form dizisi ${entry.recentForm} güçlü momentum veriyor.` : null,
  scores.stamina >= 76 ? `${race.distance}m ${race.surface} için orijin/stamina tarafı destekleyici.` : null,
  scores.jockey >= 90 ? `${entry.jockey} faktörü karar skorunu yukarı çekiyor.` : null,
  scores.risk >= 45 ? "Risk yüksek; tek başına güvenli favori gibi okunmamalı." : null
].filter(Boolean);

const scoreEntry = (entry, race, maxHp) => {
  const hp = maxHp ? clamp((entry.handicapPoint / maxHp) * 100) : 50;
  const form = formScore(entry.recentForm);
  const jockey = eliteJockeyScore(entry.jockey);
  const stamina = staminaScore(entry, race);
  const scratchPenalty = entry.scratch ? 100 : 0;
  const lowDataPenalty = formDigits(entry.recentForm).length < 4 ? 8 : 0;
  const risk = clamp((100 - hp) * 0.22 + Math.max(0, 62 - stamina) * 0.35 + lowDataPenalty + scratchPenalty);
  const winScore = clamp(hp * 0.38 + form * 0.27 + jockey * 0.18 + stamina * 0.17 - risk * 0.2);
  const placeScore = clamp(hp * 0.3 + form * 0.28 + jockey * 0.15 + stamina * 0.17 + Math.max(0, 75 - risk) * 0.1 - scratchPenalty);
  const upsetScore = clamp((100 - hp) * 0.22 + form * 0.28 + stamina * 0.22 + jockey * 0.12 - risk * 0.12);

  return { hp, form, jockey, stamina, risk, winScore, placeScore, upsetScore };
};

const roleFor = (entry, scores, rank, upsetRank) => {
  if (entry.scratch) return "Koşmaz";
  if (rank === 1) return "Birincilik adayı";
  if (rank <= 3) return "Ana rakip";
  if (upsetRank <= 2 && scores.upsetScore >= 55) return "Sürpriz adayı";
  if (scores.placeScore >= 62) return "Tabela adayı";
  return "Dış kulvar";
};

export const buildRacePrediction = ({ raceCard }) => {
  const race = raceCard.race;
  const runnable = (raceCard.entries ?? []).filter((entry) => !entry.scratch);
  const maxHp = Math.max(...runnable.map((entry) => entry.handicapPoint ?? 0), 1);
  const scored = (raceCard.entries ?? []).map((entry) => ({
    ...entry,
    scores: scoreEntry(entry, race, maxHp)
  }));
  const byWin = [...scored].sort((a, b) => b.scores.winScore - a.scores.winScore || b.scores.placeScore - a.scores.placeScore);
  const byUpset = [...scored].filter((entry) => !entry.scratch)
    .sort((a, b) => b.scores.upsetScore - a.scores.upsetScore || b.scores.placeScore - a.scores.placeScore);
  const upsetRankByName = new Map(byUpset.map((entry, index) => [normalizeName(entry.horseName), index + 1]));
  const predictions = byWin.map((entry, index) => ({
    rank: index + 1,
    programNo: entry.programNo,
    horseName: entry.horseName,
    role: roleFor(entry, entry.scores, index + 1, upsetRankByName.get(normalizeName(entry.horseName)) ?? 99),
    jockey: entry.jockey,
    trainer: entry.trainer,
    owner: entry.owner,
    handicapPoint: entry.handicapPoint,
    recentForm: entry.recentForm,
    scratch: Boolean(entry.scratch),
    scores: entry.scores,
    notes: buildNotes({ entry, scores: entry.scores, race })
  }));

  return {
    generatedAt: new Date().toISOString(),
    source: raceCard.source,
    race,
    summary: {
      runnerCount: runnable.length,
      scratchCount: (raceCard.entries ?? []).length - runnable.length,
      leaderHorse: predictions.find((entry) => !entry.scratch)?.horseName ?? null,
      upsetHorse: predictions.find((entry) => entry.role === "Sürpriz adayı")?.horseName ?? null,
      headline: predictions.find((entry) => !entry.scratch)
        ? `${predictions.find((entry) => !entry.scratch).horseName} modelde önde; ${predictions.find((entry) => entry.role === "Sürpriz adayı")?.horseName ?? "sürpriz adayı"} geniş kupon penceresinde izlenmeli.`
        : "Koşacak at verisi bekleniyor."
    },
    predictions,
    methodology: {
      note: "Race prediction, tek koşu kartındaki HP, son form, jokey gücü ve mesafe/orijin dayanıklılığını açıklanabilir şekilde puanlar.",
      limitation: "Bu modül henüz idman, AGF, detaylı tempo ve atın tüm kariyer koşularını otomatik okumaz.",
      disclaimer: "Analiz çıktısıdır; kesin sonuç tahmini veya bahis önerisi değildir."
    }
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const inputPath = getArgValue(args, "--input") ?? "data/race-cards/2026-06-06-ankara-mehmet-akif-ersoy.json";
  const outPath = getArgValue(args, "--out") ?? "data/race-prediction-mehmet-akif-ersoy-2026.json";
  const payload = buildRacePrediction({ raceCard: await readJson(inputPath) });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    race: payload.race.name,
    leaderHorse: payload.summary.leaderHorse,
    upsetHorse: payload.summary.upsetHorse,
    runnerCount: payload.summary.runnerCount
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-race-prediction.mjs")) {
  main();
}
