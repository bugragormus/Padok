import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const getArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const normalizeName = (value) => String(value ?? "").trim().toLocaleUpperCase("tr-TR");

const featureProfileByHorse = (featureBreakdown) => new Map((featureBreakdown?.profiles ?? [])
  .map((profile) => [normalizeName(profile.horseName), profile]));

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(value)));

const groupScore = (profile, key) => profile?.groups?.[key]?.score ?? null;

const scoreCandidate = (candidate, featureProfile) => {
  const readiness = candidate.readiness ?? {};
  const route = candidate.route ?? {};
  const calibrated = candidate.calibratedReadiness ?? {};
  const actorScore = groupScore(featureProfile, "actorContext") ?? 0;
  const pedigreeScore = groupScore(featureProfile, "pedigree") ?? 0;
  const ownerScore = groupScore(featureProfile, "owner") ?? 0;
  const dataConfidence = groupScore(featureProfile, "dataConfidence") ?? readiness.confidence ?? 0;
  const routePenalty = route.prepStartCount === 0 ? 16 : route.prepStartCount === 1 ? 7 : 0;
  const cautionPenalty = (candidate.cautions?.length ?? 0) * 5;
  const calibrationBonus = Number.isFinite(calibrated.scoreDelta) ? calibrated.scoreDelta : 0;

  const base = (readiness.score ?? 0) * 0.44
    + (readiness.confidence ?? 0) * 0.12
    + (readiness.upside ?? 0) * 0.12
    + actorScore * 0.09
    + pedigreeScore * 0.08
    + ownerScore * 0.05
    + dataConfidence * 0.06
    + calibrationBonus * 0.6
    - (readiness.risk ?? 0) * 0.1
    - routePenalty
    - cautionPenalty;

  const upset = (readiness.upside ?? 0) * 0.36
    + (readiness.risk ?? 0) * 0.16
    + Math.max(0, 80 - (readiness.score ?? 0)) * 0.12
    + (route.prepStartCount === 0 ? 18 : 0)
    + (candidate.cautions?.length ? 10 : 0)
    + pedigreeScore * 0.11
    + actorScore * 0.08;

  return {
    decisionScore: clamp(base),
    upsetScore: clamp(upset),
    riskScore: clamp((readiness.risk ?? 0) + cautionPenalty + routePenalty + (candidate.actors?.jockeyChanged ? 8 : 0)),
    confidenceScore: clamp((readiness.confidence ?? 0) * 0.7 + dataConfidence * 0.3 - cautionPenalty)
  };
};

const roleLabel = (candidate, scores, topScore) => {
  if (scores.decisionScore === topScore) return "Ana aday";
  if (scores.upsetScore >= 58) return "Sürpriz adayı";
  if (scores.confidenceScore >= 70 && scores.riskScore <= 18) return "Güvenli profil";
  if (scores.riskScore >= 30) return "Riskli izleme";
  return "Destekleyici aday";
};

const buildReason = (candidate, featureProfile, scores) => {
  const strongestGroup = featureProfile?.groups?.[featureProfile?.strongestGroup]?.label ?? null;
  const weakestGroup = featureProfile?.groups?.[featureProfile?.weakestGroup]?.label ?? null;
  const pieces = [
    `Readiness ${candidate.readiness?.score ?? "-"} ve karar skoru ${scores.decisionScore}.`,
    candidate.calibratedReadiness ? `Kalibre sırada ${candidate.calibratedReadiness.rank}.` : null,
    strongestGroup ? `En güçlü feature grubu ${strongestGroup}.` : null,
    weakestGroup && scores.riskScore >= 25 ? `Risk okumasında zayıf grup ${weakestGroup}.` : null,
    candidate.route?.prepStartCount === 0 ? "İzlenen Gazi rotasında startı olmadığı için kapalı profil." : null
  ].filter(Boolean);

  return pieces.join(" ");
};

const uniqueLessons = ({ surpriseReview, signalCalibration }) => [
  ...(surpriseReview?.lessons ?? []),
  ...(signalCalibration?.missDiagnostics ?? []).slice(0, 2).map((item) => item.reason)
].filter(Boolean).filter((item, index, items) => items.indexOf(item) === index).slice(0, 5);

