/* over25stats — prediction board for any date. */

const MARKET_LABEL = { o15: "O1.5", o25: "O2.5", o35: "O3.5", btts: "BTTS", h2: "H2+", a2: "A2+" };
const MARKET_ORDER = ["o15", "o25", "o35", "btts", "h2", "a2"];

const state = {
  leagues: [],
  date: todayIso(),
  country: "all",
  selectedLeagues: new Set(),
  thr: 60,
  market: "o25",
  strongOnly: false,
  query: "",
  models: new Map(),
  fixturesByDate: new Map(),
  predictions: [],
  failed: [],
  ready: false,
};

const $ = (s) => document.querySelector(s);
const els = {
  dateInput: $("#date-input"), dayPrev: $("#day-prev"), dayNext: $("#day-next"),
  dayToday: $("#day-today"), dateReadout: $("#date-readout"),
  country: $("#country"), leagueList: $("#league-list"),
  leagueDdBtn: $("#league-dd-btn"), leagueDdPanel: $("#league-dd-panel"), leagueDdLabel: $("#league-dd-label"),
  lgSelectAll: $("#lg-select-all"), lgClearAll: $("#lg-clear-all"),
  thr: $("#thr"), thrOut: $("#thr-out"),
  marketGroup: $("#market-group"),
  search: $("#search"), live: $("#live"),
  sections: $("#sections"), empty: $("#state-empty"), loading: $("#state-loading"),
  error: $("#state-error"), errorDetail: $("#error-detail"), retry: $("#retry-btn"),
  readout: $("#readout"), roMatches: $("#ro-matches"), roLeagues: $("#ro-leagues"),
  roXg: $("#ro-xg"), roTips: $("#ro-tips"), roTipsKey: $("#ro-tips-key"),
  roBest: $("#ro-best"), roNote: $("#ro-note"),
  fixturesMeta: $("#fixtures-meta"),
  sidebar: $("#sidebar"), sideSummary: $("#side-summary"), sideLeagues: $("#side-leagues"),
  sideTips: $("#side-tips"),
};

function todayIso() {
  const d = new Date();
  return isoOf(d);
}
function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseIso(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function shiftDay(iso, delta) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + delta);
  return isoOf(d);
}
const fmtDay = (iso) => {
  const d = parseIso(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};
const isToday = (iso) => iso === todayIso();

function setState(name) {
  for (const [key, el] of Object.entries({ loading: els.loading, empty: els.empty, error: els.error, sections: els.sections })) {
    el.hidden = key !== name;
  }
  if (name !== "sections") els.readout.hidden = true;
  if (els.sidebar) els.sidebar.hidden = name !== "sections";
}

const announce = (msg) => { els.live.textContent = msg; };

/* ---------- data ---------- */

async function loadLeagueFixtures(league) {
  if (state.fixturesByDate.has(league.folder)) return state.fixturesByDate.get(league.folder);
  const rows = await GL.fetchFixtures(league.folder);
  state.fixturesByDate.set(league.folder, rows);
  return rows;
}

async function ensureModel(league) {
  if (state.models.has(league.folder)) return state.models.get(league.folder);
  const { rows } = await GL.fetchResults(league.folder);
  const matches = GL.buildMatches(rows);
  const model = Predict.buildLeague(matches);
  state.models.set(league.folder, model);
  return model;
}

/* ---------- league multi-select dropdown ---------- */

function fillCountries() {
  const countries = [...new Set(state.leagues.map((l) => l.country))].sort();
  for (const c of countries) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = `${GL.countryTag(c)}  ${c}`;
    els.country.appendChild(opt);
  }
}

function updateLeagueLabel() {
  const n = state.selectedLeagues.size;
  if (n === 0) {
    els.leagueDdLabel.textContent = "All leagues";
  } else if (n === 1) {
    const lg = state.leagues.find((l) => state.selectedLeagues.has(l.folder));
    els.leagueDdLabel.textContent = lg ? lg.name : "1 league";
  } else {
    els.leagueDdLabel.textContent = `${n} leagues selected`;
  }
}

function toggleLeagueDd(open) {
  const btn = els.leagueDdBtn;
  const panel = els.leagueDdPanel;
  const show = open !== undefined ? open : panel.hidden;
  panel.hidden = !show;
  btn.setAttribute("aria-expanded", String(show));
}

