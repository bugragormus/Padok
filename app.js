const signalLabels = {
  classSignal: "Sinif",
  staminaSignal: "Mesafe",
  courseSignal: "Pist",
  recencySignal: "Guncel form"
};

const state = {
  data: null,
  query: "",
  year: "all"
};

const formatText = (value) => value ?? "Bekleniyor";

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
  const response = await fetch("./data/gazi-knowledge-base.json");
  state.data = await response.json();

  renderTarget(state.data.targetRace);
  renderRaces(state.data.prepRaces);
  renderYears(state.data.horses);
  renderCandidates();
  bindEvents();
};

init();
