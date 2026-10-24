/* Goal Lines — every league at once, one table. */

const state = {
  venue: "all",
  query: "",
  leagueFilter: "all",
  countryFilter: "all",
  sortKey: "o25",
  sortDir: "desc",
  rows: [],
  summary: null,
  byFolder: new Map(),
  okLeagues: [],
  failed: [],
  leagues: GL.LEAGUES,
  openKey: null,
};

const COLS = [
  {
    label: "Teams",
    keys: [
      { key: "league", label: "League", type: "league", cls: "col-league" },
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
  leagueFilter: $("#league-filter"), countryFilter: $("#country-filter"),
  search: $("#search"),
  copy: $("#copy-btn"), retry: $("#retry-btn"), live: $("#live"),
  tbody: $("#tbody"), scroll: $("#table-scroll"),
  loading: $("#state-loading"), loadingText: $("#loading-text"),
  error: $("#state-error"), errorDetail: $("#error-detail"),
  readout: $("#readout"), foot: $("#table-foot"),
  rowCount: $("#row-count"),
  note: $("#ro-note"), headRow: null,
};

function setState(name) {
  for (const [key, el] of Object.entries({ loading: els.loading, error: els.error, table: els.scroll })) {
    el.hidden = key !== name;
  }
  if (name !== "table") els.readout.hidden = true;
}

function setSource() { /* source badge removed in light redesign */ }

function announce(msg) { els.live.textContent = msg; }

function baseRows() {
  let rows = state.rows;
  if (state.leagueFilter !== "all") rows = rows.filter((r) => r.folder === state.leagueFilter);
  if (state.countryFilter !== "all") rows = rows.filter((r) => r.country === state.countryFilter);
  return rows;
}

function currentRows() {
  const visible = GL.applyFilters(baseRows(), { query: state.query });
  return GL.sortRows(visible, state.sortKey, state.sortDir);
}

async function openTeam(r) {
  const fixtures = await GL.fetchFixtures(r.folder);
  GL.openTeamPanel({
    row: r,
    matches: state.byFolder.get(r.folder) || [],
    fixtures,
    leagueName: r.league,
  });
}

function render() {
  const rows = currentRows();
  GL.renderTable({
    cols: COLS, rows, tbody: els.tbody, headRow: els.headRow,
    sortKey: state.sortKey, sortDir: state.sortDir,
    openKey: state.openKey, onToggle: openTeam,
  });

  els.scroll.hidden = false;
  els.copy.disabled = rows.length === 0;

  const total = baseRows().length;
  const bits = [`${rows.length} of ${total} teams`];
  if (state.leagueFilter !== "all") {
    const lg = state.leagues.find((l) => l.folder === state.leagueFilter);
    if (lg) bits.push(lg.name);
  } else bits.push(`${state.leagues.length} leagues`);
  bits.push(state.venue === "all" ? "all matches" : state.venue === "home" ? "home matches" : "away matches");
  if (state.query) bits.push(`"${state.query}"`);

  els.foot.innerHTML = `${bits.join(" · ")} · <span class="warn-dot"></span> marks ${GL.LOW_SAMPLE} matches or fewer · click a team for the matches behind its numbers`;
  announce(`${rows.length} teams shown`);
}

function renderReadout(summary) {
  els.readout.hidden = false;
  if (!summary) return;
  $("#ro-leagues").textContent = summary.leagues;
  $("#ro-teams").textContent = summary.teams;
  $("#ro-matches").textContent = summary.n;
  $("#ro-gpm").textContent = summary.gpm.toFixed(2);
  $("#ro-o15").textContent = `${summary.o15}%`;
  $("#ro-o25").textContent = `${summary.o25}%`;
  $("#ro-o35").textContent = `${summary.o35}%`;
  $("#ro-btts").textContent = `${summary.btts}%`;
}

async function loadAll() {
  setState("loading");
  setSource("load", "fetching…");
  els.loadingText.textContent = `Fetching ${state.leagues.length} leagues`;
  announce("Loading all leagues");

  const byFolder = new Map();
  state.failed = [];
  let done = 0;

  await Promise.all(state.leagues.map(async (lg) => {
    try {
      const { rows } = await GL.fetchResults(lg.folder);
      byFolder.set(lg.folder, GL.buildMatches(rows));
    } catch {
      state.failed.push(lg);
    } finally {
      done++;
      els.loadingText.textContent = `Fetching leagues ${done} / ${state.leagues.length}`;
      els.loadingText.setAttribute("aria-label", `${done} of ${state.leagues.length} leagues loaded`);
    }
  }));

  const ok = state.leagues.filter((l) => byFolder.has(l.folder));
  if (!ok.length) {
    setSource("fail", "unavailable");
    els.errorDetail.textContent =
      `None of the ${state.leagues.length} league CSVs could be fetched (${state.failed.length} failed). ` +
      `The page reads raw.githubusercontent.com first, then a local data/ snapshot.`;
    setState("error");
    announce("All leagues failed to load");
    return;
  }

  const allMatches = [];
  const teams = [];
  state.byFolder = byFolder;
  state.okLeagues = ok;
  for (const lg of ok) {
    const matches = byFolder.get(lg.folder);
    allMatches.push(...matches);
    teams.push(...GL.teamStats(matches, state.venue, lg));
  }

  state.rows = teams;
  state.summary = summarize(ok, allMatches, teams);

  const base = state.failed.length ? `${ok.length}/${state.leagues.length} leagues` : "github raw";
  setSource(state.failed.length ? "load" : "live", state.failed.length ? `${base} partial` : base);
  els.rowCount.textContent = `${allMatches.length.toLocaleString()} matches`;

  renderReadout(state.summary);
  const failNote = state.failed.length
    ? ` Unavailable: ${state.failed.map((f) => f.name).join(", ")}.`
    : "";
  els.note.textContent =
    `Rates aggregate all ${allMatches.length.toLocaleString()} finished matches of ${GL.SEASON_LABEL} across ${ok.length} leagues; ` +
    `team rows follow the venue split.${failNote}`;
  render();
  setState("table");
}

function summarize(leagues, matches, teams) {
  const n = matches.length;
  const goals = matches.reduce((s, m) => s + m.total, 0);
  const over = (line) => (n ? Math.round((matches.filter((m) => m.total >= line).length / n) * 100) : 0);
  return {
    leagues: leagues.length,
    teams: teams.length,
    n,
    gpm: n ? goals / n : 0,
    o15: over(2), o25: over(3), o35: over(4),
    btts: n ? Math.round((matches.filter((m) => m.fh >= 1 && m.fa >= 1).length / n) * 100) : 0,
  };
}

function recomputeVenue() {
  if (!state.okLeagues.length) return;
  const teams = [];
  for (const lg of state.okLeagues) {
    teams.push(...GL.teamStats(state.byFolder.get(lg.folder), state.venue, lg));
  }
  state.rows = teams;
}

async function init() {
  els.headRow = GL.buildHead(COLS, els.tbody);

  const fromHash0 = decodeURIComponent(location.hash.replace("#", ""));
  state.leagues = await GL.discoverLeagues();

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = `All ${state.leagues.length} leagues`;
  els.leagueFilter.appendChild(allOpt);
  for (const lg of state.leagues) {
    const opt = document.createElement("option");
    opt.value = lg.folder;
    opt.textContent = `${GL.countryTag(lg.country)}  ${lg.name}`;
    els.leagueFilter.appendChild(opt);
  }

  // country dropdown
  const countries = [...new Set(state.leagues.map((l) => l.country))].sort();
  for (const c of countries) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    els.countryFilter.appendChild(opt);
  }

  els.leagueFilter.addEventListener("change", (e) => {
    state.leagueFilter = e.target.value;
    state.openKey = null;
    history.replaceState(null, "", state.leagueFilter === "all" ? location.pathname : `#${state.leagueFilter}`);
    render();
  });

  els.countryFilter.addEventListener("change", (e) => {
    state.countryFilter = e.target.value;
    state.openKey = null;
    render();
  });

  for (const btn of document.querySelectorAll('[data-group="venue"] button')) {
    btn.addEventListener("click", () => {
      document.querySelectorAll('[data-group="venue"] button').forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", String(on));
      });
      state.venue = btn.dataset.venue;
      state.openKey = null;
      recomputeVenue();
      render();
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
      else { state.sortKey = key; state.sortDir = key === "team" || key === "league" ? "asc" : "desc"; }
      render();
    };
    th.addEventListener("click", fire);
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); }
    });
  }

  els.copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(GL.toCsv(currentRows(), true));
      els.copy.textContent = "Copied";
      announce("Table copied as CSV");
    } catch {
      els.copy.textContent = "Copy failed";
    }
    setTimeout(() => { els.copy.textContent = "Copy CSV"; }, 1600);
  });

  els.retry.addEventListener("click", () => loadAll());

  if (fromHash0 && state.leagues.some((l) => l.folder === fromHash0)) {
    state.leagueFilter = fromHash0;
    els.leagueFilter.value = fromHash0;
  }

  loadAll();
}

init();