function fillLeagueList() {
  const visible = state.leagues.filter((l) => state.country === "all" || l.country === state.country);
  els.leagueList.replaceChildren();
  if (!visible.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="chips-hint" style="display:block;padding:8px 10px">no leagues</span>`;
    els.leagueList.appendChild(li);
    return;
  }

  for (const lg of visible) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    const on = state.selectedLeagues.has(lg.folder);
    btn.className = on ? "is-on" : "";
    btn.dataset.folder = lg.folder;
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", String(on));
    btn.title = `${lg.country} — ${lg.folder}`;
    btn.innerHTML = `<span class="lg-check" aria-hidden="true"></span><span class="lg-flag" aria-hidden="true"></span><span class="lg-name"></span><span class="lg-country-tag"></span>`;
    btn.querySelector(".lg-flag").innerHTML = GL.countryFlag(lg.country);
    btn.querySelector(".lg-name").textContent = lg.name;
    btn.querySelector(".lg-country-tag").textContent = lg.country;
    btn.addEventListener("click", () => {
      if (state.selectedLeagues.has(lg.folder)) state.selectedLeagues.delete(lg.folder);
      else state.selectedLeagues.add(lg.folder);
      fillLeagueList();
      updateLeagueLabel();
      renderDay();
    });
    li.appendChild(btn);
    els.leagueList.appendChild(li);
  }
  updateLeagueLabel();
}

/* ---------- render ---------- */

function leagueAllowed(lg) {
  if (state.country !== "all" && lg.country !== state.country) return false;
  if (state.selectedLeagues.size > 0) return state.selectedLeagues.has(lg.folder);
  return true;
}

function matchVisible(p) {
  if (state.strongOnly && p[state.market] < state.thr) return false;
  if (state.query) {
    const q = state.query;
    if (!(`${p.home} ${p.away}`.toLowerCase().includes(q))) return false;
  }
  return true;
}

function probCell(pct, key) {
  const on = pct >= state.thr;
  const strong = pct >= state.thr + 10;
  const focus = key === state.market;
  return `<td class="prob p-${key} num ${on ? "is-on" : ""}${strong ? " is-strong" : ""}${focus ? " is-focus" : ""}">
    <span class="prob-v">${pct.toFixed(0)}<i>%</i></span>
    <span class="prob-k" aria-hidden="true">${MARKET_LABEL[key]}</span></td>`;
}

function esc(s) { return GL.escapeHtml(s); }

/** Best tip: highest-probability market that clears threshold; else strongest overall. */
function bestTip(p) {
  let bestKey = null;
  let bestVal = -1;
  for (const k of MARKET_ORDER) {
    if (p[k] >= state.thr && p[k] > bestVal) { bestVal = p[k]; bestKey = k; }
  }
  if (bestKey) return { key: bestKey, label: MARKET_LABEL[bestKey], p: bestVal };
  let topKey = MARKET_ORDER[0];
  let topVal = p[topKey];
  for (const k of MARKET_ORDER) {
    if (p[k] > topVal) { topVal = p[k]; topKey = k; }
  }
  return { key: topKey, label: MARKET_LABEL[topKey], p: topVal };
}

function renderDay() {
  const date = state.date;
  els.dateInput.value = date;
  els.dateReadout.textContent = (isToday(date) ? "Today · " : "") + fmtDay(date);
  setState("loading");
  announce(`Loading fixtures for ${fmtDay(date)}`);

  Promise.all(state.leagues.map(async (lg) => {
    try {
      const fx = await loadLeagueFixtures(lg);
      return { lg, fx };
    } catch {
      state.failed.push(lg.folder);
      return { lg, fx: [] };
    }
  })).then(async (all) => {
    const live = [];
    for (const { lg, fx } of all) {
      if (!leagueAllowed(lg)) continue;
      const todays = fx.filter((f) => f.date === date && f.home && f.away);
      if (todays.length) live.push({ lg, todays });
    }

    if (!live.length) {
      setState("empty");
      els.fixturesMeta.textContent = "0 matches";
      if (els.sidebar) els.sidebar.hidden = true;
      announce("No fixtures on this date");
      return;
    }

    const sections = [];
    let totalMatches = 0, sumXg = 0, countXg = 0;
    const tipCount = { o15: 0, o25: 0, o35: 0, btts: 0, h2: 0, a2: 0 };
    let bestCount = 0;

    await Promise.all(live.map(async ({ lg, todays }) => {
      let model;
      try {
        model = await ensureModel(lg);
      } catch {
        return;
      }
      if (!model) return;
      const rows = [];
      for (const f of todays) {
        const p = Predict.predictMatch(model, f.home, f.away);
        if (!p) continue;
        rows.push({ ...p, time: f.time || "", gw: f.gw, folder: lg.folder, league: lg });
        totalMatches++;
        sumXg += p.xgT;
        countXg++;
        for (const k of MARKET_ORDER) {
          if (p[k] >= state.thr) tipCount[k]++;
        }
        const bt = bestTip(p);
        if (bt.p >= state.thr) bestCount++;
      }
      if (!rows.length) return;
      rows.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      sections.push({ league: lg, rows });
    }));

    sections.sort((a, b) => a.league.country.localeCompare(b.league.country) || a.league.name.localeCompare(b.league.name));

    state.predictions = sections.flatMap((s) => s.rows);
    state.tipCount = tipCount;
    state.bestCount = bestCount;
    state.sections = sections;
    renderSections(sections);
    renderReadout({ totalMatches, leagues: sections.length, avgXg: countXg ? sumXg / countXg : 0, tipCount, bestCount });
    renderSidebar(sections, { totalMatches, bestCount, tipCount, avgXg: countXg ? sumXg / countXg : 0 });
    els.fixturesMeta.textContent = `Season ${GL.SEASON_LABEL} · ${totalMatches} matches`;
    announce(`${totalMatches} matches across ${sections.length} leagues`);
    setState(sections.length ? "sections" : "empty");
  }).catch((err) => {
    els.errorDetail.textContent = err.message || "network error";
    setState("error");
  });
}

function renderReadout(s) {
  els.readout.hidden = false;
  els.roMatches.textContent = s.totalMatches;
  els.roLeagues.textContent = s.leagues;
  els.roXg.textContent = s.avgXg.toFixed(2);
  els.roBest.textContent = String(s.bestCount);
  els.roTipsKey.textContent = `${MARKET_LABEL[state.market]} tips`;
  els.roTips.textContent = String(s.tipCount[state.market]);
  els.roNote.textContent = `Threshold ${state.thr}%. Probabilities are model outputs, not guarantees.`;
}

function renderSidebar(sections, summary) {
  if (!els.sidebar) return;
  els.sidebar.hidden = false;

  // summary block
  els.sideSummary.innerHTML = `
    <div class="side-stat"><span class="side-k">Matches</span><span class="side-v">${summary.totalMatches}</span></div>
    <div class="side-stat"><span class="side-k">Leagues</span><span class="side-v">${sections.length}</span></div>
    <div class="side-stat"><span class="side-k">Avg goals</span><span class="side-v">${summary.avgXg.toFixed(2)}</span></div>
    <div class="side-stat"><span class="side-k">Best tips</span><span class="side-v side-v-accent">${summary.bestCount}</span></div>
    <div class="side-stat"><span class="side-k">${MARKET_LABEL[state.market]} tips</span><span class="side-v">${summary.tipCount[state.market]}</span></div>
  `;

  // league tip counts
  const lgRows = sections.map((s) => {
    const flag = GL.countryFlag(s.league.country);
    const bestN = s.rows.filter((r) => bestTip(r).p >= state.thr).length;
    const mktN = s.rows.filter((r) => r[state.market] >= state.thr).length;
    return `<a class="side-lg" href="#league-${esc(s.league.folder)}">
      <span class="side-lg-flag">${flag}</span>
      <span class="side-lg-name">${esc(s.league.name)}</span>
      <span class="side-lg-n">${bestN}<i>best</i></span>
      <span class="side-lg-n side-lg-mkt">${mktN}<i>${MARKET_LABEL[state.market]}</i></span>
    </a>`;
  }).join("");
  els.sideLeagues.innerHTML = lgRows || `<p class="side-empty">No leagues</p>`;

  // top tips: strongest best-tips of the day
  const allRows = sections.flatMap((s) => s.rows.map((r) => ({ ...r, flag: GL.countryFlag(s.league.country) })));
  const tipped = allRows
    .map((r) => ({ r, tip: bestTip(r) }))
    .filter((x) => x.tip.p >= state.thr)
    .sort((a, b) => b.tip.p - a.tip.p)
    .slice(0, 8);

  if (tipped.length) {
    els.sideTips.innerHTML = tipped.map(({ r, tip }) => `
      <a class="side-tip" href="#league-${esc(r.folder)}">
        <span class="side-tip-match"><span class="side-tip-flag">${r.flag}</span>${esc(r.home)} <em>v</em> ${esc(r.away)}</span>
        <span class="side-tip-vals"><span class="side-tip-mkt">${esc(tip.label)}</span><span class="side-tip-p">${tip.p.toFixed(0)}%</span></span>
      </a>`).join("");
    els.sideTips.closest(".side-block").hidden = false;
  } else {
    els.sideTips.closest(".side-block").hidden = true;
  }
}

function renderSections(sections) {
  const visibleSections = sections
    .map((s) => ({ ...s, rows: s.rows.filter(matchVisible) }))
    .filter((s) => s.rows.length);

  if (!visibleSections.length) {
    els.sections.replaceChildren();
    const title = els.empty.querySelector(".state-title");
    const body = els.empty.querySelector(".state-body");
    if (state.predictions.length) {
      title.textContent = "No matches match your filters.";
      body.textContent = "Lower the probability threshold, clear the team search, or switch back to All matches.";
    } else {
      title.textContent = "No fixtures on this date.";
      body.innerHTML = "Try another day. European leagues often sit midweek. Use <em>Today</em> or step forward.";
    }
    setState("empty");
    return;
  }

  const frag = document.createDocumentFragment();
  for (const s of visibleSections) {
    const sec = document.createElement("section");
    sec.className = "league-sec";
    sec.id = `league-${s.league.folder}`;
    const tipN = s.rows.filter((r) => r[state.market] >= state.thr).length;
    const bestN = s.rows.filter((r) => bestTip(r).p >= state.thr).length;
    const flag = GL.countryFlag(s.league.country);
    sec.innerHTML = `
      <header class="league-sec-head">
        <div class="league-sec-id">
          <span class="league-flag" aria-hidden="true">${flag}</span>
          <span class="league-country">${esc(s.league.country)}</span>
          <h2 class="league-name">${esc(s.league.name)}</h2>
        </div>
        <div class="league-sec-meta">
          <span>${s.rows.length} match${s.rows.length === 1 ? "" : "es"}</span>
          <span class="sep">·</span>
          <span class="tips-n">${bestN} best tip${bestN === 1 ? "" : "s"}</span>
          <span class="sep">·</span>
          <span>${tipN} ${MARKET_LABEL[state.market]}</span>
        </div>
      </header>
      <div class="match-table-wrap">
        <table class="match-table">
          <thead>
            <tr>
              <th class="num" scope="col">Time</th>
              <th class="num" scope="col">Home</th>
              <th scope="col">Away</th>
              <th class="prob-col" scope="col">O1.5</th>
              <th class="prob-col" scope="col">O2.5</th>
              <th class="prob-col" scope="col">O3.5</th>
              <th class="prob-col" scope="col">BTTS</th>
              <th class="prob-col" scope="col">H2+</th>
              <th class="prob-col" scope="col">A2+</th>
              <th class="tip-col" scope="col">Best tip</th>
            </tr>
          </thead>
          <tbody>
            ${s.rows.map(matchRow).join("")}
          </tbody>
        </table>
      </div>`;
    frag.appendChild(sec);
  }
  els.sections.replaceChildren(frag);
  els.sections.hidden = false;
  // make each league's fixture table sortable by any column
  els.sections.querySelectorAll("table.match-table").forEach((t) => GL.makeSortable(t));
}

function matchRow(p) {
  const tip = bestTip(p);
  const tipOn = tip.p >= state.thr;
  const isBestFocus = tip.key === state.market;
  return `<tr class="match-row">
    <td class="num time-cell${p.time ? "" : " no-time"}">${p.time ? esc(p.time) : ""}</td>
    <td class="num home-team team" data-sort-value="${esc(p.home)}"><span class="tname">${esc(p.home)}</span><span class="pos">${p.homeRank}</span></td>
    <td class="away-team team" data-sort-value="${esc(p.away)}"><span class="pos">${p.awayRank}</span><span class="tname">${esc(p.away)}</span></td>
    ${probCell(p.o15, "o15")}
    ${probCell(p.o25, "o25")}
    ${probCell(p.o35, "o35")}
    ${probCell(p.btts, "btts")}
    ${probCell(p.h2, "h2")}
    ${probCell(p.a2, "a2")}
    <td class="tip-cell ${tipOn ? "is-on" : ""}${isBestFocus ? " is-focus" : ""}" data-sort-value="${tip.p.toFixed(0)}"><span class="tip-inner">${isBestFocus ? `<span class="best-mark">Best</span>` : ""}<span class="tip-label">${esc(tip.label)}</span><span class="tip-p">${tip.p.toFixed(0)}%</span></span></td>
  </tr>`;
}

/* ---------- events ---------- */

function bind() {
  els.dateInput.addEventListener("change", (e) => {
    if (e.target.value) { state.date = e.target.value; renderDay(); }
  });
  els.dayPrev.addEventListener("click", () => { state.date = shiftDay(state.date, -1); renderDay(); });
  els.dayNext.addEventListener("click", () => { state.date = shiftDay(state.date, 1); renderDay(); });
  els.dayToday.addEventListener("click", () => { state.date = todayIso(); renderDay(); });

  els.country.addEventListener("change", (e) => {
    state.country = e.target.value;
    state.selectedLeagues = new Set();
    fillLeagueList();
    renderDay();
  });

  // league dropdown
  els.leagueDdBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleLeagueDd();
  });
  els.leagueDdPanel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => toggleLeagueDd(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleLeagueDd(false);
  });
  els.lgSelectAll.addEventListener("click", () => {
    const visible = state.leagues.filter((l) => state.country === "all" || l.country === state.country);
    state.selectedLeagues = new Set(visible.map((l) => l.folder));
    fillLeagueList();
    renderDay();
  });
  els.lgClearAll.addEventListener("click", () => {
    state.selectedLeagues = new Set();
    fillLeagueList();
    renderDay();
  });

  els.thr.addEventListener("input", (e) => {
    state.thr = Number(e.target.value);
    els.thrOut.textContent = `${state.thr}%`;
    if (state.ready) renderDaySoft();
  });

  for (const btn of els.marketGroup.querySelectorAll("[data-market]")) {
    btn.addEventListener("click", () => {
      state.market = btn.dataset.market;
      for (const b of els.marketGroup.querySelectorAll("[data-market]")) {
        const on = b === btn;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", String(on));
      }
      if (state.ready) renderDaySoft();
    });
  }

  for (const btn of document.querySelectorAll('[data-group="strong"] button')) {
    btn.addEventListener("click", () => {
      document.querySelectorAll('[data-group="strong"] button').forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", String(on));
      });
      state.strongOnly = btn.dataset.strong === "tips";
      if (state.ready) renderDaySoft();
    });
  }

  let t;
  els.search.addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.query = e.target.value.trim().toLowerCase();
      if (state.ready) renderDaySoft();
    }, 120);
  });

  els.retry.addEventListener("click", () => {
    state.fixturesByDate.clear();
    state.models.clear();
    state.failed = [];
    renderDay();
  });
}

/** Re-render from cached predictions without refetch. */
function renderDaySoft() {
  if (!state.predictions.length) { renderDay(); return; }
  const byLeague = new Map();
  for (const p of state.predictions) {
    if (!byLeague.has(p.folder)) byLeague.set(p.folder, { league: p.league, rows: [] });
    byLeague.get(p.folder).rows.push(p);
  }
  const sections = [...byLeague.values()];
  const tipCount = { o15: 0, o25: 0, o35: 0, btts: 0, h2: 0, a2: 0 };
  let sumXg = 0;
  let bestCount = 0;
  for (const p of state.predictions) {
    sumXg += p.xgT;
    for (const k of MARKET_ORDER) {
      if (p[k] >= state.thr) tipCount[k]++;
    }
    if (bestTip(p).p >= state.thr) bestCount++;
  }
  // keep section order by sorting like renderDay
  sections.sort((a, b) => a.league.country.localeCompare(b.league.country) || a.league.name.localeCompare(b.league.name));
  renderSections(sections);
  renderReadout({
    totalMatches: state.predictions.length,
    leagues: sections.length,
    avgXg: state.predictions.length ? sumXg / state.predictions.length : 0,
    tipCount,
    bestCount,
  });
  renderSidebar(sections, {
    totalMatches: state.predictions.length,
    bestCount,
    tipCount,
    avgXg: state.predictions.length ? sumXg / state.predictions.length : 0,
  });
  setState("sections");
}

async function init() {
  bind();
  els.dateInput.value = state.date;
  els.thrOut.textContent = `${state.thr}%`;
  setState("loading");

  try {
    state.leagues = await GL.discoverLeagues();
    const order = (l) => (l.folder.startsWith("ENG_1") ? 0 : l.folder.startsWith("ESP_1") ? 1 : 2);
    state.leagues.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
    fillCountries();
    fillLeagueList();
    state.ready = true;
    await renderDay();
  } catch (err) {
    els.errorDetail.textContent = err.message || "Could not discover leagues.";
    setState("error");
  }
}

init();
