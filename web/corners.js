/* over25stats — corner prediction page for the top-10 leagues.
   Loads the next unplayed matchday for each league, predicts over 7.5 / over 8.5
   corners with Predict.predictCorners, and renders one section per league. */

const Corners = (() => {
  const els = {
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

  const state = {
    leagues: [],                  // [{folder, name, country}]
    roundsByLeague: new Map(),    // folder -> { fixture, gw, model, played }
    selectedLeague: "all",
    selectedLine: "both",
    loaded: false,
  };

  /* ---------- init ---------- */

  function init() {
    if (!document.getElementById("board")) return;
    populateLeagueFilter();
    bindControls();
    loadAll();
  }

  function populateLeagueFilter() {
    const select = els.leagueFilter();
    if (!select) return;
    const cornerLeagues = GL.LEAGUES
      .filter((l) => GL.CORNER_LEAGUES.has(l.folder))
      .sort((a, b) => a.name.localeCompare(b.name));
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
        if (state.loaded) renderAll();
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
      await Promise.all(state.leagues.map(loadLeague));
      state.loaded = true;
      await renderAll();
    } catch (err) {
      els.loading().hidden = true;
      els.error().hidden = false;
      els.errorDetail().textContent = err && err.message ? err.message : "Network error.";
    }
  }

  async function loadLeague(league) {
    try {
      const [fixtures, results] = await Promise.all([
        GL.fetchFixtures(league.folder),
        GL.fetchResults(league.folder),
      ]);

      const matches = GL.buildMatches(results.rows);
      const cornerLeague = Predict.buildCornerLeague(matches);
      const cornerTeams = Predict.buildCornerModels(matches);
      if (!cornerLeague || !cornerTeams.size) return;

      const played = new Set();
      for (const m of matches) {
        played.add(`${m.date}|${m.home}|${m.away}`);
        played.add(`${m.date}|${m.away}|${m.home}`);
      }

      const round = nextRound(fixtures, played);
      if (!round.fixtures.length) return;

      state.roundsByLeague.set(league.folder, {
        fixtures: round.fixtures,
        gw: round.gw,
        league: cornerLeague,
        teams: cornerTeams,
      });
    } catch {
      // a league with no data yet is simply skipped
    }
  }

  /**
   * The next matchday = the lowest gameweek that still has unplayed fixtures,
   * with any fixture dated before today dropped (they are awaiting results).
   * Falls back to the earliest remaining date when a fixtures file has no gw.
   */
  function nextRound(fixtures, played) {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (fixtures || []).filter((f) => {
      if (!f || !f.home || !f.away) return false;
      if (played.has(`${f.date}|${f.home}|${f.away}`)) return false;
      if (played.has(`${f.date}|${f.away}|${f.home}`)) return false;
      if (f.date && f.date < today) return false;
      return true;
    });

    if (!upcoming.length) return { fixtures: [], gw: null };

    const byKickoff = (a, b) =>
      String(a.date).localeCompare(String(b.date)) ||
      String(a.time || "").localeCompare(String(b.time || ""));

    const gws = upcoming.map((f) => Number(f.gw)).filter((n) => Number.isFinite(n) && n > 0);
    if (gws.length) {
      const gw = Math.min(...gws);
      return {
        gw,
        fixtures: upcoming.filter((f) => Number(f.gw) === gw).sort(byKickoff),
      };
    }

    const date = upcoming.map((f) => f.date).sort()[0];
    return { gw: null, fixtures: upcoming.filter((f) => f.date === date).sort(byKickoff) };
  }

  /* ---------- render ---------- */

  function renderAll() {
    const sectionsEl = els.sections();
    if (!sectionsEl) return;

    const showO75 = state.selectedLine === "both" || state.selectedLine === "o75";
    const showO85 = state.selectedLine === "both" || state.selectedLine === "o85";

    const entries = [];
    for (const league of state.leagues) {
      if (state.selectedLeague !== "all" && league.folder !== state.selectedLeague) continue;
      const data = state.roundsByLeague.get(league.folder);
      if (!data) continue;
      entries.push({ league, data });
    }

    entries.sort((a, b) => String(a.data.fixtures[0].date).localeCompare(String(b.data.fixtures[0].date)));

    let html = "";
    let anyRows = false;
    let totalRows = 0;

    for (const { league, data } of entries) {
      const rows = [];
      for (const fx of data.fixtures) {
        const pred = Predict.predictCorners(data.teams, data.league, fx.home, fx.away);
        if (!pred) continue;
        rows.push(`
          <tr class="corner-row">
            <td class="corner-teams">
              <span class="corner-home">${escHtml(fx.home)}</span>
              <span class="corner-vs">v</span>
              <span class="corner-away">${escHtml(fx.away)}</span>
            </td>
            <td class="corner-date">${escHtml(fx.date)}${fx.time ? ` <span class="corner-time">${escHtml(fx.time)}</span>` : ""}</td>
            ${showO75 ? `<td class="corner-o75 num">${pred.o75.toFixed(1)}%</td>` : ""}
            ${showO85 ? `<td class="corner-o85 num">${pred.o85.toFixed(1)}%</td>` : ""}
            <td class="corner-exp num">${pred.cornersT.toFixed(1)}</td>
          </tr>`);
      }
      if (!rows.length) continue;
      anyRows = true;
      totalRows += rows.length;

      const gwLabel = data.gw ? `Matchday ${data.gw} · ` : "";
      html += `
        <section class="corner-league">
          <div class="corner-league-head">
            <h2 class="corner-league-title">${escHtml(league.name)}</h2>
            <span class="corner-league-meta">${gwLabel}${cornerDataSummary(data.league)}</span>
          </div>
          <table class="corner-table">
            <thead>
              <tr>
                <th scope="col" class="corner-th-teams">Fixture</th>
                <th scope="col" class="corner-th-date">Kick-off</th>
                ${showO75 ? `<th scope="col" class="corner-th-num num">Over 7.5</th>` : ""}
                ${showO85 ? `<th scope="col" class="corner-th-num num">Over 8.5</th>` : ""}
                <th scope="col" class="corner-th-num num">Exp.<span class="corner-th-full"> corners</span></th>
              </tr>
            </thead>
            <tbody>${rows.join("")}</tbody>
          </table>
        </section>`;
    }

    if (!anyRows) {
      els.loading().hidden = true;
      els.sections().hidden = true;
      els.empty().hidden = false;
      return;
    }

    els.loading().hidden = true;
    els.error().hidden = true;
    els.empty().hidden = true;
    sectionsEl.innerHTML = html;
    sectionsEl.hidden = false;

    say(`Loaded ${totalRows} upcoming fixtures across ${entries.length} leagues.`);
  }

  function cornerDataSummary(league) {
    if (!league) return "";
    return `avg ${league.avgTotalCorners.toFixed(1)} corners · O7.5 ${Math.round(league.o75Rate * 100)}% · O8.5 ${Math.round(league.o85Rate * 100)}% · ${league.n} played`;
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
