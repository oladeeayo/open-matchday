/* Goal Lines — one league at a time. */

const state = {
  league: null,
  leagues: GL.LEAGUES,
  venue: "all",
  query: "",
  sortKey: "o25",
  sortDir: "desc",
  rows: [],
  matches: [],
  openKey: null,
};

const COLS = [
  {
    label: "Team record",
    keys: [
      { key: "team", label: "Team", type: "team", cls: "col-team" },
      { key: "mp", label: "MP", num: true },
      { key: "w", label: "W", num: true, opt: true },
      { key: "d", label: "D", num: true, opt: true },
      { key: "l", label: "L", num: true, opt: true },
      { key: "gf", label: "GF", num: true, opt: true },
      { key: "ga", label: "GA", num: true, opt: true },
      { key: "pts", label: "Pts", num: true, opt: true },
      { key: "form", label: "Last 5", type: "form", opt: true },
    ],
  },
  {
    label: "Match goal lines", accent: true,
    keys: [
      { key: "o15", label: "1.5+", num: true, heat: true, type: "pct" },
      { key: "o25", label: "2.5+", num: true, heat: true, type: "pct" },
      { key: "o35", label: "3.5+", num: true, heat: true, type: "pct" },
    ],
  },
  {
    label: "Team scoring",
    keys: [
      { key: "scored", label: "Scored%", num: true, heat: true, type: "pct" },
      { key: "btts", label: "BTTS%", num: true, heat: true, type: "pct" },
      { key: "cs", label: "CS%", num: true, heat: true, type: "pct" },
    ],
  },
];

const $ = (s) => document.querySelector(s);
const els = {
  league: $("#league"), grid: $("#league-grid"), search: $("#search"),
  lgSearch: $("#lg-search"), lgCountry: $("#lg-country"), lgEmpty: $("#lg-empty"),
  copy: $("#copy-btn"), retry: $("#retry-btn"), live: $("#live"),
  tbody: $("#tbody"), table: $("#stats-table"), scroll: $("#table-scroll"),
  empty: $("#state-empty"), loading: $("#state-loading"), error: $("#state-error"),
  errorDetail: $("#error-detail"), readout: $("#readout"), foot: $("#table-foot"),
  rowCount: $("#row-count"),
  note: $("#ro-note"), headRow: null,
};

function setState(name) {
  for (const [key, el] of Object.entries({ empty: els.empty, loading: els.loading, error: els.error, table: els.scroll })) {
    el.hidden = key !== name;
  }
  if (name !== "table") els.readout.hidden = true;
}

function setSource() { /* source badge removed in light redesign */ }

function announce(msg) { els.live.textContent = msg; }

function currentRows() {
  const visible = GL.applyFilters(state.rows, { query: state.query });
  return GL.sortRows(visible, state.sortKey, state.sortDir);
}

async function openTeam(r) {
  const fixtures = await GL.fetchFixtures(r.folder);
  GL.openTeamPanel({
    row: r,
    matches: state.matches,
    fixtures,
    leagueName: state.league ? state.league.name : r.league,
  });
}

function render() {
  if (!state.league) return;
  const rows = currentRows();
  GL.renderTable({
    cols: COLS, rows, tbody: els.tbody, headRow: els.headRow,
    sortKey: state.sortKey, sortDir: state.sortDir,
    openKey: state.openKey, onToggle: openTeam,
  });

  els.scroll.hidden = false;
  els.copy.disabled = rows.length === 0;

  const bits = [];
  bits.push(`${rows.length} of ${state.rows.length} teams`);
  bits.push(state.venue === "all" ? "all matches" : state.venue === "home" ? "home matches" : "away matches");
  if (state.query) bits.push(`"${state.query}"`);
  els.foot.innerHTML = `${bits.join(" · ")} · <span class="warn-dot"></span> marks ${GL.LOW_SAMPLE} matches or fewer · click a team for results, table positions and next fixtures`;
  announce(`${state.league.name}: ${rows.length} teams shown`);
}

function renderReadout(summary) {
  els.readout.hidden = false;
  if (!summary) return;
  $("#ro-matches").textContent = summary.n;
  $("#ro-gpm").textContent = summary.gpm.toFixed(2);
  $("#ro-o15").textContent = `${summary.o15}%`;
  $("#ro-o25").textContent = `${summary.o25}%`;
  $("#ro-o35").textContent = `${summary.o35}%`;
  $("#ro-btts").textContent = `${summary.btts}%`;
}

