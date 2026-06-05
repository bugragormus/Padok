import {
  getReadinessAssessment as buildReadinessAssessment,
  getReadinessLensBadge,
  getReadinessLensMeta,
  getReadinessLensReason,
  getReadinessLensValue,
  readinessLensLabels,
  sortReadinessProfiles
} from "./scripts/readiness-model.mjs";

const state = {
  data: null,
  routeReport: null,
  backtestReport: null,
  participationReport: null,
  readinessReport: null,
  dataManifest: null,
  dataHorizon: null,
  selectedParticipationHorse: null,
  participationFilter: "all",
  routeVisibilityFilter: "all",
  readinessLens: "score",
  analysisYear: null,
  routeReportCache: new Map(),
  participationReportCache: new Map(),
  readinessReportCache: new Map(),
  participationComparison: []
};

const formatText = (value) => value ?? "Bekleniyor";
const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const renderTarget = (targetRace) => {
  document.querySelector("#target-title").textContent = targetRace.name;
  document.querySelector("#target-summary").textContent = targetRace.canonicalProfile.importance;

  const metrics = [
    ["Yas / irk", `${targetRace.canonicalProfile.age} ${targetRace.canonicalProfile.breed}`],
    ["Pist", targetRace.canonicalProfile.surface],
    ["Mesafe", `${targetRace.canonicalProfile.distanceMeters}m`],
    ["Hipodrom", targetRace.canonicalProfile.venue]
  ];

  document.querySelector("#target-metrics").innerHTML = metrics
    .map(([label, value]) => `
      <div class="metric">
        <dt>${label}</dt>
        <dd>${value}</dd>
      </div>
    `)
    .join("");
};

const renderRaces = (races) => {
  document.querySelector("#race-grid").innerHTML = races
    .map((race) => `
      <article class="race-card">
        <div class="race-card__top">
          <div>
            <h3>${race.name}</h3>
            <p class="muted">${race.whyItMatters}</p>
          </div>
          <span class="pill">${race.confidence}</span>
        </div>
        <div class="race-facts">
          <div class="fact"><span>Mesafe</span><strong>${race.typicalProfile.distanceMeters}m</strong></div>
          <div class="fact"><span>Pist</span><strong>${race.typicalProfile.surface}</strong></div>
          <div class="fact"><span>Sehir</span><strong>${race.typicalProfile.venue}</strong></div>
          <div class="fact"><span>Sinif</span><strong>${formatText(race.typicalProfile.class)}</strong></div>
        </div>
        <div class="tag-row">
          ${race.signals.map((signal) => `<span class="tag">${signal}</span>`).join("")}
        </div>
      </article>
    `)
    .join("");
};

const tierLabels = {
  "target-race": "Hedef",
  "core-prep": "Ana prova",
  "classic-speed": "Klasik hiz",
  "stamina-proxy": "Mesafe sinyali",
  "surface-breed": "Pist/irk",
  "weak-context": "Baglam"
};

const formatDate = (value) => {
  if (!value) return "Tarih yok";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
};

const formatTimestamp = (value) => {
  if (!value) return "Bilinmiyor";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Istanbul"
  }).format(new Date(value));
};

const percentage = (count, total) => total > 0 ? Math.round((count / total) * 100) : 0;

const formatPosition = (value) => Number.isFinite(value) ? `${value}.` : "-";

const readJson = async (path) => {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
};

const readOptionalJson = async (path) => {
  try {
    return await readJson(path);
  } catch {
    return null;
  }
};

const getAvailableAnalysisYears = () => {
  const horizonYears = state.dataHorizon?.seasons
    ?.map((season) => season.year)
    .filter(Number.isFinite) ?? [];
  const currentYear = Number.isFinite(state.routeReport?.year) ? [state.routeReport.year] : [];
  return [...new Set([...horizonYears, ...currentYear])].sort((a, b) => b - a);
};

const renderAnalysisYearControl = () => {
  const select = document.querySelector("#analysis-year-select");
  if (!select) return;

  const years = getAvailableAnalysisYears();
  const selectedYear = state.analysisYear ?? years[0];
  state.analysisYear = selectedYear;

  select.innerHTML = years
    .map((year) => `<option value="${year}" ${year === selectedYear ? "selected" : ""}>${year}</option>`)
    .join("");
};

const renderParticipationComparison = () => {
  const container = document.querySelector("#participation-comparison");
  if (!container) return;

  container.innerHTML = state.participationComparison.length
    ? state.participationComparison
      .map((report) => {
        const summary = report.summary;
        const isSelected = report.sourceYear === state.analysisYear;
        return `
          <button class="season-chip ${isSelected ? "season-chip--selected" : ""}" type="button" data-analysis-year="${escapeHtml(report.sourceYear)}" aria-pressed="${isSelected}">
            <strong>${escapeHtml(report.sourceYear)}</strong>
            <span>${escapeHtml(summary.runnersWithPrepStartCount)}/${escapeHtml(summary.gaziRunnerCount)} prep gördü</span>
            <em>${escapeHtml(summary.runnersWithoutPrepStartCount)} rota dışı · İlk 3 %${escapeHtml(summary.topThreePrepStartRate)}</em>
          </button>
        `;
      })
      .join("")
    : '<p class="coverage-empty">Sezon karşılaştırması bekleniyor.</p>';
};

const loadParticipationComparison = async () => {
  const years = getAvailableAnalysisYears().sort((a, b) => b - a);
  const reports = await Promise.all(years.map(async (year) => {
    if (!state.participationReportCache.has(year)) {
      state.participationReportCache.set(year, await readJson(`./data/gazi-participation-${year}.json`));
    }
    return state.participationReportCache.get(year);
  }));

  state.participationComparison = reports;
  renderParticipationComparison();
  renderHistoricalPatterns();
  if (state.participationReport) renderParticipation(state.participationReport);
};

const loadReadinessReport = async (year) => {
  if (!Number.isFinite(year)) return null;
  if (state.readinessReportCache.has(year)) return state.readinessReportCache.get(year);

  const yearlyPath = `./data/gazi-readiness-${year}.json`;
  const yearlyReport = await readOptionalJson(yearlyPath);
  if (yearlyReport) {
    const report = { ...yearlyReport, artifactPath: yearlyPath };
    state.readinessReportCache.set(year, report);
    return report;
  }

  if (state.readinessReport?.sourceYear === year) {
    state.readinessReportCache.set(year, state.readinessReport);
    return state.readinessReport;
  }

  state.readinessReportCache.set(year, null);
  return null;
};

const summarizeRouteReport = (report) => {
  if (report.summary) return report.summary;

  const routeRaces = report.routeRaces ?? [];
  const entries = routeRaces.flatMap((race) => race.entries ?? []);
  const completedRaces = routeRaces.filter((race) => (race.entries?.length ?? 0) > 0);

  return {
    analysisState: routeRaces.length === 0
      ? "awaiting-route-data"
      : completedRaces.length === routeRaces.length
        ? "complete-results"
        : "partial-results",
    raceCount: routeRaces.length,
    completedRaceCount: completedRaces.length,
    pendingRaceCount: routeRaces.length - completedRaces.length,
    entryCount: entries.length,
    uniqueHorseCount: new Set(entries.map((entry) => entry.horse_name).filter(Boolean)).size,
    pedigreeCoverage: percentage(entries.filter((entry) => entry.sire && entry.dam && entry.damsire).length, entries.length),
    ownerCoverage: percentage(entries.filter((entry) => entry.owner).length, entries.length),
    jockeyCoverage: percentage(entries.filter((entry) => entry.jockey_name).length, entries.length)
  };
};

const analysisStateLabels = {
  "awaiting-route-data": "Rota verisi bekleniyor",
  "partial-results": "Kısmi sonuçlar",
  "complete-results": "Sonuçlar tamamlandı"
};

const renderDataStatus = (report) => {
  const summary = summarizeRouteReport(report);
  const statusSummary = document.querySelector("#data-status-summary");

  statusSummary.textContent = `${report.year} Gazi rotası için ${summary.completedRaceCount}/${summary.raceCount} koşunun at bazlı sonucu hazır. Son rapor: ${formatTimestamp(report.generatedAt)}.`;

  const metrics = [
    ["Rapor yılı", report.year],
    ["Koşu durumu", analysisStateLabels[summary.analysisState] ?? summary.analysisState],
    ["At startı", summary.entryCount],
    ["Tekil at", summary.uniqueHorseCount],
    ["Soy hattı kapsamı", `%${summary.pedigreeCoverage}`],
    ["Sahip kapsamı", `%${summary.ownerCoverage}`],
    ["Jokey kapsamı", `%${summary.jockeyCoverage}`]
  ];

  document.querySelector("#status-metrics").innerHTML = metrics
    .map(([label, value]) => `
      <div class="status-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `)
    .join("");

  const routeRaces = report.routeRaces ?? [];
  document.querySelector("#coverage-list").innerHTML = routeRaces.length
    ? routeRaces.map((race) => {
      const entryCount = race.entries?.length ?? 0;
      const isComplete = entryCount > 0;
      return `
        <div class="coverage-row">
          <span class="coverage-state ${isComplete ? "coverage-state--complete" : ""}" aria-hidden="true"></span>
          <div>
            <strong>${escapeHtml(race.name)}</strong>
            <span>${formatDate(race.date)} · ${escapeHtml(formatText(race.venue))}</span>
          </div>
          <em>${isComplete ? `${entryCount} at` : "Sonuç bekleniyor"}</em>
        </div>
      `;
    }).join("")
    : '<p class="coverage-empty">Henüz eşleşen rota koşusu bulunamadı.</p>';
};