export const buildDecisionMatrix = ({ candidateComparison, featureBreakdown, signalCalibration = null, surpriseReview = null }) => {
  const profiles = featureProfileByHorse(featureBreakdown);
  const scoredCandidates = (candidateComparison.candidates ?? []).map((candidate) => {
    const featureProfile = profiles.get(normalizeName(candidate.horseName));
    const scores = scoreCandidate(candidate, featureProfile);
    return {
      horseName: candidate.horseName,
      role: null,
      scores,
      readiness: candidate.readiness,
      route: candidate.route,
      actors: candidate.actors,
      calibratedReadiness: candidate.calibratedReadiness,
      strengths: candidate.strengths ?? [],
      cautions: candidate.cautions ?? [],
      reason: buildReason(candidate, featureProfile, scores),
      feature: featureProfile
        ? {
          compositeScore: featureProfile.compositeScore,
          strongestGroup: featureProfile.strongestGroup,
          weakestGroup: featureProfile.weakestGroup
        }
        : null
    };
  }).sort((a, b) => b.scores.decisionScore - a.scores.decisionScore || b.scores.confidenceScore - a.scores.confidenceScore);

  const topScore = scoredCandidates[0]?.scores.decisionScore ?? null;
  const candidatesWithBaseRoles = scoredCandidates.map((candidate) => ({
    ...candidate,
    role: roleLabel(candidate, candidate.scores, topScore)
  }));
  const upsetWatch = [...candidatesWithBaseRoles]
    .filter((candidate) => candidate.role !== "Ana aday")
    .sort((a, b) => b.scores.upsetScore - a.scores.upsetScore || b.scores.decisionScore - a.scores.decisionScore)
    .slice(0, 3);
  const primaryUpsetName = upsetWatch[0]?.horseName ?? null;
  const candidates = candidatesWithBaseRoles.map((candidate) => ({
    ...candidate,
    role: candidate.horseName === primaryUpsetName ? "Sürpriz adayı" : candidate.role
  }));
  const riskWatch = [...candidates]
    .filter((candidate) => candidate.cautions.length || candidate.scores.riskScore >= 25)
    .sort((a, b) => b.scores.riskScore - a.scores.riskScore)
    .slice(0, 3);

  return {
    generatedAt: new Date().toISOString(),
    sourceYear: candidateComparison.sourceYear ?? featureBreakdown.sourceYear ?? null,
    summary: {
      candidateCount: candidates.length,
      leaderHorse: candidates[0]?.horseName ?? null,
      upsetHorse: upsetWatch[0]?.horseName ?? null,
      riskHorse: riskWatch[0]?.horseName ?? null,
      averageDecisionScore: candidates.length
        ? Math.round(candidates.reduce((sum, candidate) => sum + candidate.scores.decisionScore, 0) / candidates.length)
        : null,
      headline: candidates[0]
        ? `${candidates[0].horseName} karar matrisinde önde; ${upsetWatch[0]?.horseName ?? candidates[0].horseName} sürpriz penceresinde ayrıca izlenmeli.`
        : "Karar matrisi için aday verisi bekleniyor."
    },
    candidates,
    upsetWatch,
    riskWatch,
    lessons: uniqueLessons({ surpriseReview, signalCalibration }),
    methodology: {
      note: "Decision matrix, aday karşılaştırmasını feature breakdown, kalibrasyon ve sürpriz dersleriyle tek karar ekranına indirger.",
      disclaimer: "Karar destek ve analiz çıktısıdır; kesin sonuç tahmini veya bahis önerisi değildir."
    }
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const candidateComparisonPath = getArgValue(args, "--candidate-comparison") ?? "data/gazi-candidate-comparison.json";
  const featureBreakdownPath = getArgValue(args, "--feature-breakdown") ?? "data/gazi-feature-breakdown.json";
  const signalCalibrationPath = getArgValue(args, "--signal-calibration") ?? "data/gazi-signal-calibration.json";
  const surpriseReviewPath = getArgValue(args, "--surprise-review") ?? "data/gazi-surprise-review.json";
  const outPath = getArgValue(args, "--out") ?? "data/gazi-decision-matrix.json";
  const payload = buildDecisionMatrix({
    candidateComparison: await readJson(candidateComparisonPath),
    featureBreakdown: await readJson(featureBreakdownPath),
    signalCalibration: await readJson(signalCalibrationPath),
    surpriseReview: await readJson(surpriseReviewPath)
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outPath,
    sourceYear: payload.sourceYear,
    leaderHorse: payload.summary.leaderHorse,
    upsetHorse: payload.summary.upsetHorse,
    candidateCount: payload.summary.candidateCount
  }, null, 2));
};

if (process.argv[1]?.endsWith("build-gazi-decision-matrix.mjs")) {
  main();
}
