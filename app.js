const signalLabels = {
  classSignal: "Sinif",
  staminaSignal: "Mesafe",
  courseSignal: "Pist",
  recencySignal: "Guncel form"
};

const state = {
  data: null,
  routeReport: null,
  backtestReport: null,
  participationReport: null,
  dataHorizon: null,
  selectedParticipationHorse: null,
  participationFilter: "all",
  analysisYear: null,
  routeReportCache: new Map(),
  participationReportCache: new Map(),
  participationComparison: [],
  query: "",
  year: "all"
};

const formatText = (value) => value ?? "Bekleniyor";
const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const computeScore = (signals, weights) => {
  const weighted = Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + (Number(signals[key] ?? 0) * weight);
  }, 0);

  return Math.round(weighted);
};

const normalize = (text) => {
  return String(text)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

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

const rowHasJockeyChange = (row, columns) => {
  const starts = getParticipationRouteStarts(row, columns);
  const jockeyNames = new Set(starts.map(({ cell }) => cell.jockeyName).filter(Boolean));

  return jockeyNames.size > 1;
};

const getFilteredParticipationRows = (rows, tableColumns) => {
  if (state.participationFilter === "noPrep") {
    return rows.filter((row) => row.prepStartCount === 0);
  }

  if (state.participationFilter === "podium") {
    return rows.filter((row) => Number.isFinite(row.gaziFinishPosition) && row.gaziFinishPosition <= 3);
  }

  if (state.participationFilter === "jockeyChange") {
    return rows.filter((row) => rowHasJockeyChange(row, tableColumns));
  }

  return rows;
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

  const metrics = [
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

  const prepColumns = report.columns.filter((column) => !column.isTarget);
  const targetColumn = report.columns.find((column) => column.isTarget);
  const tableColumns = targetColumn ? [...prepColumns, targetColumn] : prepColumns;
  renderParticipationFilters(report.rows, tableColumns);

  const filteredRows = getFilteredParticipationRows(report.rows, tableColumns);
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

  if (!state.routeReportCache.has(numericYear)) {
    state.routeReportCache.set(numericYear, await readJson(`./data/gazi-route-${numericYear}.json`));
  }

  if (!state.participationReportCache.has(numericYear)) {
    state.participationReportCache.set(numericYear, await readJson(`./data/gazi-participation-${numericYear}.json`));
  }

  state.routeReport = state.routeReportCache.get(numericYear);
  state.participationReport = state.participationReportCache.get(numericYear);

  renderAnalysisYearControl();
  renderParticipationComparison();
  renderDataStatus(state.routeReport);
  renderRouteReport(state.routeReport);
  renderParticipation(state.participationReport);
};

const renderYears = (horses) => {
  const years = [...new Set(horses.map((horse) => horse.year))].sort((a, b) => b - a);
  document.querySelector("#year-filter").innerHTML = [
    `<option value="all">Tum yillar</option>`,
    ...years.map((year) => `<option value="${year}">${year}</option>`)
  ].join("");
};

const renderCandidates = () => {
  const { horses, scoring } = state.data;
  const query = normalize(state.query);
  const filtered = horses
    .filter((horse) => state.year === "all" || String(horse.year) === state.year)
    .filter((horse) => normalize(horse.name).includes(query))
    .map((horse) => ({
      ...horse,
      score: computeScore(horse.manualSignals, scoring.weights)
    }))
    .sort((a, b) => b.score - a.score);

  document.querySelector("#candidate-grid").innerHTML = filtered
    .map((horse) => `
      <article class="candidate-card">
        <div class="candidate-card__top">
          <div>
            <h3>${horse.name}</h3>
            <p class="muted">${horse.year} · ${horse.profile.age} yasli ${horse.profile.breed} · ${horse.profile.sex}</p>
          </div>
          <div class="score" style="--score: ${horse.score}%"><span>${horse.score}</span></div>
        </div>
        <div class="bar-list">
          ${Object.entries(horse.manualSignals).map(([key, value]) => `
            <div class="bar">
              <div class="bar__label"><span>${signalLabels[key]}</span><span>${value}</span></div>
              <div class="bar__track"><div class="bar__fill" style="width: ${value}%"></div></div>
            </div>
          `).join("")}
        </div>
        <ul class="observation-list">
          ${horse.observations.map((observation) => `
            <li>
              <strong>${observation.race}</strong>
              ${observation.position ? ` · ${observation.position}.` : ""}
              ${observation.finishTime ? ` · ${observation.finishTime}` : ""}
              <br />
              ${observation.note}
            </li>
          `).join("")}
        </ul>
      </article>
    `)
    .join("");
};

const bindEvents = () => {
  document.querySelector("#horse-search").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderCandidates();
  });

  document.querySelector("#year-filter").addEventListener("change", (event) => {
    state.year = event.target.value;
    renderCandidates();
  });

  document.querySelector("#participation-table").addEventListener("click", (event) => {
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
};

const init = async () => {
  const [knowledgeResponse, routeResponse, backtestResponse, participationResponse, horizonResponse] = await Promise.all([
    fetch("./data/gazi-knowledge-base.json", { cache: "no-store" }),
    fetch("./data/gazi-route-report.json", { cache: "no-store" }).catch(() => null),
    fetch("./data/gazi-backtest-report.json", { cache: "no-store" }).catch(() => null),
    fetch("./data/gazi-participation-report.json", { cache: "no-store" }).catch(() => null),
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
  if (state.dataHorizon) renderDataHorizon(state.dataHorizon);
  renderAnalysisYearControl();
  if (state.dataHorizon) await loadParticipationComparison();
  renderYears(state.data.horses);
  renderCandidates();
  bindEvents();
};

init();