const renderReadinessArtifact = (report) => {
  const container = document.querySelector("#readiness-artifact");
  if (!container) return;

  if (!report) {
    container.innerHTML = "";
    return;
  }

  const summary = report.summary ?? {};
  const quality = report.quality ?? {};
  const metrics = [
    ["Analiz yılı", report.sourceYear ?? "-"],
    ["Koşucu", summary.runnerCount ?? 0],
    ["Uyarı", quality.warningCount ?? 0],
    ["Ana skor", summary.topScoreHorse ?? "-"],
    ["Upside", summary.topUpsideHorse ?? "-"],
    ["Belirsizlik", summary.topUncertaintyHorse ?? "-"]
  ];
  const rankingLenses = [
    ["score", "Ana skor"],
    ["upside", "Upside"],
    ["uncertainty", "Belirsizlik"]
  ];

  container.innerHTML = `
    <article class="artifact-card">
      <div>
        <p class="section-kicker">Analiz artifact'i</p>
        <h3>Readiness JSON hazır</h3>
        <p>Otomatik pipeline tarafından üretilen skor raporu. UI, API ve ileride MCP yüzeyi aynı analiz çıktısını kullanabilir.</p>
      </div>
      <div class="artifact-card__metrics">
        ${metrics.map(([label, value]) => `
          <span>
            <small>${escapeHtml(label)}</small>
            <strong>${escapeHtml(value)}</strong>
          </span>
        `).join("")}
      </div>
      ${quality.warnings?.length ? `
        <div class="artifact-quality" aria-label="Readiness veri kalite uyarıları">
          ${quality.warnings.slice(0, 3).map((warning) => `<span>${escapeHtml(warning)}</span>`).join("")}
        </div>
      ` : `
        <div class="artifact-quality artifact-quality--clean" aria-label="Readiness veri kalite durumu">
          <span>Artifact kalite kontrolünde kritik uyarı yok.</span>
        </div>
      `}
      <div class="artifact-rankings" aria-label="Readiness artifact ilk 3 listeleri">
        ${rankingLenses.map(([key, label]) => {
          const entries = report.rankings?.[key]?.slice(0, 3) ?? [];
          return `
            <div class="artifact-ranking">
              <div class="artifact-ranking__header">
                <strong>${escapeHtml(label)}</strong>
                ${report.lensSummaries?.[key] ? `<em>Ort. ${escapeHtml(report.lensSummaries[key].averageValue ?? "-")} · Güçlü ${escapeHtml(report.lensSummaries[key].highSignalCount ?? 0)} · İzleme ${escapeHtml(report.lensSummaries[key].watchlistCount ?? 0)}</em>` : ""}
              </div>
              ${entries.length
                ? entries.map((entry) => `
                  <span>
                    <b>${escapeHtml(entry.rank)}. ${escapeHtml(entry.horseName)}</b>
                    <small>${escapeHtml(entry.lensValue)}/100</small>
                  </span>
                `).join("")
                : '<em>Liste bekleniyor</em>'}
            </div>
          `;
        }).join("")}
      </div>
      <a class="artifact-card__link" href="${escapeHtml(report.artifactPath ?? "./data/gazi-readiness-report.json")}" download>JSON indir</a>
      <em>Son üretim: ${escapeHtml(formatTimestamp(report.generatedAt))}</em>
    </article>
  `;
};

const renderDataManifest = (manifest) => {
  const container = document.querySelector("#data-manifest");
  if (!container) return;

  if (!manifest) {
    container.innerHTML = "";
    return;
  }

  const metrics = [
    ["Yıl aralığı", manifest.summary?.yearRange ?? "-"],
    ["Sezon", manifest.summary?.yearCount ?? 0],
    ["Rota JSON", manifest.summary?.routeReportCount ?? 0],
    ["Katılım JSON", manifest.summary?.participationReportCount ?? 0],
    ["Readiness JSON", manifest.summary?.readinessReportCount ?? 0]
  ];
  const readinessHealth = manifest.reports?.readiness ?? [];

  container.innerHTML = `
    <article class="manifest-card">
      <div>
        <p class="section-kicker">Veri kataloğu</p>
        <h3>Artifact manifest</h3>
        <p>Canlı siteye taşınan veri dosyalarının keşif indeksi. API/MCP tarafında ilk okunacak katalog budur.</p>
      </div>
      <div class="manifest-card__metrics">
        ${metrics.map(([label, value]) => `
          <span>
            <small>${escapeHtml(label)}</small>
            <strong>${escapeHtml(value)}</strong>
          </span>
        `).join("")}
      </div>
      ${readinessHealth.length ? `
        <div class="manifest-health" aria-label="Yıllık readiness kalite durumu">
          ${readinessHealth.map((entry) => {
            const warningCount = entry.summary?.warningCount ?? 0;
            const healthLabel = warningCount ? `${warningCount} uyarı` : "temiz";
            const healthClass = warningCount ? "manifest-year-chip--warn" : "manifest-year-chip--clean";

            return `
              <a class="manifest-year-chip ${healthClass}" href="./${escapeHtml(entry.path)}" download>
                <strong>${escapeHtml(entry.year)}</strong>
                <span>${escapeHtml(healthLabel)}</span>
              </a>
            `;
          }).join("")}
        </div>
      ` : ""}
      <a class="artifact-card__link" href="./data/padok-data-manifest.json" download>Manifest indir</a>
      <em>Son üretim: ${escapeHtml(formatTimestamp(manifest.generatedAt))}</em>
    </article>
  `;
};

const getArtifactLensRows = (horseName) => {
  if (!state.readinessReport?.rankings || !horseName) return [];

  return [
    ["score", "Ana skor"],
    ["upside", "Upside"],
    ["lowRisk", "Düşük risk"],
    ["uncertainty", "Belirsizlik"]
  ].map(([key, label]) => {
    const entry = state.readinessReport.rankings[key]?.find((ranking) => ranking.horseName === horseName);
    return entry
      ? {
        label,
        rank: entry.rank,
        value: entry.lensValue,
        badge: entry.badge
      }
      : {
        label,
        rank: "-",
        value: "-",
        badge: "Artifact içinde yok"
      };
  });
};

const renderArtifactLensPanel = (horseName) => {
  const lensRows = getArtifactLensRows(horseName);
  if (!lensRows.length) return "";

  return `
    <div class="artifact-lens-panel">
      <div>
        <span>Artifact sırası</span>
        <strong>${escapeHtml(state.readinessReport?.sourceYear ?? "-")} readiness raporu</strong>
        <p>Bu atın otomatik üretilen JSON raporundaki lens sıralamaları.</p>
      </div>
      <div class="artifact-lens-panel__grid">
        ${lensRows.map((row) => `
          <span>
            <small>${escapeHtml(row.label)}</small>
            <strong>${escapeHtml(row.rank)}.</strong>
            <em>${escapeHtml(row.value)}/100 · ${escapeHtml(row.badge)}</em>
          </span>
        `).join("")}
      </div>
    </div>
  `;
};

const horizonTierStatusLabels = {
  complete: "Tamamlandı",
  "in-progress": "Sürüyor",
  planned: "Planlandı",
  research: "Araştırma"
};

const renderDataHorizon = (report) => {
  const summary = report.summary;

  document.querySelector("#data-horizon-summary").textContent = `${summary.currentYearRange} aralığında ${summary.highConfidenceYearCount} yüksek güvenli sezon, ${summary.totalRouteRaceCount} rota koşusu ve ${summary.totalHorseStartCount} at startı var.`;

  const metrics = [
    ["Mevcut sezon", summary.currentYearCount],
    ["Yüksek güven", summary.highConfidenceYearCount],
    ["Birincil hedef", summary.primaryTargetYearRange],
    ["Hedef doluluk", `%${summary.primaryTargetCoverageRate}`],
    ["Genişletme", summary.expansionTargetYearRange],
    ["Genişletme doluluk", `%${summary.expansionTargetCoverageRate}`]
  ];

  document.querySelector("#data-horizon-metrics").innerHTML = metrics
    .map(([label, value]) => `
      <div class="status-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `)
    .join("");

  document.querySelector("#data-horizon-tiers").innerHTML = report.tiers
    .map((tier) => `
      <div class="horizon-tier horizon-tier--${escapeHtml(tier.key)}">
        <div>
          <strong>${escapeHtml(tier.yearRange)}</strong>
          <span>${escapeHtml(tier.label)}</span>
        </div>
        <p>${escapeHtml(tier.purpose)}</p>
        <em>${escapeHtml(horizonTierStatusLabels[tier.status] ?? tier.status)}${tier.coveredYears.length ? ` · ${escapeHtml(tier.coveredYears.join(", "))}` : ""}</em>
      </div>
    `)
    .join("");

  document.querySelector("#data-horizon-warning").textContent = report.methodology.warning;
};

const sampleStateLabels = {
  "early-sample": "Erken örneklem",
  "usable-sample": "Kullanılabilir örneklem"
};

const renderBacktest = (report) => {
  const summary = report.summary;
  const yearRange = summary.years.length > 1
    ? `${summary.years[0]}-${summary.years.at(-1)}`
    : String(summary.years[0] ?? "Bekleniyor");

  document.querySelector("#backtest-summary").textContent = `${yearRange} sezonlarında Gazi ilk 3 sıralamasındaki ${summary.totalGaziTopThreeSlots} yerin ${summary.coveredGaziTopThreeSlots} tanesi, izlediğimiz rota koşularından en az birine katılmıştı.`;

  const metrics = [
    ["Sezon", summary.seasonCount],
    ["İncelenen prova", summary.prepRaceCount],
    ["Rota kapsaması", `%${summary.routeCoverageRate}`],
    ["Örneklem durumu", sampleStateLabels[summary.sampleState] ?? summary.sampleState]
  ];

  document.querySelector("#backtest-metrics").innerHTML = metrics
    .map(([label, value]) => `
      <div class="status-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `)
    .join("");

  document.querySelector("#backtest-table").innerHTML = `
    <div class="backtest-row backtest-row--header" aria-hidden="true">
      <span>Koşu</span>
      <span>Gazi ilk 3 kapsama</span>
      <span>Prova ilk 3 isabeti</span>
      <span>Kazanan Gazi ilk 3</span>
      <span>Gazi'ye gelen</span>
    </div>
    ${report.aggregate.map((race) => `
      <div class="backtest-row">
        <div>
          <strong>${escapeHtml(race.name)}</strong>
          <span>${race.seasonsObserved} sezon · ${race.participantCount} at</span>
        </div>
        <strong>%${race.gaziTopThreeCoverageRate}</strong>
        <strong>%${race.prepTopThreeHitRate}</strong>
        <strong>%${race.winnerGaziTopThreeRate}</strong>
        <strong>%${race.gaziRunnerRate}</strong>
      </div>
    `).join("")}
  `;

  document.querySelector("#season-list").innerHTML = report.seasons
    .map((season) => `
      <div class="season-row">
        <div>
          <strong>${season.year} Gazi</strong>
          <span>${formatDate(season.gaziDate)}</span>
        </div>
        <div class="season-row__result">
          <strong>%${season.routeCoverageRate} rota kapsaması</strong>
          <span>${season.gaziTopThree.map((entry) => `${entry.finishPosition}. ${escapeHtml(entry.horseName)}${entry.seenInRoute ? " · rota" : " · rota dışı"}`).join("<br />")}</span>
        </div>
      </div>
    `)
    .join("");

  document.querySelector("#backtest-warning").textContent = report.methodology.warning;
};

