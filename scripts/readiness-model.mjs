export const readinessLensLabels = {
  score: {
    label: "Ana skor",
    description: "En dengeli kompozit okuma"
  },
  upside: {
    label: "Upside",
    description: "Patlama ihtimali yüksek profiller"
  },
  lowRisk: {
    label: "Düşük risk",
    description: "Güven ve süreklilik ağırlıklı okuma"
  },
  uncertainty: {
    label: "Veri eksiği",
    description: "Eksik ama izlenmesi gereken profiller"
  }
};

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const getPrepFormScore = (row) => {
  if (!row.hasPrepStart) return 8;
  if (row.bestPrepFinishPosition === 1) return 28;
  if (row.bestPrepFinishPosition === 2) return 23;
  if (row.bestPrepFinishPosition === 3) return 19;
  if (row.bestPrepFinishPosition <= 5) return 13;
  return 7;
};

const getActorSignalScore = (actorContext = {}) => {
  const signals = actorContext.signals ?? [];
  const score = signals.reduce((sum, signal) => sum + (signal.score ?? 0), 0);
  return clamp(score, 0, 12);
};

export const getReadinessAssessment = (row, profileSummary, options = {}) => {
  const hasJockeyChange = Boolean(options.hasJockeyChange);
  const actorSignal = getActorSignalScore(options.actorContext);
  const numericAverage = Number.parseFloat(profileSummary.averageFinish);
  const profileEvidence = clamp((profileSummary.count * 7) + (Number.isFinite(numericAverage) ? Math.round(12 - (numericAverage * 3)) : 0), 0, 30);
  const prepForm = getPrepFormScore(row);
  const routeShape = row.prepStartCount >= 2 ? 18 : row.hasPrepStart ? 13 : 8;
  const continuity = hasJockeyChange ? 7 : 13;
  const dataDepth = [
    row.sire,
    row.dam,
    row.owner,
    row.gaziJockeyName,
    row.bestPrepRaceName
  ].filter(Boolean).length * 2;
  const score = clamp(prepForm + profileEvidence + routeShape + continuity + dataDepth + actorSignal, 0, 100);
  const confidence = clamp(35 + (row.hasPrepStart ? 20 : 0) + (profileSummary.count * 8) + (row.sire && row.dam ? 10 : 0) + (row.owner ? 5 : 0) + Math.round(actorSignal * 0.8), 0, 100);
  const upside = clamp(
    (row.bestPrepFinishPosition === 1 ? 34 : 0)
      + (profileSummary.count >= 3 ? 24 : profileSummary.count * 6)
      + (row.prepStartCount === 0 ? 18 : 0)
      + (row.prepStartCount >= 2 ? 10 : 0),
    0,
    100
  );
  const risk = clamp(
    (row.prepStartCount === 0 ? 26 : 0)
      + (hasJockeyChange ? 14 : 0)
      + (profileSummary.count === 0 ? 18 : 0)
      + (!row.sire || !row.dam ? 8 : 0),
    0,
    100
  );
  const label = score >= 78 ? "Güçlü aday profili" : score >= 64 ? "Ciddi takip profili" : score >= 50 ? "İzleme listesi" : "Eksik sinyal";
  const confidenceLabel = confidence >= 76 ? "Yüksek güven" : confidence >= 58 ? "Orta güven" : "Düşük güven";
  const riskLabel = risk >= 45 ? "Yüksek oynaklık" : risk >= 24 ? "Kontrollü risk" : "Düşük risk";
  const primaryReason = row.bestPrepFinishPosition === 1
    ? "Prep galibiyeti kompozit skoru yukarı taşıyor."
    : row.prepStartCount === 0
      ? "Rota dışı geldiği için upside var, fakat veri güveni sınırlı."
      : profileSummary.count >= 3
        ? "Geçmiş ilk 3 profilleriyle benzerlik yoğunluğu var."
        : "Temel rota sinyali var; ayırıcı veri henüz sınırlı.";

  return {
    score,
    confidence,
    upside,
    risk,
    label,
    confidenceLabel,
    riskLabel,
    primaryReason,
    parts: [
      { label: "prep formu", value: prepForm },
      { label: "profil kanıtı", value: profileEvidence },
      { label: "rota şekli", value: routeShape },
      { label: "jokey sürekliliği", value: continuity },
      { label: "veri derinliği", value: dataDepth },
      { label: "aktör geçmişi", value: actorSignal }
    ].filter((part) => part.value > 0)
  };
};