async function loadLeague(folder, { pushHash = true } = {}) {
  const league = state.leagues.find((l) => l.folder === folder);
  if (!league) return;
  state.league = league;
  state.openKey = null;
  els.league.value = folder;
  if (pushHash) history.replaceState(null, "", `#league=${folder}`);

  setState("loading");
  setSource("load", "fetching…");
  announce(`Loading ${league.name}`);

  try {
    const { rows, base } = await GL.fetchResults(league.folder);
    const matches = GL.buildMatches(rows);
    if (!matches.length) throw new Error(`no finished matches in ${GL.SEASON_LABEL} for this league`);

    state.matches = matches;
    state.rows = GL.teamStats(matches, state.venue, league);

    setSource("live", base);
    els.rowCount.textContent = `${matches.length} matches`;
    renderReadout(GL.leagueSummary(matches));
    els.note.textContent = `League-wide rates cover all ${matches.length} finished matches of ${GL.SEASON_LABEL}; team rows follow the venue split you choose.`;
    render();
    setState("table");
  } catch (err) {
    setSource("fail", "unavailable");
    els.errorDetail.textContent =
      `${league.name} — ${err.message}. The page reads the results CSVs from raw.githubusercontent.com first, then a local data/ snapshot.`;
    setState("error");
    announce(`Failed to load ${league.name}`);
  }
}

function recompute() {
  if (!state.matches.length) return;
  state.rows = GL.teamStats(state.matches, state.venue, state.league);
  render();
}

function fillLeagueControls() {
  // league select options with country tags
  for (const lg of state.leagues) {
    const opt = document.createElement("option");
    opt.value = lg.folder;
    opt.textContent = `${GL.countryTag(lg.country)}  ${lg.name} — ${lg.country}`;
    els.league.appendChild(opt);
  }

  // country filter for the picker grid
  const countries = [...new Set(state.leagues.map((l) => l.country))].sort();
  for (const c of countries) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    els.lgCountry.appendChild(opt);
  }

  renderLeagueGrid();
}

function renderLeagueGrid() {
  const q = (els.lgSearch.value || "").trim().toLowerCase();
  const country = els.lgCountry.value || "all";
  const visible = state.leagues.filter((lg) => {
    if (country !== "all" && lg.country !== country) return false;
    if (q && !(`${lg.name} ${lg.country} ${lg.folder}`.toLowerCase().includes(q))) return false;
    return true;
  });

  els.grid.replaceChildren();
  els.lgEmpty.hidden = visible.length > 0;

  for (const lg of visible) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `${GL.countryFlag(lg.country)}<b>${lg.name}</b><span class="lg-country-tag">${lg.country}</span>`;
    btn.addEventListener("click", () => loadLeague(lg.folder));
    li.appendChild(btn);
    els.grid.appendChild(li);
  }
}

async function init() {
  els.headRow = GL.buildHead(COLS, els.tbody);
  const fromHash = decodeURIComponent(location.hash.replace("#", "")).replace(/^league=/, "");
  if (fromHash && state.leagues.some((l) => l.folder === fromHash)) state.league = fromHash;
  state.leagues = await GL.discoverLeagues();
  fillLeagueControls();

  els.league.addEventListener("change", (e) => e.target.value && loadLeague(e.target.value));

  // league picker search + country filter
  let lgT;
  els.lgSearch.addEventListener("input", () => {
    clearTimeout(lgT);
    lgT = setTimeout(renderLeagueGrid, 120);
  });
  els.lgCountry.addEventListener("change", renderLeagueGrid);

  for (const btn of document.querySelectorAll('[data-group="venue"] button')) {
    btn.addEventListener("click", () => {
      document.querySelectorAll('[data-group="venue"] button').forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", String(on));
      });
      state.venue = btn.dataset.venue;
      recompute();
    });
  }

  let t;
  els.search.addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.query = e.target.value.trim().toLowerCase();
      render();
    }, 120);
  });

  for (const th of els.headRow.querySelectorAll("th")) {
    const fire = () => {
      const key = th.dataset.key;
      if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else { state.sortKey = key; state.sortDir = key === "team" ? "asc" : "desc"; }
      render();
    };
    th.addEventListener("click", fire);
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); }
    });
  }

  els.copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(GL.toCsv(currentRows(), false));
      els.copy.textContent = "Copied";
      announce("Table copied as CSV");
    } catch {
      els.copy.textContent = "Copy failed";
    }
    setTimeout(() => { els.copy.textContent = "Copy CSV"; }, 1600);
  });

  els.retry.addEventListener("click", () => state.league && loadLeague(state.league.folder, { pushHash: false }));

  if (state.league && state.leagues.some((l) => l.folder === state.league)) {
    await loadLeague(state.league, { pushHash: false });
  } else {
    setState("empty");
    setSource("live", "github raw · ready");
    els.rowCount.textContent = "—";
  }
}

init();
