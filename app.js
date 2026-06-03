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

const renderRaceEntries = (entries = []) => {
  if (!entries.length) return "";

  return `
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
};

const init = async () => {
  const [knowledgeResponse, routeResponse, backtestResponse] = await Promise.all([
    fetch("./data/gazi-knowledge-base.json", { cache: "no-store" }),
    fetch("./data/gazi-route-report.json", { cache: "no-store" }).catch(() => null),
    fetch("./data/gazi-backtest-report.json", { cache: "no-store" }).catch(() => null)
  ]);

  state.data = await knowledgeResponse.json();

  if (routeResponse?.ok) {
    state.routeReport = await routeResponse.json();
  }

  if (backtestResponse?.ok) {
    state.backtestReport = await backtestResponse.json();
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
  renderYears(state.data.horses);
  renderCandidates();
  bindEvents();
};

init();
