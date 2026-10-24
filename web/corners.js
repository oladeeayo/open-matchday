/* over25stats — corner prediction page for top-10 leagues.
   Loads fixtures for each CORNER_LEAGUES league, predicts
   over 7.5 / over 8.5 for unplayed matches, renders as league sections. */

const Corners = (() => {
  const els = {
    board: () => document.getElementById("board"),
    sections: () => document.getElementById("sections"),
    loading: () => document.getElementById("state-loading"),
    empty: () => document.getElementById("state-empty"),
    error: () => document.getElementById("state-error"),
    errorDetail: () => document.getElementById("error-detail"),
    retryBtn: () => document.getElementById("retry-btn"),
    leagueFilter: () => document.getElementById("league-filter"),
    lineFilter: () => document.querySelector("[data-group=\"line\"]"),
  };

  const live = () => document.getElementById("live");
  const say = (msg) => { if (live()) { live().textContent = msg; } };

  /* ---------- state ---------- */

  let state = {
    leagues: [],          // [{folder, name, country, flag}]
    fixturesByLeague: new Map(),  // folder -> [fixture, ...]
    cornerModelsByLeague: new Map(),  // folder -> {league, teams}
    selectedLeague: "all",
    selectedLine: "both",
  };

  /* ---------- init ---------- */

  function init() {
    populateLeagueFilter();
    bindControls();
    loadAll();
  }

  function populateLeagueFilter() {
    const select = els.leagueFilter();
    if (!select) return;
    const cornerLeagues = GL.LEAGUES.filter((l) => GL.CORNER_LEAGUES.has(l.folder));
    cornerLeagues.sort((a, b) => a.name.localeCompare(b.name));
    state.leagues = cornerLeagues;
    for (const l of cornerLeagues) {
      const opt = document.createElement("option");
      opt.value = l.folder;
      opt.textContent = `${l.name} (${l.country})`;
      select.appendChild(opt);
    }
  }

  function bindControls() {
    const leagueFilter = els.leagueFilter();
    if (leagueFilter) {
      leagueFilter.addEventListener("change", () => {
        state.selectedLeague = leagueFilter.value;
        loadAll();
      });
    }

    const lineGroup = els.lineFilter();
    if (lineGroup) {
      lineGroup.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-line]");
        if (!btn) return;
        lineGroup.querySelectorAll("[data-line]").forEach((b) => {
          b.classList.toggle("is-on", b === btn);
          b.setAttribute("aria-checked", b === btn ? "true" : "false");
        });
        state.selectedLine = btn.dataset.line;
        renderAll();
      });
    }

    const retryBtn = els.retryBtn();
    if (retryBtn) retryBtn.addEventListener("click", loadAll);
  }

  /* ---------- load ---------- */

  async function loadAll() {
    els.loading().hidden = false;
    els.sections().hidden = true;
    els.empty().hidden = true;
    els.error().hidden = true;

    try {
      await loadAllLeagues();
      renderAll();
    } catch (err) {
      els.loading().hidden = true;
      els.error().hidden = false;
      els.errorDetail().textContent = err.message || "Network error.";
    }
  }

  async function loadAllLeagues() {
    const cornerLeagues = state.leagues;
    const fxByLeague = new Map();
    const modelsByLeague = new Map();

    for (const league of cornerLeagues) {
      try {
        const [fixtures, results] = await Promise.all([
          GL.fetchFixtures(league.folder),
          GL.fetchResults(league.folder),
        ]);

        const matches = GL.buildMatches(results.rows);
        const cornerLeague = Predict.buildCornerLeague(matches);
        const cornerTeams = Predict.buildCornerModels(matches);

        fxByLeague.set(league.folder, fixtures);
        if (cornerLeague && cornerTeams.size) {
          modelsByLeague.set(league.folder, { league: cornerLeague, teams: cornerTeams });
        }
      } catch {
        // league may have no data yet — skip gracefully
      }
    }

    state.fixturesByLeague = fxByLeague;
    state.cornerModelsByLeague = modelsByLeague;
  }

  /* ---------- render ---------- */

  function renderAll() {
    const sectionsEl = els.sections();
    if (!sectionsEl) return;

    const cornerLeagues = state.leagues;
    const selectedLeague = state.selectedLeague;
    const selectedLine = state.selectedLine;

    let html = "";
    let anyRows = false;

    for (const league of cornerLeagues) {
      if (selectedLeague !== "all" && league.folder !== selectedLeague) continue;

      const fixtures = state.fixturesByLeague.get(league.flag ? league.folder : league.folder) ||
                       state.fixturesByLeague.get(league.folder);
      const modelData = state.cornerModelsByLeague.get(league.folder);
      if (!fixtures || !fixtures.length) continue;
      if (!modelData) continue;  // no corner data for this league yet

      const unplayed = fixtures.filter((f) => {
        // a fixture is "unplayed" if it doesn't have a result in the results CSV
        // we check by looking for a match on the same date with both teams
        const matches = GL.buildMatches(
          (() => {
            try { return GL.fetchResults(league.folder).then(r => r.rows); } catch { return []; }
          })()
        );
        // simpler: if the fixture date is in the future relative to "now" or has no result
        // We'll use the matches from the already-loaded results
        return true; // we filter by checking against loaded matches below
      });

      // Build set of played dates/teams from results
      let playedMatches = [];
      try {
        const results = await GL.fetchResults(league.folder);
        playedMatches = GL.buildMatches(results.rows);
      } catch { /* use empty */ }

      const playedSet = new Set(playedMatches.map((m) => `${m.date}|${m.home}|${m.away}`));

      const upcoming = (fixtures || []).filter((f) => {
        const key = `${f.date}|${f.home}|${f.away}`;
        const revKey = `${f.date}|${f.away}|${f.home}`;
        return !playedSet.has(key) && !playedSet.has(revKey);
      }).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));

      if (!upcoming.length) continue;

      const rows = [];
      for (const fx of upcoming) {
        const pred = Predict.predictCorners(
          modelData.teams,
          modelData.league,
          fx.home,
          fx.away
        );
        if (!pred) continue;

        const showO75 = selectedLine === "both" || selectedLine === "o75";
        const showO85 = selectedLine === "both" || selectedLine === "o85";
        if (!showO75 && !showO85) continue;

        // time label
        let timeLabel = "";
        if (fx.time) {
          const [h, m] = fx.time.split(":").map(Number);
          if (Number.isFinite(h) && Number.isFinite(m)) {
            const d = new Date();
            d.setHours(h, m, 0, 0);
            const ampm = h >= 12 ? "PM" : "AM";
            const hh = h % 12 || 12;
            timeLabel = `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
          }
        }

        rows.push(`
          <tr class="corner-row">
            <td class="corner-teams">
              <span class="corner-home">${escHtml(fx.home)}</span>
              <span class="corner-vs">v</span>
              <span class="corner-away">${escHtml(fx.away)}</span>
            </td>
            <td class="corner-date">${fx.date} ${timeLabel ? `<span class="corner-time">${escHtml(timeLabel)}</span>` : ""}</td>
            ${showO75 ? `<td class="corner-o75 num">${pred.o75.toFixed(1)}%</td>` : ""}
            ${showO85 ? `<td class="corner-o85 num">${pred.o85.toFixed(1)}%</td>` : ""}
          </tr>`);
      }

      if (!rows.length) continue;
      anyRows = true;

      html += `
        <section class="corner-league">
          <div class="corner-league-head">
            <h2 class="corner-league-title">${escHtml(league.name)}</h2>
            <span class="corner-league-meta">${cornerDataSummary(modelData.league)}</span>
          </div>
          <table class="corner-table">
            <thead>
              <tr>
                <th scope="col" class="corner-th-teams">Fixture</th>
                <th scope="col" class="corner-th-date">Date</th>
                ${showO75 ? `<th scope="col" class="corner-th-num num">Over 7.5</th>` : ""}
                ${showO85 ? `<th scope="col" class="corner-th-num num">Over 8.5</th>` : ""}
              </tr>
            </thead>
            <tbody>${rows.join("")}</tbody>
          </table>
        </section>`;
    }

    if (!anyRows) {
      els.loading().hidden = true;
      els.empty().hidden = false;
      els.sections().hidden = true;
      return;
    }

    els.loading().hidden = true;
    els.error().hidden = true;
    els.empty().hidden = true;
    sectionsEl.innerHTML = html;
    sectionsEl.hidden = false;

    say(`Loaded corner predictions for ${cornerLeagues.length} leagues.`);
  }

  function cornerDataSummary(league) {
    if (!league) return "";
    return `avg ${league.avgTotalCorners.toFixed(1)} corners · O7.5 ${Math.round(league.o75Rate * 100)}% · O8.5 ${Math.round(league.o85Rate * 100)}%`;
  }

  function escHtml(s) {
    return String(s).replace(/[&<>\"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  /* ---------- boot ---------- */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {};
})();