export const getReadinessLensValue = (readiness, lens = "score") => {
  if (lens === "upside") return readiness.upside;
  if (lens === "lowRisk") return clamp(readiness.confidence - readiness.risk, 0, 100);
  if (lens === "uncertainty") {
    return clamp(Math.round((readiness.risk * 0.7) + (readiness.upside * 0.5) + (Math.max(0, 75 - readiness.confidence) * 0.6)), 0, 100);
  }
  return readiness.score;
};

export const sortReadinessProfiles = (profiles, lens = "score") => {
  const sortedProfiles = [...profiles];

  if (lens === "upside") {
    return sortedProfiles.sort((a, b) => b.readiness.upside - a.readiness.upside || b.readiness.score - a.readiness.score);
  }

  if (lens === "lowRisk") {
    return sortedProfiles.sort((a, b) => {
      const aValue = getReadinessLensValue(a.readiness, lens);
      const bValue = getReadinessLensValue(b.readiness, lens);
      return bValue - aValue || b.readiness.score - a.readiness.score;
    });
  }

  if (lens === "uncertainty") {
    return sortedProfiles.sort((a, b) => {
      const aValue = getReadinessLensValue(a.readiness, lens);
      const bValue = getReadinessLensValue(b.readiness, lens);
      return bValue - aValue || b.readiness.upside - a.readiness.upside;
    });
  }

  return sortedProfiles.sort((a, b) => b.readiness.score - a.readiness.score || b.readiness.confidence - a.readiness.confidence);
};

export const getReadinessLensBadge = (readiness, lens = "score") => {
  if (lens === "upside") return `Upside ${readiness.upside}`;
  if (lens === "lowRisk") return `Risk dengesi ${getReadinessLensValue(readiness, lens)}`;
  if (lens === "uncertainty") return `Belirsizlik ${getReadinessLensValue(readiness, lens)}`;
  return readiness.label;
};

export const getReadinessLensReason = (row, readiness, lens = "score") => {
  if (lens === "upside") {
    if (row.bestPrepFinishPosition === 1) return "Prep galibiyeti bu profilde upside sinyalini yukarı çekiyor.";
    if (row.prepStartCount === 0) return "Rota dışı profil, düşük görünürlükten gelen sürpriz ihtimali taşıyor.";
    return "Geçmiş profil kanıtı ve rota formu birlikte patlama ihtimali üretiyor.";
  }

  if (lens === "lowRisk") {
    if (readiness.risk <= 20) return "Veri güveni yüksek ve risk göstergeleri sınırlı.";
    return "Güven skoru riskten daha güçlü kaldığı için dengeli aday olarak okunuyor.";
  }

  if (lens === "uncertainty") {
    if (row.prepStartCount === 0) return "Takip edilen rotada görünmediği için eksik ama izlenmesi gereken profil.";
    return "Upside ve risk birlikte yüksek; karar için daha fazla bağlam gerekiyor.";
  }

  return readiness.primaryReason;
};

export const getReadinessLensMeta = (readiness, lens = "score") => {
  if (lens === "upside") {
    return `${readiness.confidenceLabel} · Risk ${readiness.risk} · Readiness ${readiness.score}`;
  }

  if (lens === "lowRisk") {
    return `${readiness.confidenceLabel} · ${readiness.riskLabel} · Upside ${readiness.upside}`;
  }

  if (lens === "uncertainty") {
    return `${readiness.riskLabel} · Güven ${readiness.confidence} · Upside ${readiness.upside}`;
  }

  return `${readiness.confidenceLabel} · ${readiness.riskLabel} · Upside ${readiness.upside}`;
};