const participationStateLabels = {
  "field-available": "Gazi koşucuları hazır",
  "awaiting-gazi-field": "Gazi koşucuları bekleniyor"
};

const participationFilterLabels = {
  all: "Tüm atlar",
  noPrep: "Rota dışı",
  podium: "Gazi ilk 3",
  jockeyChange: "Jokey değişen"
};

const cellLabels = {
  ran: "Koştu",
  "not-run": "Yok",
  pending: "Bekliyor",
  "missing-race": "Veri yok"
};

const renderParticipationCell = (cell) => {
  const status = cell?.status ?? "missing-race";
  if (status === "ran") {
    return `
      <span class="participation-cell participation-cell--ran">
        <strong>${escapeHtml(formatPosition(cell.finishPosition))}</strong>
        <small>${escapeHtml(cell.jockeyName ?? "")}</small>
      </span>
    `;
  }

  return `
    <span class="participation-cell participation-cell--${escapeHtml(status)}">
      <strong>${escapeHtml(cellLabels[status] ?? status)}</strong>
      <small>${status === "not-run" ? "Katılmadı" : ""}</small>
    </span>
  `;
};

const getParticipationRouteStarts = (row, columns) => {
  return columns
    .map((column) => ({
      column,
      cell: row.cells[column.key]
    }))
    .filter(({ cell }) => cell?.status === "ran");
};

const getPrepRaceStates = (row, prepColumns) => {
  if (row.prepRaceStates?.length) return row.prepRaceStates;

  return prepColumns.map((column) => {
    const cell = row.cells[column.key] ?? { status: "missing-race" };

    return {
      raceKey: column.key,
      raceName: column.name,
      date: column.date,
      status: cell.status,
      finishPosition: cell.finishPosition ?? null,
      jockeyName: cell.jockeyName ?? null,
      handicapPoint: cell.handicapPoint ?? null,
      startingPrice: cell.startingPrice ?? null
    };
  });
};

const getPrepRaceStateMeta = (race) => {
  if (race.status === "ran") {
    return {
      label: formatPosition(race.finishPosition),
      note: race.jockeyName ? race.jockeyName : "Jokey bekleniyor"
    };
  }

  if (race.status === "not-run") {
    return {
      label: "Katılmadı",
      note: "Rota sinyali yok"
    };
  }

  if (race.status === "pending") {
    return {
      label: "Bekliyor",
      note: "Sonuç bekleniyor"
    };
  }

  return {
    label: "Veri yok",
    note: "Kaynak bekleniyor"
  };
};

const buildRouteVisibilityFallback = (prepStates) => {
  const totalRaceCount = prepStates.length;
  const ranCount = prepStates.filter((race) => race.status === "ran").length;
  const skippedCount = prepStates.filter((race) => race.status === "not-run").length;
  const pendingCount = prepStates.filter((race) => race.status === "pending").length;
  const missingCount = prepStates.filter((race) => race.status === "missing-race").length;
  const completedSignalCount = ranCount + skippedCount;
  const score = totalRaceCount ? Math.round((ranCount / totalRaceCount) * 100) : 0;
  const dataCompleteness = totalRaceCount ? Math.round((completedSignalCount / totalRaceCount) * 100) : 0;
  const label = pendingCount
    ? "Sonuç bekleyen rota"
    : ranCount >= 2
      ? "Geniş rota görünürlüğü"
      : ranCount === 1
        ? "Tek koşu sinyali"
        : totalRaceCount
          ? "Rota dışı profil"
          : "Rota verisi yok";
  const reason = pendingCount
    ? "Bazı hazırlık koşuları tamamlanınca bu okuma güçlenecek."
    : ranCount >= 2
      ? "At birden fazla takip koşusunda göründüğü için rota sinyali daha okunabilir."
      : ranCount === 1
        ? "At yalnızca bir takip koşusunda göründü; form sinyali var ama dar."
        : totalRaceCount
          ? "At takip edilen hazırlık rotasına katılmadan Gazi alanına gelmiş."
          : "Bu sezon için takip edilen hazırlık koşusu bulunamadı.";

  return {
    score,
    label,
    reason,
    totalRaceCount,
    ranCount,
    skippedCount,
    pendingCount,
    missingCount,
    dataCompleteness
  };
};

const getRouteVisibility = (row, prepColumns) => {
  return row.routeVisibility ?? buildRouteVisibilityFallback(getPrepRaceStates(row, prepColumns));
};

const renderRouteVisibilityPanel = (visibility) => {
  return `
    <div class="route-visibility-panel">
      <div>
        <span>Rota görünürlüğü</span>
        <strong>${escapeHtml(visibility.label)} · ${escapeHtml(visibility.score)}/100</strong>
        <p>${escapeHtml(visibility.reason)}</p>
      </div>
      <div class="route-visibility-panel__metrics">
        ${[
          ["Koştu", visibility.ranCount],
          ["Pas", visibility.skippedCount],
          ["Bekliyor", visibility.pendingCount],
          ["Veri", `%${visibility.dataCompleteness}`]
        ].map(([label, value]) => `
          <span>
            <small>${escapeHtml(label)}</small>
            <b>${escapeHtml(value)}</b>
          </span>
        `).join("")}
      </div>
    </div>
  `;
};

const getRouteVisibilityCounts = (report, tableColumns) => {
  if (report.summary?.routeVisibilityCounts) return report.summary.routeVisibilityCounts;

  return (report.rows ?? []).reduce((counts, row) => {
    const label = getRouteVisibility(row, tableColumns.filter((column) => !column.isTarget)).label;
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});
};

const renderRouteVisibilitySummary = (report, tableColumns) => {
  const container = document.querySelector("#route-visibility-summary");
  if (!container) return;

  const counts = getRouteVisibilityCounts(report, tableColumns);
  const total = report.summary?.gaziRunnerCount ?? report.rows?.length ?? 0;
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"));

  if (!rows.length || total === 0) {
    container.innerHTML = "";
    return;
  }

  const dominant = rows[0];
  const dominantRate = Math.round((dominant[1] / total) * 100);

  container.innerHTML = `
    <button class="route-visibility-summary__intro ${state.routeVisibilityFilter === "all" ? "route-visibility-summary__intro--selected" : ""}" type="button" data-route-visibility-filter="all" aria-pressed="${state.routeVisibilityFilter === "all"}">
      <span>Alan kompozisyonu</span>
      <strong>${escapeHtml(dominant[0])}</strong>
      <p>${escapeHtml(`${dominant[1]}/${total} at bu grupta. Bu sezonun baskın rota okuması %${dominantRate} ağırlıkla burada.`)}</p>
    </button>
    <div class="route-visibility-summary__grid">
      ${rows.map(([label, count]) => {
        const rate = Math.round((count / total) * 100);
        const isSelected = state.routeVisibilityFilter === label;

        return `
          <button class="route-visibility-summary__chip ${isSelected ? "route-visibility-summary__chip--selected" : ""}" type="button" data-route-visibility-filter="${escapeHtml(label)}" aria-pressed="${isSelected}">
            <small>${escapeHtml(label)}</small>
            <strong>${escapeHtml(count)} at</strong>
            <em>%${escapeHtml(rate)}</em>
          </button>
        `;
      }).join("")}
    </div>
  `;
};

const renderPrepSignalStrip = (row, prepColumns) => {
  const prepStates = getPrepRaceStates(row, prepColumns);
  if (!prepStates.length) return "";

  return `
    <div class="prep-signal-strip" aria-label="Hazırlık koşusu sinyal durumu">
      ${prepStates.map((race) => {
        const meta = getPrepRaceStateMeta(race);

        return `
          <span class="prep-signal prep-signal--${escapeHtml(race.status)}">
            <small>${escapeHtml(race.raceName)}</small>
            <strong>${escapeHtml(meta.label)}</strong>
            <em>${escapeHtml(meta.note)}</em>
          </span>
        `;
      }).join("")}
    </div>
  `;
};

const rowHasJockeyChange = (row, columns) => {
  const starts = getParticipationRouteStarts(row, columns);
  const jockeyNames = new Set(starts.map(({ cell }) => cell.jockeyName).filter(Boolean));

  return jockeyNames.size > 1;
};

const getFilteredParticipationRows = (rows, tableColumns) => {
  const prepColumns = tableColumns.filter((column) => !column.isTarget);
  const applyRouteVisibilityFilter = (filteredRows) => {
    if (state.routeVisibilityFilter === "all") return filteredRows;

    return filteredRows.filter((row) => getRouteVisibility(row, prepColumns).label === state.routeVisibilityFilter);
  };

  if (state.participationFilter === "noPrep") {
    return applyRouteVisibilityFilter(rows.filter((row) => row.prepStartCount === 0));
  }

  if (state.participationFilter === "podium") {
    return applyRouteVisibilityFilter(rows.filter((row) => Number.isFinite(row.gaziFinishPosition) && row.gaziFinishPosition <= 3));
  }

  if (state.participationFilter === "jockeyChange") {
    return applyRouteVisibilityFilter(rows.filter((row) => rowHasJockeyChange(row, tableColumns)));
  }

  return applyRouteVisibilityFilter(rows);
};

const formatHorseNames = (rows, limit = 3) => {
  if (!rows.length) return "Yok";

  const names = rows.slice(0, limit).map((row) => row.horseName);
  const remainingCount = rows.length - names.length;

  return remainingCount > 0
    ? `${names.join(", ")} +${remainingCount}`
    : names.join(", ");
};

const getParticipationTableColumns = (report) => {
  const prepColumns = report.columns.filter((column) => !column.isTarget);
  const targetColumn = report.columns.find((column) => column.isTarget);

  return targetColumn ? [...prepColumns, targetColumn] : prepColumns;
};

const summarizeParticipationPattern = (report) => {
  const rows = report.rows ?? [];
  const tableColumns = getParticipationTableColumns(report);
  const podiumRows = rows
    .filter((row) => Number.isFinite(row.gaziFinishPosition) && row.gaziFinishPosition <= 3)
    .sort((a, b) => a.gaziFinishPosition - b.gaziFinishPosition);
  const noPrepPodiumRows = podiumRows.filter((row) => row.prepStartCount === 0);
  const prepWinnerPodiumRows = podiumRows.filter((row) => row.bestPrepFinishPosition === 1);
  const jockeyChangePodiumRows = podiumRows.filter((row) => rowHasJockeyChange(row, tableColumns));

  return {
    year: report.sourceYear,
    runnerCount: rows.length,
    topThreePrepStartRate: report.summary.topThreePrepStartRate ?? 0,
    noPrepPodiumRows,
    prepWinnerPodiumRows,
    jockeyChangePodiumRows
  };
};

const buildHistoricalPatterns = (reports) => {
  const seasons = reports
    .map(summarizeParticipationPattern)
    .filter((season) => season.runnerCount > 0)
    .sort((a, b) => b.year - a.year);

  if (!seasons.length) {
    return [
      {
        label: "Tarihsel örneklem",
        value: "Bekleniyor",
        text: "Gazi koşucu listesi olan sezonlar geldikçe tekrar eden rota patternleri burada birikecek."
      }
    ];
  }

  const noPrepPodiumSeasons = seasons.filter((season) => season.noPrepPodiumRows.length > 0);
  const prepWinnerPodiumSeasons = seasons.filter((season) => season.prepWinnerPodiumRows.length > 0);
  const jockeyChangePodiumSeasons = seasons.filter((season) => season.jockeyChangePodiumRows.length > 0);
  const fullCoverageSeasons = seasons.filter((season) => season.topThreePrepStartRate === 100);
  const averageTopThreeCoverage = Math.round(
    seasons.reduce((sum, season) => sum + season.topThreePrepStartRate, 0) / seasons.length
  );

  return [
    {
      label: "Tarihsel örneklem",
      value: `${seasons.length} sezon`,
      text: `${seasons.at(-1).year}-${seasons[0].year} arasında Gazi koşucu matrisi bulunan sezonlar okunuyor.`
    },
    {
      label: "Rota dışı ilk 3",
      value: `${noPrepPodiumSeasons.length} sezon`,
      text: noPrepPodiumSeasons.length
        ? `Örnekler: ${noPrepPodiumSeasons.map((season) => `${season.year} ${formatHorseNames(season.noPrepPodiumRows, 1)}`).slice(0, 3).join("; ")}.`
        : "İlk 3 tamamen izlenen prep rotasından gelmiş görünüyor."
    },
    {
      label: "Prep galibi etkisi",
      value: `${prepWinnerPodiumSeasons.length} sezon`,
      text: prepWinnerPodiumSeasons.length
        ? `Prep kazanıp Gazi ilk 3 yapan sezonlar: ${prepWinnerPodiumSeasons.map((season) => season.year).join(", ")}.`
        : "Prep galibiyeti örneklemde Gazi ilk 3'e taşınmamış."
    },
    {
      label: "İlk 3 kapsaması",
      value: `%${averageTopThreeCoverage}`,
      text: `${fullCoverageSeasons.length} sezonda Gazi ilk 3'ün tamamı izlenen prep rotasında en az bir kez göründü.`
    },
    {
      label: "Jokey değişimi",
      value: `${jockeyChangePodiumSeasons.length} sezon`,
      text: jockeyChangePodiumSeasons.length
        ? `İlk 3 içinde jokey değişimi görülen sezonlar: ${jockeyChangePodiumSeasons.map((season) => season.year).join(", ")}.`
        : "İlk 3 içinde rota boyunca jokey değişimi yakalanmadı."
    }
  ];
};

const getProfileTags = (row, tableColumns) => {
  const tags = [];

  if (row.prepStartCount === 0) {
    tags.push("Rota dışı");
  } else {
    tags.push("Prep gördü");
  }

  if (row.bestPrepFinishPosition === 1) {
    tags.push("Prep galibi");
  }

  if (rowHasJockeyChange(row, tableColumns)) {
    tags.push("Jokey değişti");
  }

  if (row.prepStartCount >= 2) {
    tags.push("Yoğun prep");
  }

  return tags;
};

const getHistoricalProfileMatches = (selectedRow, selectedReport, comparisonReports = state.participationComparison) => {
  if (!selectedRow || !comparisonReports.length) return [];

  const selectedColumns = getParticipationTableColumns(selectedReport);
  const selectedNoPrep = selectedRow.prepStartCount === 0;
  const selectedPrepWinner = selectedRow.bestPrepFinishPosition === 1;
  const selectedJockeyChange = rowHasJockeyChange(selectedRow, selectedColumns);
  const selectedActivePrep = selectedRow.prepStartCount >= 2;
  const selectedYear = selectedReport.sourceYear;

  return comparisonReports
    .filter((report) => Number.isFinite(report.sourceYear) && (!Number.isFinite(selectedYear) || report.sourceYear < selectedYear))
    .flatMap((report) => {
      const tableColumns = getParticipationTableColumns(report);

      return (report.rows ?? [])
        .filter((row) => Number.isFinite(row.gaziFinishPosition) && row.gaziFinishPosition <= 3)
        .map((row) => {
          const matchingSignals = [
            selectedNoPrep && row.prepStartCount === 0 ? "rota dışı" : null,
            selectedPrepWinner && row.bestPrepFinishPosition === 1 ? "prep galibi" : null,
            selectedJockeyChange && rowHasJockeyChange(row, tableColumns) ? "jokey değişimi" : null,
            selectedActivePrep && row.prepStartCount >= 2 ? "yoğun prep" : null
          ].filter(Boolean);

          return {
            ...row,
            year: report.sourceYear,
            matchingSignals
          };
        });
    })
    .filter((row) => row.matchingSignals.length > 0)
    .sort((a, b) => b.matchingSignals.length - a.matchingSignals.length || a.gaziFinishPosition - b.gaziFinishPosition || b.year - a.year)
    .slice(0, 4);
};

const summarizeProfileMatches = (matches) => {
  if (!matches.length) {
    return {
      count: 0,
      averageFinish: "-",
      strongestSignal: "Yok",
      note: "Geçmiş ilk 3 içinde aynı profil sinyaliyle güçlü eşleşme bulunmadı."
    };
  }

  const signalCounts = matches
    .flatMap((match) => match.matchingSignals)
    .reduce((counts, signal) => {
      counts.set(signal, (counts.get(signal) ?? 0) + 1);
      return counts;
    }, new Map());
  const strongestSignal = [...signalCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"))[0][0];
  const averageFinish = matches.reduce((sum, match) => sum + match.gaziFinishPosition, 0) / matches.length;
  const topTwoCount = matches.filter((match) => match.gaziFinishPosition <= 2).length;

  return {
    count: matches.length,
    averageFinish: averageFinish.toFixed(1),
    strongestSignal,
    note: `${topTwoCount}/${matches.length} benzer örnek Gazi'de ilk 2 içinde bitirmiş.`
  };
};

const buildProfileReading = (row, tableColumns, profileSummary) => {
  const hasJockeyChange = rowHasJockeyChange(row, tableColumns);
  const hasPrepWin = row.bestPrepFinishPosition === 1;
  const hasNoPrep = row.prepStartCount === 0;
  const numericAverage = Number.parseFloat(profileSummary.averageFinish);
  const strongContext = profileSummary.count >= 4 && Number.isFinite(numericAverage) && numericAverage <= 2.2;
  const mediumContext = profileSummary.count >= 2;
  const level = strongContext ? "Güçlü bağlam" : mediumContext ? "Orta bağlam" : "Zayıf bağlam";
  const primaryReason = hasNoPrep
    ? "Klasik rota dışında geldiği için geçmiş rota dışı ilk 3 örnekleriyle okunmalı."
    : hasPrepWin
      ? "Prep galibiyeti geçmişte Gazi ilk 3'e taşınabilen net bir rota sinyali üretmiş."
      : hasJockeyChange
        ? "Jokey değişimi olan geçmiş ilk 3 örnekleri bu profil için ana karşılaştırma alanı."
        : "Prep rotasında görünmesi olumlu bağlam verir, ancak tek başına ayırıcı sinyal değildir.";

  return {
    level,
    reason: primaryReason,
    caution: "Bu okuma sonuç tahmini değil; seçili atın profilini geçmiş ilk 3 örnekleriyle kıyaslar."
  };
};

const renderHistoricalPatterns = () => {
  const container = document.querySelector("#historical-patterns");
  if (!container) return;

  container.innerHTML = buildHistoricalPatterns(state.participationComparison)
    .map((pattern) => `
      <article class="pattern-card">
        <span>${escapeHtml(pattern.label)}</span>
        <strong>${escapeHtml(pattern.value)}</strong>
        <p>${escapeHtml(pattern.text)}</p>
      </article>
    `)
    .join("");
};

const buildParticipationInsights = (report, tableColumns) => {
  const rows = report.rows ?? [];
  const prepColumns = tableColumns.filter((column) => !column.isTarget);
  const summary = report.summary;
  const podiumRows = rows
    .filter((row) => Number.isFinite(row.gaziFinishPosition) && row.gaziFinishPosition <= 3)
    .sort((a, b) => a.gaziFinishPosition - b.gaziFinishPosition);
  const noPrepRows = rows.filter((row) => row.prepStartCount === 0);
  const noPrepPodiumRows = podiumRows.filter((row) => row.prepStartCount === 0);
  const jockeyChangeRows = rows.filter((row) => rowHasJockeyChange(row, tableColumns));
  const prepWinnerPodiumRows = podiumRows.filter((row) => row.bestPrepFinishPosition === 1);
  const routeStarterPodiumRows = podiumRows.filter((row) => row.prepStartCount > 0);
  const maxPrepStartCount = Math.max(0, ...rows.map((row) => row.prepStartCount ?? 0));
  const mostActivePrepRows = rows
    .filter((row) => row.prepStartCount === maxPrepStartCount && maxPrepStartCount > 0)
    .sort((a, b) => (a.gaziFinishPosition ?? 99) - (b.gaziFinishPosition ?? 99));
  const liveContext = summary.analysisState === "awaiting-gazi-field";

  if (!rows.length) {
    return [
      {
        label: "Canlı takip",
        value: `${report.sourceYear} sezonu izleniyor`,
        text: "Gazi koşucu listesi gelince aynı yapı otomatik olarak at bazlı matrise dönecek."
      },
      {
        label: "Rota durumu",
        value: `${prepColumns.length} sinyal koşusu`,
        text: "Sonuçlanan rota koşuları aday havuzunu erken okumak için kullanılacak."
      },
      {
        label: "Analiz sınırı",
        value: "Gazi bekleniyor",
        text: "Gazi sonucu olmadan başarı korelasyonu kurulmaz; sadece aday ve rota sinyali okunur."
      }
    ];
  }

  return [
    {
      label: "Rota kapsaması",
      value: `${summary.runnersWithPrepStartCount}/${summary.gaziRunnerCount} at`,
      text: `Gazi ilk 3 içinden ${routeStarterPodiumRows.length}/${podiumRows.length || 3} at izlenen prep rotasında göründü.`
    },
    {
      label: "Rota dışı başarı",
      value: `${noPrepRows.length} at`,
      text: noPrepPodiumRows.length
        ? `İlk 3 içinde rota dışı gelenler: ${formatHorseNames(noPrepPodiumRows)}.`
        : "İlk 3 içinde rota dışı gelen at yok; bu sezon klasik rota daha açıklayıcı."
    },
    {
      label: "Prep kazanıp gelen",
      value: `${prepWinnerPodiumRows.length} ilk 3 atı`,
      text: prepWinnerPodiumRows.length
        ? `Prep kazanıp Gazi ilk 3'e girenler: ${formatHorseNames(prepWinnerPodiumRows)}.`
        : "Prep kazanmak bu sezon Gazi ilk 3 için doğrudan işaret üretmedi."
    },
    {
      label: "Jokey hareketi",
      value: `${jockeyChangeRows.length} at`,
      text: `Rota boyunca jokey değişimi görünenler ayrı izlenmeli. En yoğun prep yolu: ${formatHorseNames(mostActivePrepRows, 2)} (${maxPrepStartCount} start).`
    },
    {
      label: liveContext ? "Canlı akış" : "Analiz notu",
      value: liveContext ? "Bekleyen veri" : "Eksik sinyal",
      text: liveContext
        ? "Koşular tamamlandıkça sonuçlar matrise eklenir; Gazi listesi geldiğinde at bazlı okuma başlar."
        : "Katılmama bilgisi performans cezası değil; sadece bu rota setinde gözlem yok anlamına gelir."
    }
  ];
};

const renderParticipationInsights = (report, tableColumns) => {
  document.querySelector("#participation-insights").innerHTML = buildParticipationInsights(report, tableColumns)
    .map((insight) => `
      <article class="insight-card">
        <span>${escapeHtml(insight.label)}</span>
        <strong>${escapeHtml(insight.value)}</strong>
        <p>${escapeHtml(insight.text)}</p>
      </article>
    `)
    .join("");
};

const getProfileAttentionScore = (row, tableColumns, profileSummary) => {
  const numericAverage = Number.parseFloat(profileSummary.averageFinish);
  const averageBoost = Number.isFinite(numericAverage) ? Math.max(0, Math.round(32 - (numericAverage * 8))) : 0;
  const prepWinBoost = row.bestPrepFinishPosition === 1 ? 14 : 0;
  const noPrepBoost = row.prepStartCount === 0 ? 10 : 0;
  const jockeyBoost = rowHasJockeyChange(row, tableColumns) ? 8 : 0;
  const prepVolumeBoost = row.prepStartCount >= 2 ? 6 : 0;

  return (profileSummary.count * 18) + averageBoost + prepWinBoost + noPrepBoost + jockeyBoost + prepVolumeBoost;
};

const getProfileSignalParts = (row, tableColumns, profileSummary) => {
  const numericAverage = Number.parseFloat(profileSummary.averageFinish);
  const averageBoost = Number.isFinite(numericAverage) ? Math.max(0, Math.round(32 - (numericAverage * 8))) : 0;
  const parts = [
    { label: "geçmiş", value: profileSummary.count * 18 },
    { label: "ortalama", value: averageBoost },
    { label: "prep galibi", value: row.bestPrepFinishPosition === 1 ? 14 : 0 },
    { label: "rota dışı", value: row.prepStartCount === 0 ? 10 : 0 },
    { label: "jokey", value: rowHasJockeyChange(row, tableColumns) ? 8 : 0 },
    { label: "yoğun prep", value: row.prepStartCount >= 2 ? 6 : 0 }
  ];

  return parts.filter((part) => part.value > 0);
};

const getReadinessAssessment = (row, tableColumns, profileSummary) => {
  return buildReadinessAssessment(row, profileSummary, {
    hasJockeyChange: rowHasJockeyChange(row, tableColumns)
  });
};

const getProfileReason = (row, tableColumns, profileSummary) => {
  if (row.prepStartCount === 0) {
    return "Takip edilen prep rotasında görünmeden Gazi profiline geliyor.";
  }

  if (row.bestPrepFinishPosition === 1) {
    return `${row.bestPrepRaceName ?? "Prep koşusu"} galibiyeti geçmiş ilk 3 örnekleriyle eşleşiyor.`;
  }

  if (rowHasJockeyChange(row, tableColumns)) {
    return "Jokey değişimi olan geçmiş ilk 3 profilleriyle karşılaştırılıyor.";
  }

  if (profileSummary.count >= 3) {
    return "Geçmiş ilk 3 içinde benzer profil yoğunluğu yüksek.";
  }

  return "Temel rota profili okunuyor; ayırıcı sinyal sınırlı.";
};

const renderReadinessLensControls = () => {
  return `
    <div class="readiness-lenses" aria-label="Readiness analiz mercekleri">
      ${Object.entries(readinessLensLabels).map(([key, lens]) => {
        const isSelected = state.readinessLens === key;
        return `
          <button class="lens-chip ${isSelected ? "lens-chip--selected" : ""}" type="button" data-readiness-lens="${escapeHtml(key)}" aria-pressed="${isSelected}">
            <strong>${escapeHtml(lens.label)}</strong>
            <span>${escapeHtml(lens.description)}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
};

const buildReadinessValidation = () => {
  const reports = [...state.participationComparison]
    .filter((report) => Number.isFinite(report.sourceYear) && (report.rows ?? []).some((row) => Number.isFinite(row.gaziFinishPosition)))
    .sort((a, b) => a.sourceYear - b.sourceYear);

  const seasons = reports
    .map((report) => {
      const previousReports = reports.filter((candidate) => candidate.sourceYear < report.sourceYear);
      if (!previousReports.length) return null;

      const tableColumns = getParticipationTableColumns(report);
      const rankedRows = (report.rows ?? [])
        .map((row) => {
          const matches = getHistoricalProfileMatches(row, report, previousReports);
          const profileSummary = summarizeProfileMatches(matches);
          return {
            row,
            readiness: getReadinessAssessment(row, tableColumns, profileSummary)
          };
        })
        .sort((a, b) => b.readiness.score - a.readiness.score || b.readiness.confidence - a.readiness.confidence);
      const predictedTopThree = rankedRows.slice(0, 3);
      const actualTopThreeNames = new Set((report.rows ?? [])
        .filter((row) => Number.isFinite(row.gaziFinishPosition) && row.gaziFinishPosition <= 3)
        .map((row) => row.horseName));
      const overlapCount = predictedTopThree.filter(({ row }) => actualTopThreeNames.has(row.horseName)).length;
      const topPick = predictedTopThree[0] ?? null;

      return {
        year: report.sourceYear,
        topPickName: topPick?.row.horseName ?? "-",
        topPickFinish: topPick?.row.gaziFinishPosition ?? null,
        topPickHit: Number.isFinite(topPick?.row.gaziFinishPosition) && topPick.row.gaziFinishPosition <= 3,
        overlapCount,
        runnerCount: report.summary?.gaziRunnerCount ?? report.rows?.length ?? 0
      };
    })
    .filter(Boolean);

  const topPickHits = seasons.filter((season) => season.topPickHit).length;
  const averageOverlap = seasons.length
    ? seasons.reduce((sum, season) => sum + season.overlapCount, 0) / seasons.length
    : 0;

  return {
    seasons,
    topPickHits,
    averageOverlap: averageOverlap.toFixed(1)
  };
};

const renderReadinessValidation = () => {
  const validation = buildReadinessValidation();
  if (!validation.seasons.length) return "";

  const recentSeasons = validation.seasons.slice(-3).reverse();

  return `
    <div class="model-check" aria-label="Readiness model kontrolü">
      <div>
        <p class="section-kicker">Model kontrolü</p>
        <h4>Readiness geçmişte ne yakaladı?</h4>
        <span>Her sezon yalnızca kendinden önceki sezonlardan öğrenilerek kontrol edilir.</span>
      </div>
      <div class="model-check__metrics">
        <div>
          <span>Top aday ilk 3</span>
          <strong>${escapeHtml(validation.topPickHits)}/${escapeHtml(validation.seasons.length)}</strong>
        </div>
        <div>
          <span>Ortalama ilk 3 örtüşme</span>
          <strong>${escapeHtml(validation.averageOverlap)}/3</strong>
        </div>
      </div>
      <div class="model-check__seasons">
        ${recentSeasons.map((season) => `
          <span>
            <strong>${escapeHtml(season.year)}</strong>
            ${escapeHtml(season.topPickName)} · Gazi ${escapeHtml(formatPosition(season.topPickFinish))} · ${escapeHtml(season.overlapCount)}/3
          </span>
        `).join("")}
      </div>
    </div>
  `;
};

const renderProfileShortlist = (report, tableColumns) => {
  const rows = report.rows ?? [];
  const profiles = rows
    .map((row) => {
      const historicalMatches = getHistoricalProfileMatches(row, report);
      const profileSummary = summarizeProfileMatches(historicalMatches);
      const profileReading = buildProfileReading(row, tableColumns, profileSummary);

      return {
        row,
        profileSummary,
        profileReading,
        reason: getProfileReason(row, tableColumns, profileSummary),
        signalParts: getProfileSignalParts(row, tableColumns, profileSummary),
        readiness: getReadinessAssessment(row, tableColumns, profileSummary),
        tags: getProfileTags(row, tableColumns),
        score: getProfileAttentionScore(row, tableColumns, profileSummary)
      };
    });
  const readinessBoard = sortReadinessProfiles(profiles, state.readinessLens).slice(0, 4);
  const shortlist = [...profiles]
    .sort((a, b) => b.score - a.score || (a.row.gaziFinishPosition ?? 99) - (b.row.gaziFinishPosition ?? 99))
    .slice(0, 5);
  const surpriseRadar = [...profiles]
    .filter(({ row }) => row.prepStartCount === 0 || rowHasJockeyChange(row, tableColumns))
    .sort((a, b) => {
      const aSurprise = (a.row.prepStartCount === 0 ? 34 : 0) + (rowHasJockeyChange(a.row, tableColumns) ? 12 : 0);
      const bSurprise = (b.row.prepStartCount === 0 ? 34 : 0) + (rowHasJockeyChange(b.row, tableColumns) ? 12 : 0);
      return (b.score + bSurprise) - (a.score + aSurprise);
    })
    .slice(0, 3);

  document.querySelector("#profile-shortlist").innerHTML = shortlist.length
    ? `
      <div class="profile-shortlist__header">
        <div>
          <p class="section-kicker">Tahmin okuması</p>
          <h3>Aday profilleri nasıl önceliklendiriyoruz?</h3>
        </div>
        <span>Readiness skoru Gazi sonucunu kullanmaz; prep formu, rota şekli, profil kanıtı ve veri güvenini birleştirir.</span>
      </div>
      ${renderReadinessValidation()}
      ${renderReadinessLensControls()}
      <div class="readiness-board" aria-label="Readiness skor tablosu">
        ${readinessBoard.map(({ row, readiness }) => `
          <button class="readiness-card ${row.horseName === state.selectedParticipationHorse ? "readiness-card--selected" : ""}" type="button" data-horse-name="${escapeHtml(row.horseName)}" aria-pressed="${row.horseName === state.selectedParticipationHorse}">
            <span>${escapeHtml(getReadinessLensBadge(readiness, state.readinessLens))}</span>
            <strong>${escapeHtml(row.horseName)}</strong>
            <div class="readiness-card__score">
              <b>${escapeHtml(getReadinessLensValue(readiness, state.readinessLens))}</b>
              <small>/100</small>
            </div>
            <p>${escapeHtml(getReadinessLensReason(row, readiness, state.readinessLens))}</p>
            <em>${escapeHtml(getReadinessLensMeta(readiness, state.readinessLens))}</em>
          </button>
        `).join("")}
      </div>
      ${surpriseRadar.length ? `
        <div class="surprise-radar">
          <div>
            <p class="section-kicker">Sürpriz radarı</p>
            <h4>Klasik rota dışındaki dikkat profilleri</h4>
          </div>
          <div class="surprise-radar__grid">
            ${surpriseRadar.map(({ row, profileSummary, tags, reason, signalParts }) => `
              <button class="radar-card ${row.horseName === state.selectedParticipationHorse ? "radar-card--selected" : ""}" type="button" data-horse-name="${escapeHtml(row.horseName)}" aria-pressed="${row.horseName === state.selectedParticipationHorse}">
                <strong>${escapeHtml(row.horseName)}</strong>
                <span>${escapeHtml(tags.join(" · "))}</span>
                <em>${escapeHtml(profileSummary.count)} geçmiş benzer · Ort. ${escapeHtml(profileSummary.averageFinish)}</em>
                <small>${escapeHtml(reason)}</small>
                <div class="signal-parts">
                  ${signalParts.slice(0, 3).map((part) => `<i>+${escapeHtml(part.value)} ${escapeHtml(part.label)}</i>`).join("")}
                </div>
              </button>
            `).join("")}
          </div>
        </div>
      ` : ""}
      <div class="profile-shortlist__header profile-shortlist__header--compact">
        <div>
          <p class="section-kicker">Profil kısa listesi</p>
          <h3>Benzerlik sinyali yüksek atlar</h3>
        </div>
        <span>Bu liste geçmiş ilk 3 profillerine benzeyen sinyalleri büyütür.</span>
      </div>
      <div class="profile-shortlist__grid">
        ${shortlist.map(({ row, profileSummary, profileReading, tags, score, reason, signalParts, readiness }) => `
          <button class="shortlist-card ${row.horseName === state.selectedParticipationHorse ? "shortlist-card--selected" : ""}" type="button" data-horse-name="${escapeHtml(row.horseName)}" aria-pressed="${row.horseName === state.selectedParticipationHorse}">
            <span>${escapeHtml(profileReading.level)}</span>
            <strong>${escapeHtml(row.horseName)}</strong>
            <em>${escapeHtml(score)} profil puanı · Readiness ${escapeHtml(readiness.score)} · ${escapeHtml(profileSummary.count)} eşleşme</em>
            <p>${escapeHtml(reason)}</p>
            <div class="signal-parts">
              ${signalParts.slice(0, 4).map((part) => `<i>+${escapeHtml(part.value)} ${escapeHtml(part.label)}</i>`).join("")}
            </div>
            <small>${escapeHtml(tags.join(" · "))}</small>
          </button>
        `).join("")}
      </div>
    `
    : "";
};

const renderParticipationFilters = (rows, tableColumns) => {
  const counts = {
    all: rows.length,
    noPrep: rows.filter((row) => row.prepStartCount === 0).length,
    podium: rows.filter((row) => Number.isFinite(row.gaziFinishPosition) && row.gaziFinishPosition <= 3).length,
    jockeyChange: rows.filter((row) => rowHasJockeyChange(row, tableColumns)).length
  };

  document.querySelector("#participation-filters").innerHTML = Object.entries(participationFilterLabels)
    .map(([key, label]) => {
      const isSelected = state.participationFilter === key;

      return `
        <button class="filter-chip ${isSelected ? "filter-chip--selected" : ""}" type="button" data-participation-filter="${escapeHtml(key)}" aria-pressed="${isSelected}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(counts[key])}</strong>
        </button>
      `;
    })
    .join("");
};

const getActiveParticipationFilters = () => {
  const filters = [];

  if (state.participationFilter !== "all") {
    filters.push(["Liste", participationFilterLabels[state.participationFilter] ?? state.participationFilter]);
  }

  if (state.routeVisibilityFilter !== "all") {
    filters.push(["Rota", state.routeVisibilityFilter]);
  }

  return filters;
};

const renderActiveFilterBar = (filteredRows, totalRows) => {
  const container = document.querySelector("#active-filter-bar");
  if (!container) return;

  const filters = getActiveParticipationFilters();
  if (!filters.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="active-filter-bar__content">
      <span>${escapeHtml(filteredRows.length)}/${escapeHtml(totalRows)} at gösteriliyor</span>
      ${filters.map(([label, value]) => `
        <strong>${escapeHtml(label)}: ${escapeHtml(value)}</strong>
      `).join("")}
    </div>
    <button class="active-filter-bar__clear" type="button" data-clear-participation-filters>Filtreleri temizle</button>
  `;
};

const averageRounded = (values) => {
  const numericValues = values.filter(Number.isFinite);
  if (!numericValues.length) return null;
  return Math.round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length);
};

const renderFilteredGroupSummary = (filteredRows, report, tableColumns) => {
  const container = document.querySelector("#filtered-group-summary");
  if (!container) return;

  const activeFilters = getActiveParticipationFilters();
  if (!activeFilters.length) {
    container.innerHTML = "";
    return;
  }

  if (!filteredRows.length) {
    container.innerHTML = `
      <article class="filtered-group-summary__empty">
        <span>Filtre grubu</span>
        <strong>Eşleşen at yok</strong>
        <p>Bu filtre kombinasyonu için Gazi koşucusu bulunamadı. Filtreleri temizleyip daha geniş bir gruba bakabilirsin.</p>
      </article>
    `;
    return;
  }

  const prepColumns = tableColumns.filter((column) => !column.isTarget);
  const profiles = filteredRows.map((row) => {
    const historicalMatches = getHistoricalProfileMatches(row, report);
    const profileSummary = summarizeProfileMatches(historicalMatches);
    const readiness = getReadinessAssessment(row, tableColumns, profileSummary);
    const routeVisibility = getRouteVisibility(row, prepColumns);

    return {
      row,
      profileSummary,
      readiness,
      routeVisibility
    };
  });
  const topReadiness = [...profiles].sort((a, b) => b.readiness.score - a.readiness.score || b.readiness.confidence - a.readiness.confidence)[0];
  const topUpside = [...profiles].sort((a, b) => b.readiness.upside - a.readiness.upside || b.readiness.score - a.readiness.score)[0];
  const noPrepCount = filteredRows.filter((row) => row.prepStartCount === 0).length;
  const prepWinnerCount = filteredRows.filter((row) => row.bestPrepFinishPosition === 1).length;
  const averageReadiness = averageRounded(profiles.map((profile) => profile.readiness.score));
  const averageRouteVisibility = averageRounded(profiles.map((profile) => profile.routeVisibility.score));
  const topNames = profiles
    .sort((a, b) => b.readiness.score - a.readiness.score || b.profileSummary.count - a.profileSummary.count)
    .slice(0, 3)
    .map((profile) => profile.row.horseName);

  container.innerHTML = `
    <article class="filtered-group-summary__intro">
      <span>Filtre grubu</span>
      <strong>${escapeHtml(filteredRows.length)} at · Ort. readiness ${escapeHtml(averageReadiness ?? "-")}</strong>
      <p>${escapeHtml(topNames.length ? `Bu grupta öne çıkanlar: ${topNames.join(", ")}.` : "Bu grup için aday listesi bekleniyor.")}</p>
    </article>
    <div class="filtered-group-summary__metrics">
      ${[
        ["En yüksek readiness", topReadiness ? `${topReadiness.row.horseName} · ${topReadiness.readiness.score}` : "-"],
        ["En yüksek upside", topUpside ? `${topUpside.row.horseName} · ${topUpside.readiness.upside}` : "-"],
        ["Rota dışı", `${noPrepCount} at`],
        ["Prep galibi", `${prepWinnerCount} at`],
        ["Ort. rota görünürlüğü", averageRouteVisibility === null ? "-" : `%${averageRouteVisibility}`]
      ].map(([label, value]) => `
        <span>
          <small>${escapeHtml(label)}</small>
          <strong>${escapeHtml(value)}</strong>
        </span>
      `).join("")}
    </div>
  `;
};

const renderParticipationDetail = (report, tableColumns, rows = report.rows) => {
  const selectedRow = rows.find((row) => row.horseName === state.selectedParticipationHorse)
    ?? rows[0];

  if (!selectedRow) {
    document.querySelector("#participation-detail").innerHTML = "";
    return;
  }

  state.selectedParticipationHorse = selectedRow.horseName;

  const prepColumns = tableColumns.filter((column) => !column.isTarget);
  const prepStarts = getParticipationRouteStarts(selectedRow, prepColumns);
  const allStarts = getParticipationRouteStarts(selectedRow, tableColumns);
  const jockeyNames = [...new Set(allStarts.map(({ cell }) => cell.jockeyName).filter(Boolean))];
  const sameJockeyAcrossRoute = jockeyNames.length <= 1;
  const prepPath = prepStarts.length
    ? prepStarts.map(({ column, cell }) => `${column.name} ${formatPosition(cell.finishPosition)}`).join(" · ")
    : "Takip edilen prep rotasında start yok";
  const profileTags = getProfileTags(selectedRow, tableColumns);
  const historicalMatches = getHistoricalProfileMatches(selectedRow, report);
  const profileSummary = summarizeProfileMatches(historicalMatches);
  const profileReading = buildProfileReading(selectedRow, tableColumns, profileSummary);
  const readiness = getReadinessAssessment(selectedRow, tableColumns, profileSummary);
  const routeVisibility = getRouteVisibility(selectedRow, prepColumns);

  const metrics = [
    ["Readiness", `${readiness.score}/100`],
    ["Gazi derecesi", formatPosition(selectedRow.gaziFinishPosition)],
    ["Prep startı", selectedRow.prepStartCount],
    ["Pas geçilen prep", selectedRow.skippedPrepCount],
    ["Jokey hattı", sameJockeyAcrossRoute ? "Sabit" : `${jockeyNames.length} jokey`]
  ];

  document.querySelector("#participation-detail").innerHTML = `
    <div class="horse-detail">
      <div class="horse-detail__header">
        <div>
          <p class="section-kicker">At detayı</p>
          <h3>${escapeHtml(selectedRow.horseName)}</h3>
          <p class="muted">
            ${escapeHtml(selectedRow.sire ?? "Baba bekleniyor")} / ${escapeHtml(selectedRow.dam ?? "Anne bekleniyor")}
            ${selectedRow.damsire ? ` · Anne baba: ${escapeHtml(selectedRow.damsire)}` : ""}
          </p>
        </div>
        <div class="horse-detail__owner">
          <span>Sahip</span>
          <strong>${escapeHtml(selectedRow.owner ?? "Bekleniyor")}</strong>
        </div>
      </div>

      <div class="horse-detail__metrics">
        ${metrics.map(([label, value]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `).join("")}
      </div>

      <div class="profile-reading">
        <span>Profil okuması</span>
        <strong>${escapeHtml(profileReading.level)}</strong>
        <p>${escapeHtml(profileReading.reason)}</p>
        <em>${escapeHtml(profileReading.caution)}</em>
      </div>

      ${renderRouteVisibilityPanel(routeVisibility)}

      ${renderPrepSignalStrip(selectedRow, prepColumns)}

      <div class="readiness-panel">
        <div>
          <span>Readiness skoru</span>
          <strong>${escapeHtml(readiness.label)} · ${escapeHtml(readiness.score)}/100</strong>
          <p>${escapeHtml(readiness.primaryReason)}</p>
        </div>
        <div class="readiness-bars">
          ${[
            ["Güven", readiness.confidence],
            ["Upside", readiness.upside],
            ["Risk", readiness.risk]
          ].map(([label, value]) => `
            <div class="readiness-bar">
              <span>${escapeHtml(label)} <strong>${escapeHtml(value)}</strong></span>
              <i style="--value: ${value}%"></i>
            </div>
          `).join("")}
        </div>
        <div class="signal-parts">
          ${readiness.parts.map((part) => `<i>+${escapeHtml(part.value)} ${escapeHtml(part.label)}</i>`).join("")}
        </div>
      </div>

      ${renderArtifactLensPanel(selectedRow.horseName)}

      <div class="horse-detail__grid">
        <div>
          <h4>Rota yolu</h4>
          <p>${escapeHtml(prepPath)}</p>
          <span>${selectedRow.bestPrepRaceName ? `En iyi prep: ${escapeHtml(selectedRow.bestPrepRaceName)} ${escapeHtml(formatPosition(selectedRow.bestPrepFinishPosition))}` : "Prep referansı yok"}</span>
        </div>
        <div>
          <h4>Jokey bağlamı</h4>
          <p>${jockeyNames.length ? escapeHtml(jockeyNames.join(" · ")) : "Jokey bilgisi bekleniyor"}</p>
          <span>${sameJockeyAcrossRoute ? "Rota boyunca jokey değişimi görünmüyor." : "Rota içinde jokey değişimi var; skor içinde ayrı izlenmeli."}</span>
        </div>
        <div>
          <h4>Veri yorumu</h4>
          <p>${selectedRow.hasPrepStart ? "Bu at için rota sinyali var." : "Bu at takip edilen prep rotası dışında Gazi'ye gelmiş."}</p>
          <span>Katılmama bilgisi performans cezası değil, eksik rota sinyalidir.</span>
        </div>
      </div>

      <div class="profile-match">
        <div>
          <h4>Profil etiketi</h4>
          <div class="profile-tags">
            ${profileTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
          <p class="profile-note">${escapeHtml(profileSummary.note)}</p>
        </div>
        <div>
          <div class="profile-match__header">
            <h4>Geçmiş ilk 3 benzerleri</h4>
            <div class="profile-score">
              <span><strong>${escapeHtml(profileSummary.count)}</strong> eşleşme</span>
              <span><strong>${escapeHtml(profileSummary.averageFinish)}</strong> ort. sıra</span>
              <span><strong>${escapeHtml(profileSummary.strongestSignal)}</strong></span>
            </div>
          </div>
          ${historicalMatches.length
            ? `<ul>
              ${historicalMatches.map((match) => `
                <li>
                  <strong>${escapeHtml(match.year)} · ${escapeHtml(match.horseName)} · Gazi ${escapeHtml(formatPosition(match.gaziFinishPosition))}</strong>
                  <span>${escapeHtml(match.matchingSignals.join(", "))}</span>
                </li>
              `).join("")}
            </ul>`
            : '<p class="muted">Bu profil için geçmiş ilk 3 içinde güçlü eşleşme yok.</p>'}
        </div>
      </div>
    </div>
  `;
};

const renderParticipation = (report) => {
  const summary = report.summary;
  const sourceYear = report.sourceYear ?? "Güncel";

  document.querySelector("#participation-summary").textContent = summary.gaziRunnerCount > 0
    ? `${sourceYear} Gazi koşucularının ${summary.runnersWithPrepStartCount}/${summary.gaziRunnerCount} tanesi izlediğimiz prep rotalarından en az birine katıldı; ${summary.runnersWithoutPrepStartCount} at bu rota koşularında görünmeden Gazi'ye geldi.`
    : `${sourceYear} sezonunda rota koşuları izleniyor, ancak Gazi koşucu listesi henüz rapora girmedi. Liste geldiğinde bu bölüm otomatik olarak at bazlı matrise dönecek.`;

  const metrics = [
    ["Durum", participationStateLabels[summary.analysisState] ?? summary.analysisState],
    ["Gazi atı", summary.gaziRunnerCount],
    ["Prep gören", summary.runnersWithPrepStartCount],
    ["Prep görmeyen", summary.runnersWithoutPrepStartCount],
    ["İlk 3 prep kapsaması", `%${summary.topThreePrepStartRate}`],
    ["Ortalama prep startı", summary.averagePrepStartCount ?? "-"]
  ];

  document.querySelector("#participation-metrics").innerHTML = metrics
    .map(([label, value]) => `
      <div class="status-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `)
    .join("");

  const tableColumns = getParticipationTableColumns(report);
  renderParticipationFilters(report.rows, tableColumns);
  renderRouteVisibilitySummary(report, tableColumns);
  renderParticipationInsights(report, tableColumns);
  renderProfileShortlist(report, tableColumns);

  const filteredRows = getFilteredParticipationRows(report.rows, tableColumns);
  renderActiveFilterBar(filteredRows, report.rows.length);
  renderFilteredGroupSummary(filteredRows, report, tableColumns);
  renderParticipationDetail(report, tableColumns, filteredRows);

  document.querySelector("#participation-table").innerHTML = filteredRows.length
    ? `
      <div class="participation-row participation-row--header" style="--race-count: ${tableColumns.length}">
        <span>At</span>
        <span>Özet</span>
        ${tableColumns.map((column) => `<span>${escapeHtml(column.name)}</span>`).join("")}
      </div>
      ${filteredRows.map((row) => `
        <button class="participation-row ${Number.isFinite(row.gaziFinishPosition) && row.gaziFinishPosition <= 3 ? "participation-row--podium" : ""} ${row.horseName === state.selectedParticipationHorse ? "participation-row--selected" : ""}" type="button" data-horse-name="${escapeHtml(row.horseName)}" style="--race-count: ${tableColumns.length}" aria-pressed="${row.horseName === state.selectedParticipationHorse}">
          <div class="participation-horse">
            <strong>${escapeHtml(row.horseName)}</strong>
            <span>Gazi ${escapeHtml(formatPosition(row.gaziFinishPosition))} · ${escapeHtml(row.gaziJockeyName ?? "Jokey bekleniyor")}</span>
            <small>${row.sire ? `Baba: ${escapeHtml(row.sire)}` : "Baba bilgisi bekleniyor"}${row.owner ? ` · Sahip: ${escapeHtml(row.owner)}` : ""}</small>
          </div>
          <div class="participation-summary-cell">
            <strong>${row.prepStartCount} prep startı</strong>
            <span>${row.bestPrepRaceName ? `En iyi: ${escapeHtml(row.bestPrepRaceName)} ${escapeHtml(formatPosition(row.bestPrepFinishPosition))}` : "Takip edilen prep yok"}</span>
            <small>${escapeHtml(getRouteVisibility(row, tableColumns.filter((column) => !column.isTarget)).label)}</small>
          </div>
          ${tableColumns.map((column) => renderParticipationCell(row.cells[column.key])).join("")}
        </button>
      `).join("")}
    `
    : report.rows.length
      ? '<p class="coverage-empty">Bu filtreyle eşleşen at yok.</p>'
      : '<p class="coverage-empty">Gazi koşucu listesi henüz olmadığı için at bazlı katılım matrisi bekleniyor.</p>';

  document.querySelector("#participation-warning").textContent = report.methodology.warning;
};

const renderRaceEntryPreview = (entries = []) => {
  const previewEntries = entries
    .filter((entry) => Number.isFinite(entry.finish_position) && entry.finish_position <= 3)
    .sort((a, b) => a.finish_position - b.finish_position);

  if (!previewEntries.length) return "";

  return `
    <div class="race-entry-preview" aria-label="İlk 3 önizleme">
      ${previewEntries.map((entry) => `
        <span>
          <strong>${escapeHtml(formatPosition(entry.finish_position))}</strong>
          ${escapeHtml(entry.horse_name)}
        </span>
      `).join("")}
    </div>
  `;
};

const renderRaceEntries = (entries = []) => {
  if (!entries.length) return "";

  return `
    ${renderRaceEntryPreview(entries)}
    <details class="race-entries-panel">
      <summary>
        <span>Tüm start listesini göster</span>
        <strong>${entries.length} at</strong>
      </summary>
      <div class="race-entries" aria-label="Koşu sonuçları">
        ${entries.map((entry) => `
          <div class="race-entry">
            <span class="race-entry__position">${escapeHtml(entry.finish_position)}</span>
            <div class="race-entry__horse">
              <strong>${escapeHtml(entry.horse_name)}</strong>
              <span>${escapeHtml(entry.jockey_name)}</span>
              <span class="race-entry__context">
                ${entry.sire ? `Baba: ${escapeHtml(entry.sire)}` : "Baba: Bekleniyor"}
                ${entry.owner ? ` · Sahip: ${escapeHtml(entry.owner)}` : ""}
              </span>
            </div>
            <div class="race-entry__result">
              <strong>${escapeHtml(entry.finish_time)}</strong>
              <span>HP ${formatText(entry.handicap_point)}</span>
            </div>
          </div>
        `).join("")}
      </div>
    </details>
  `;
};

const renderRouteReport = (report) => {
  document.querySelector("#race-grid").innerHTML = report.routeRaces
    .map((race) => `
      <article class="race-card race-card--route">
        <div class="race-card__top">
          <div>
            <p class="card-date">${formatDate(race.date)} · ${formatText(race.venue)}</p>
            <h3>${race.name}</h3>
            <p class="muted">${race.explanation}</p>
          </div>
          <span class="pill">${tierLabels[race.signalTier] ?? race.signalTier}</span>
        </div>
        <div class="race-facts">
          <div class="fact"><span>Mesafe</span><strong>${race.distance_m}m</strong></div>
          <div class="fact"><span>Pist</span><strong>${race.surface}</strong></div>
          <div class="fact"><span>Sinif</span><strong>${formatText(race.race_class)}</strong></div>
          <div class="fact"><span>Skor</span><strong>${race.similarityScore}</strong></div>
        </div>
        <div class="winner-line">
          <span>Kazanan</span>
          <strong>${formatText(race.winner_name)}</strong>
          ${race.jockey_name ? `<em>${race.jockey_name}</em>` : ""}
        </div>
        ${renderRaceEntries(race.entries)}
      </article>
    `)
    .join("");
};

const loadAnalysisYear = async (year) => {
  const numericYear = Number.parseInt(year, 10);
  if (!Number.isFinite(numericYear)) return;

  state.analysisYear = numericYear;
  state.selectedParticipationHorse = null;
  state.routeVisibilityFilter = "all";

  if (!state.routeReportCache.has(numericYear)) {
    state.routeReportCache.set(numericYear, await readJson(`./data/gazi-route-${numericYear}.json`));
  }

  if (!state.participationReportCache.has(numericYear)) {
    state.participationReportCache.set(numericYear, await readJson(`./data/gazi-participation-${numericYear}.json`));
  }

  state.routeReport = state.routeReportCache.get(numericYear);
  state.participationReport = state.participationReportCache.get(numericYear);
  state.readinessReport = await loadReadinessReport(numericYear);

  renderAnalysisYearControl();
  renderParticipationComparison();
  renderHistoricalPatterns();
  renderDataStatus(state.routeReport);
  renderReadinessArtifact(state.readinessReport);
  renderRouteReport(state.routeReport);
  renderParticipation(state.participationReport);
};

const bindEvents = () => {
  document.querySelector("#participation-table").addEventListener("click", (event) => {
    const row = event.target.closest("[data-horse-name]");
    if (!row || !state.participationReport) return;
    state.selectedParticipationHorse = row.dataset.horseName;
    renderParticipation(state.participationReport);
  });

  document.querySelector("#profile-shortlist").addEventListener("click", (event) => {
    const lensButton = event.target.closest("[data-readiness-lens]");
    if (lensButton && state.participationReport) {
      state.readinessLens = lensButton.dataset.readinessLens;
      renderParticipation(state.participationReport);
      return;
    }

    const row = event.target.closest("[data-horse-name]");
    if (!row || !state.participationReport) return;
    state.selectedParticipationHorse = row.dataset.horseName;
    renderParticipation(state.participationReport);
  });

  document.querySelector("#analysis-year-select").addEventListener("change", async (event) => {
    await loadAnalysisYear(event.target.value);
  });

  document.querySelector("#participation-comparison").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-analysis-year]");
    if (!button) return;
    await loadAnalysisYear(button.dataset.analysisYear);
  });

  document.querySelector("#participation-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-participation-filter]");
    if (!button || !state.participationReport) return;
    state.participationFilter = button.dataset.participationFilter;
    state.selectedParticipationHorse = null;
    renderParticipation(state.participationReport);
  });

  document.querySelector("#route-visibility-summary").addEventListener("click", (event) => {
    const button = event.target.closest("[data-route-visibility-filter]");
    if (!button || !state.participationReport) return;
    state.routeVisibilityFilter = button.dataset.routeVisibilityFilter;
    state.selectedParticipationHorse = null;
    renderParticipation(state.participationReport);
  });

  document.querySelector("#active-filter-bar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-clear-participation-filters]");
    if (!button || !state.participationReport) return;
    state.participationFilter = "all";
    state.routeVisibilityFilter = "all";
    state.selectedParticipationHorse = null;
    renderParticipation(state.participationReport);
  });
};

const init = async () => {
  const [knowledgeResponse, routeResponse, backtestResponse, participationResponse, readinessResponse, manifestResponse, horizonResponse] = await Promise.all([
    fetch("./data/gazi-knowledge-base.json", { cache: "no-store" }),
    fetch("./data/gazi-route-report.json", { cache: "no-store" }).catch(() => null),
    fetch("./data/gazi-backtest-report.json", { cache: "no-store" }).catch(() => null),
    fetch("./data/gazi-participation-report.json", { cache: "no-store" }).catch(() => null),
    fetch("./data/gazi-readiness-report.json", { cache: "no-store" }).catch(() => null),
    fetch("./data/padok-data-manifest.json", { cache: "no-store" }).catch(() => null),
    fetch("./data/gazi-data-horizon.json", { cache: "no-store" }).catch(() => null)
  ]);

  state.data = await knowledgeResponse.json();

  if (routeResponse?.ok) {
    state.routeReport = await routeResponse.json();
    state.analysisYear = state.routeReport.year;
    state.routeReportCache.set(state.routeReport.year, state.routeReport);
  }

  if (backtestResponse?.ok) {
    state.backtestReport = await backtestResponse.json();
  }

  if (participationResponse?.ok) {
    state.participationReport = await participationResponse.json();
    if (Number.isFinite(state.participationReport.sourceYear)) {
      state.participationReportCache.set(state.participationReport.sourceYear, state.participationReport);
    }
  }

  if (readinessResponse?.ok) {
    const report = await readinessResponse.json();
    state.readinessReport = { ...report, artifactPath: "./data/gazi-readiness-report.json" };
    if (Number.isFinite(state.readinessReport.sourceYear)) {
      state.readinessReportCache.set(state.readinessReport.sourceYear, state.readinessReport);
    }
  }

  if (manifestResponse?.ok) {
    state.dataManifest = await manifestResponse.json();
  }

  if (horizonResponse?.ok) {
    state.dataHorizon = await horizonResponse.json();
  }

  renderTarget(state.data.targetRace);
  if (state.routeReport?.routeRaces?.length) {
    renderRouteReport(state.routeReport);
    renderDataStatus(state.routeReport);
  } else {
    renderRaces(state.data.prepRaces);
    renderDataStatus(state.routeReport ?? { year: state.data.targetRace.editionFocus, routeRaces: [] });
  }
  if (state.backtestReport) renderBacktest(state.backtestReport);
  if (state.participationReport) renderParticipation(state.participationReport);
  renderReadinessArtifact(state.readinessReport);
  renderDataManifest(state.dataManifest);
  if (state.dataHorizon) renderDataHorizon(state.dataHorizon);
  renderAnalysisYearControl();
  if (state.dataHorizon) await loadParticipationComparison();
  bindEvents();
};

init();
