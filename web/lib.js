/* Goal Lines — shared core: data access, stats, table rendering.
   Data: raw.githubusercontent.com/oladeeayo/open-matchday first, then a local
   snapshot (data/ or ../data/) so the page also works from a checkout. */

const GL = (() => {
  const SEASON = "2627";
  const SEASON_LABEL = "2026/27";
  const BASES = [
    { url: "https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/", label: "github raw" },
    { url: "data/", label: "local data" },
    { url: "../data/", label: "local data" },
  ];

  const LEAGUES = [
    { folder: "ENG_1_premier-league", name: "Premier League", country: "England" },
    { folder: "ESP_1_la-liga", name: "La Liga", country: "Spain" },
    { folder: "GER_1_bundesliga", name: "Bundesliga", country: "Germany" },
    { folder: "ITA_1_serie-a", name: "Serie A", country: "Italy" },
    { folder: "FRA_1_ligue-1", name: "Ligue 1", country: "France" },
    { folder: "ENG_2_championship", name: "EFL Championship", country: "England" },
    { folder: "ENG_3_league-one", name: "EFL League One", country: "England" },
    { folder: "ENG_4_league-two", name: "EFL League Two", country: "England" },
    { folder: "ENG_5_national-league", name: "National League", country: "England" },
    { folder: "SCO_1_premiership", name: "Scottish Premiership", country: "Scotland" },
    { folder: "SCO_2_championship", name: "Scottish Championship", country: "Scotland" },
    { folder: "SCO_3_league-one", name: "Scottish League One", country: "Scotland" },
    { folder: "SCO_4_league-two", name: "Scottish League Two", country: "Scotland" },
    { folder: "GER_2_2-bundesliga", name: "2. Bundesliga", country: "Germany" },
    { folder: "GER_3_3-liga", name: "3. Liga", country: "Germany" },
    { folder: "POR_1_primeira-liga", name: "Primeira Liga", country: "Portugal" },
    { folder: "NED_1_eredivisie", name: "Eredivisie", country: "Netherlands" },
    { folder: "BEL_1_pro-league", name: "Belgian Pro League", country: "Belgium" },
    { folder: "TUR_1_super-lig", name: "Süper Lig", country: "Turkey" },
    { folder: "GRE_1_super-league", name: "Super League Greece", country: "Greece" },
    { folder: "SUI_1_super-league", name: "Swiss Super League", country: "Switzerland" },
    { folder: "AUT_1_bundesliga", name: "Austrian Bundesliga", country: "Austria" },
    { folder: "DEN_1_superliga", name: "Danish Superliga", country: "Denmark" },
    { folder: "SWE_1_allsvenskan", name: "Allsvenskan", country: "Sweden" },
    { folder: "NOR_1_eliteserien", name: "Eliteserien", country: "Norway" },
    { folder: "ROU_1_liga-1", name: "Liga I", country: "Romania" },
    { folder: "RUS_1_premier-liga", name: "Russian Premier Liga", country: "Russia" },
    { folder: "IRE_2_first-division", name: "League of Ireland First Division", country: "Ireland" },
    { folder: "IRE_3_national-league", name: "League of Ireland National League", country: "Ireland" },
    { folder: "POL_1_ekstraklasa", name: "Ekstraklasa", country: "Poland" },
    { folder: "POL_2_division-1", name: "I Liga", country: "Poland" },
    { folder: "POL_3_division-2", name: "II Liga", country: "Poland" },
    { folder: "BEL_U21_pro-league", name: "Pro League U21", country: "Belgium" },
    { folder: "WAL_1_cymru-premier", name: "Cymru Premier", country: "Wales" },
    { folder: "WAL_2_cymru-north", name: "Cymru North", country: "Wales" },
    { folder: "WAL_3_cymru-south", name: "Cymru South", country: "Wales" },
  ];

  const HEAT_DOMAINS = {
    o15: [55, 95], o25: [25, 75], o35: [5, 45],
    scored: [50, 95], btts: [30, 70], cs: [10, 55],
  };
  const HEAT_KEYS = ["o15", "o25", "o35", "scored", "btts", "cs"];
  const LOW_SAMPLE = 5;

  const TREE_URL = "https://api.github.com/repos/oladeeayo/open-matchday/git/trees/master?recursive=1";

  const COUNTRY = {
    ENG: "England", ESP: "Spain", GER: "Germany", ITA: "Italy", FRA: "France",
    SCO: "Scotland", POR: "Portugal", NED: "Netherlands", BEL: "Belgium",
    TUR: "Turkey", GRE: "Greece", SUI: "Switzerland", AUT: "Austria",
    DEN: "Denmark", SWE: "Sweden", NOR: "Norway", ROU: "Romania", RUS: "Russia",
    IRE: "Ireland", POL: "Poland", WAL: "Wales",
    BRA: "Brazil", ARG: "Argentina", MEX: "Mexico", USA: "USA",
    JPN: "Japan", KOR: "South Korea", AUS: "Australia", SWZ: "Switzerland",
  };

  // ISO 3166-1 alpha-2 (or flagcdn subdivision) codes for real flag images.
  const FLAG_CODE = {
    England: "gb-eng", Scotland: "gb-sct", Wales: "gb-wls",
    Spain: "es", Germany: "de", Italy: "it", France: "fr",
    Portugal: "pt", Netherlands: "nl", Belgium: "be", Turkey: "tr",
    Greece: "gr", Switzerland: "ch", Austria: "at", Denmark: "dk",
    Sweden: "se", Norway: "no", Romania: "ro", Russia: "ru",
    Ireland: "ie", Poland: "pl", Brazil: "br", Argentina: "ar",
    Mexico: "mx", USA: "us", Japan: "jp", "South Korea": "kr", Australia: "au",
  };

  /** Real flag image (flagcdn.com). Returns "" for unknown countries. */
  function countryFlag(country) {
    const code = FLAG_CODE[country];
    if (!code) return "";
    return `<img class="flag" src="https://flagcdn.com/w20/${code}.png" alt="" width="20" height="15" loading="lazy">`;
  }

  /** Text-only country badge when an image is not possible (e.g. <option>). */
  function countryTag(country) {
    const code = FLAG_CODE[country];
    return code ? code.toUpperCase().replace("GB-", "") : "";
  }

  function leagueFromFolder(folder) {
    const known = LEAGUES.find((l) => l.folder === folder);
    if (known) return known;
    const [code, tier, slug] = folder.split("_");
    const title = String(slug || folder)
      .split("-")
      .map((w) => (w === "fc" ? "FC" : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(" ");
    const name = tier === "1" ? title : `${tier}. ${title}`;
    return { folder, name, country: COUNTRY[code] || code };
  }

  // Live league list: whatever exists in the data/ folder right now.
  async function discoverLeagues() {
    try {
      const res = await fetch(TREE_URL, { headers: { Accept: "application/vnd.github+json" }, cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const folders = [...new Set(
        (json.tree || [])
          .map((t) => { const m = /^data\/([^/]+)\/results_[^/]+\.csv$/.exec(t.path); return m ? m[1] : null; })
          .filter(Boolean)
      )];
      if (!folders.length) throw new Error("no folders");
      return folders.map(leagueFromFolder);
    } catch {
      return LEAGUES.slice();
    }
  }

  /* ---------- data ---------- */

  const cache = new Map();

  function parseCsv(text) {
    const rows = [];
    let field = "", row = [], quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map((h) => h.trim());
    return rows.slice(1)
      .filter((r) => r.some((v) => v !== ""))
      .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
  }

  async function fetchResults(folder) {
    const key = `${folder}:${SEASON}`;
    if (cache.has(key)) return cache.get(key);
    let lastError = null;
    for (const base of BASES) {
      try {
        const res = await fetch(`${base.url}${folder}/results_${SEASON}.csv`, { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = parseCsv(await res.text());
        if (!rows.length) throw new Error("empty file");
        const payload = { rows, base: base.label };
        cache.set(key, payload);
        return payload;
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(lastError && lastError.message ? lastError.message : "network error");
  }

  async function fetchFixtures(folder) {
    const key = `fx:${folder}:${SEASON}`;
    if (cache.has(key)) return cache.get(key);
    for (const base of BASES) {
      try {
        const res = await fetch(`${base.url}${folder}/fixtures_${SEASON}.csv`, { cache: "no-cache" });
        if (!res.ok) continue;
        const rows = parseCsv(await res.text());
        if (!rows.length) continue;
        cache.set(key, rows);
        return rows;
      } catch { /* try next base */ }
    }
    cache.set(key, []);
    return [];
  }

  /* ---------- stats ---------- */

  const num = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

  function buildMatches(rows) {
    return rows
      .map((r) => {
        const fh = num(r.ft_home);
        const fa = num(r.ft_away);
        if (fh === null || fa === null) return null;
        return {
          gw: num(r.gw) ?? 0,
          date: r.date || "",
          home: r.home, away: r.away,
          fh, fa, total: fh + fa,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.date === b.date ? a.gw - b.gw : a.date < b.date ? -1 : 1));
  }

  function teamStats(matches, venue, tag) {
    const table = new Map();
    const get = (name) => {
      if (!table.has(name)) {
        table.set(name, {
          team: name, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0,
          o15: 0, o25: 0, o35: 0, scored: 0, btts: 0, cs: 0, games: [],
        });
      }
      return table.get(name);
    };

    for (const m of matches) {
      const sides = [];
      if (venue !== "away") sides.push({ name: m.home, gf: m.fh, ga: m.fa, isHome: true, opp: m.away });
      if (venue !== "home") sides.push({ name: m.away, gf: m.fa, ga: m.fh, isHome: false, opp: m.home });
      for (const s of sides) {
        const t = get(s.name);
        t.mp++;
        t.gf += s.gf;
        t.ga += s.ga;
        if (s.gf > s.ga) { t.w++; t.pts += 3; }
        else if (s.gf === s.ga) { t.d++; t.pts += 1; }
        else t.l++;
        if (m.total >= 2) t.o15++;
        if (m.total >= 3) t.o25++;
        if (m.total >= 4) t.o35++;
        if (s.gf >= 1) t.scored++;
        if (m.fh >= 1 && m.fa >= 1) t.btts++;
        if (s.ga === 0) t.cs++;
        t.games.push({ ...m, gf: s.gf, ga: s.ga, isHome: s.isHome, opp: s.opp, scored: s.gf >= 1, result: s.gf > s.ga ? "W" : s.gf === s.ga ? "D" : "L" });
      }
    }

    return [...table.values()].map((t) => {
      const out = {
        ...t,
        league: tag ? tag.name : "",
        country: tag ? tag.country : "",
        folder: tag ? tag.folder : "",
        o15: pct(t.o15, t.mp),
        o25: pct(t.o25, t.mp),
        o35: pct(t.o35, t.mp),
        scored: pct(t.scored, t.mp),
        btts: pct(t.btts, t.mp),
        cs: pct(t.cs, t.mp),
      };
      out.form = t.games.slice(-5).map((g) => g.result);
      out.ptsForm = out.form.reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
      return out;
    });
  }

  function leagueSummary(matches) {
    const n = matches.length;
    if (!n) return null;
    const goals = matches.reduce((s, m) => s + m.total, 0);
    const over = (line) => pct(matches.filter((m) => m.total >= line).length, n);
    return {
      n, gpm: Math.round((goals / n) * 100) / 100,
      o15: over(2), o25: over(3), o35: over(4),
      btts: pct(matches.filter((m) => m.fh >= 1 && m.fa >= 1).length, n),
    };
  }

  function standingsFrom(matches) {
    const table = new Map();
    const side = (name) => {
      if (!table.has(name)) table.set(name, { team: name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
      return table.get(name);
    };
    for (const m of matches) {
      const h = side(m.home);
      const a = side(m.away);
      h.p++; a.p++;
      h.gf += m.fh; h.ga += m.fa;
      a.gf += m.fa; a.ga += m.fh;
      if (m.fh > m.fa) { h.w++; h.pts += 3; a.l++; }
      else if (m.fh < m.fa) { a.w++; a.pts += 3; h.l++; }
      else { h.d++; a.d++; h.pts++; a.pts++; }
    }
    const list = [...table.values()]
      .sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.team.localeCompare(y.team));
    list.forEach((t, i) => { t.rank = i + 1; });
    return list;
  }

  function nextFixtures(fixtures, team, matches) {
    const played = new Set(matches.map((m) => `${m.date}|${m.home}|${m.away}`));
    return fixtures
      .filter((f) => (f.home === team || f.away === team) && !played.has(`${f.date}|${f.home}|${f.away}`))
      .sort((a, b) => (a.date === b.date ? (a.time || "").localeCompare(b.time || "") : a.date.localeCompare(b.date)))
      .slice(0, 3);
  }

  const ORDINAL = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  /* ---------- team panel ---------- */

  function closeTeamPanel() {
    const el = document.getElementById("team-panel");
    if (el) el.remove();
    document.removeEventListener("keydown", escClose);
    document.body.classList.remove("panel-open");
  }

  function openTeamPanel({ row, matches, fixtures, leagueName }) {
    closeTeamPanel();
    const table = standingsFrom(matches);
    const me = table.find((t) => t.team === row.team);
    const rankOf = (name) => table.find((t) => t.team === name);
    const posChip = (name) => {
      const t = rankOf(name);
      return t ? `<span class="pos">#${t.rank}</span>` : `<span class="pos muted">—</span>`;
    };

    const games = [...row.games].reverse();
    const prev = games.map((g) => {
      const cls = g.result === "W" ? "win" : g.result === "D" ? "draw" : "loss";
      const tick = (label, on) => `<span class="tick ${on ? "on" : "no"}">${label}</span>`;
      return `<li>
        <span class="match-date">${(g.date || "").slice(5)}</span>
        <span class="match-op"><span class="score ${cls}">${g.gf}–${g.ga}</span><span class="venue-tag">${g.isHome ? "HOME" : "AWAY"}</span>${escapeHtml(g.opp)} ${posChip(g.opp)}</span>
        <span class="ticks">${tick("1.5", g.total >= 2)}${tick("2.5", g.total >= 3)}${tick("3.5", g.total >= 4)}${tick("NET", g.scored)}</span>
      </li>`;
    }).join("");

    const up = nextFixtures(fixtures, row.team, matches);
    const next = up.length ? up.map((f) => {
      const isHome = f.home === row.team;
      const opp = isHome ? f.away : f.home;
      return `<li>
        <span class="match-date">${(f.date || "").slice(5)}</span>
        <span class="match-op"><span class="venue-tag">${isHome ? "HOME" : "AWAY"}</span>${escapeHtml(opp)} ${posChip(opp)}</span>
        <span class="kick">${escapeHtml(f.time || "—")}</span>
      </li>`;
    }).join("") : `<li class="none">No upcoming fixtures in the data yet.</li>`;

    const avgFor = row.mp ? (row.gf / row.mp).toFixed(2) : "0.00";
    const avgAg = row.mp ? (row.ga / row.mp).toFixed(2) : "0.00";

    const el = document.createElement("div");
    el.id = "team-panel";
    el.className = "panel-scrim";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", `${row.team} detail`);
    el.innerHTML = `<div class="panel">
      <div class="panel-head">
        <div class="panel-id">
          <span class="panel-name">${escapeHtml(row.team)}</span>
          <span class="panel-league">${escapeHtml(leagueName || row.league)}</span>
        </div>
        <div class="panel-pos">
          <span class="pos-big">${me ? ORDINAL(me.rank) : "—"}</span>
          <span class="pos-sub">of ${table.length}</span>
        </div>
        <button type="button" class="panel-close" aria-label="Close">Close ✕</button>
      </div>
      <div class="panel-body">
        <div class="panel-col">
          <h3 class="panel-h">Previous games</h3>
          <ul class="match-list">${prev || `<li class="none">No matches in this split.</li>`}</ul>
          <div class="panel-facts">
            <span>MP <b>${row.mp}</b></span><span>pts <b>${row.pts}</b></span>
            <span>avg GF <b>${avgFor}</b></span><span>avg GA <b>${avgAg}</b></span>
            <span>1.5+ <b>${fmt(row.o15)}</b></span><span>2.5+ <b>${fmt(row.o25)}</b></span>
            <span>3.5+ <b>${fmt(row.o35)}</b></span><span>scored <b>${fmt(row.scored)}</b></span>
          </div>
        </div>
        <div class="panel-col">
          <h3 class="panel-h">Next fixtures</h3>
          <ul class="match-list fixtures">${next}</ul>
          <h3 class="panel-h">Table</h3>
          <ol class="mini-table">
            ${table.slice(0, 8).map((t) => miniRow(t, row.team)).join("")}
            ${me && me.rank > 8 ? `<li class="gap">…</li>${miniRow(me, row.team)}` : ""}
          </ol>
        </div>
      </div>
    </div>`;

    document.body.appendChild(el);
    document.body.classList.add("panel-open");
    el.querySelector(".panel-close").focus();
    el.addEventListener("click", (e) => { if (e.target === el) closeTeamPanel(); });
    el.querySelector(".panel-close").addEventListener("click", closeTeamPanel);
    document.addEventListener("keydown", escClose);
    return el;
  }

  function escClose(e) {
    if (e.key === "Escape") closeTeamPanel();
  }

  function miniRow(t, meTeam) {
    return `<li class="${t.team === meTeam ? "is-me" : ""}">
      <span class="pos">#${t.rank}</span>
      <span class="mini-team">${escapeHtml(t.team)}</span>
      <span class="mini-p">${t.p}</span>
      <span class="mini-gd">${t.gf - t.ga > 0 ? "+" : ""}${t.gf - t.ga}</span>
      <span class="mini-pts">${t.pts}</span>
    </li>`;
  }


  /* ---------- helpers ---------- */

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const fmt = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(1)}%`);

  function heatColor(key, value) {
    if (value === null || value === undefined) return "transparent";
    const [min, max] = HEAT_DOMAINS[key] || [0, 100];
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return `rgba(26, 58, 92, ${(0.05 + t * 0.18).toFixed(3)})`;
  }

  function formStripHtml(form) {
    if (!form || !form.length) return `<span style="color:var(--muted)">—</span>`;
    return `<span class="form-strip">${form.map((r) => `<i class="${r.toLowerCase()}">${r}</i>`).join("")}</span>`;
  }

  function sortRows(rows, sortKey, sortDir) {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "team" || sortKey === "league") return String(a[sortKey]).localeCompare(b[sortKey]) * dir;
      if (sortKey === "form") return (a.ptsForm - b.ptsForm || a.mp - b.mp) * dir;
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
      if (av === bv) return a.team.localeCompare(b.team);
      return (av - bv) * dir;
    });
  }

  function applyFilters(rows, { query = "", mpOp = "gte", mpVal = null } = {}) {
    return rows.filter((r) => {
      if (query && !(`${r.team} ${r.league} ${r.country}`.toLowerCase().includes(query))) return false;
      if (mpVal !== null && Number.isFinite(mpVal)) {
        if (mpOp === "gte" && r.mp < mpVal) return false;
        if (mpOp === "lte" && r.mp > mpVal) return false;
      }
      return true;
    });
  }

  /* ---------- table rendering ---------- */

  function buildHead(cols, tbodyHost) {
    const thead = document.createElement("thead");
    const groupRow = document.createElement("tr");
    groupRow.className = "group-row";
    for (const g of cols) {
      const th = document.createElement("th");
      th.colSpan = g.keys.length;
      th.scope = "colgroup";
      th.className = g.accent ? "g-accent" : "";
      th.textContent = g.label;
      groupRow.appendChild(th);
    }
    const headRow = document.createElement("tr");
    headRow.className = "head-row";
    for (const g of cols) {
      for (const c of g.keys) {
        const th = document.createElement("th");
        th.scope = "col";
        th.dataset.key = c.key;
        th.textContent = c.label;
        th.className = [c.num ? "num" : "", c.cls || "", c.heat ? "heat-col" : "", c.opt ? "opt-col" : ""].filter(Boolean).join(" ");
        th.tabIndex = 0;
        headRow.appendChild(th);
      }
    }
    thead.append(groupRow, headRow);
    const table = tbodyHost.closest("table");
    table.querySelector("thead")?.remove();
    table.prepend(thead);
    return headRow;
  }

  function renderTable(cfg) {
    const { cols, rows, tbody, sortKey, sortDir, openKey, onToggle, headRow } = cfg;
    const keys = cols.flatMap((g) => g.keys);
    const flatCols = keys;

    const best = {};
    for (const key of HEAT_KEYS) {
      best[key] = rows.reduce((m, r) => (r[key] === null || r[key] === undefined ? m : Math.max(m, r[key])), -Infinity);
    }

    const frag = document.createDocumentFragment();
    rows.forEach((r, i) => {
      const tr = document.createElement("tr");
      const rowKey = `${r.folder}|${r.team}`;
      tr.className = "team-row row-in" + (rowKey === openKey ? " is-open" : "");
      tr.style.setProperty("--d", `${Math.min(i, 24) * 14}ms`);
      tr.dataset.team = r.team;
      const low = r.mp <= LOW_SAMPLE ? " low-n" : "";
      const lowTitle = r.mp <= LOW_SAMPLE ? ` title="Small sample: ${r.mp} matches"` : "";

      const cells = keys.map((c) => {
        switch (c.type) {
          case "team":
            return `<td class="col-team${low}"${lowTitle}><span class="team-cell"><span class="rank">${String(i + 1).padStart(2, "0")}</span><span class="team-name">${escapeHtml(r.team)}</span>${r.league ? `<span class="team-league">${escapeHtml(r.league)}</span>` : ""}</span></td>`;
          case "league":
            return `<td class="col-league" title="${escapeHtml(r.league)} — ${escapeHtml(r.country)}">${escapeHtml(r.league)}</td>`;
          case "form":
            return `<td class="col-form opt-col">${formStripHtml(r.form)}</td>`;
          case "pct": {
            const v = r[c.key];
            const isBest = c.heat && v !== null && v !== undefined && v === best[c.key] && rows.length > 1;
            const style = c.heat ? ` style="--heat:${heatColor(c.key, v)}"` : "";
            const cls = c.heat ? "heat" : "";
            return `<td class="num ${cls}${isBest ? " is-best" : ""}"${style}><span>${v === null || v === undefined ? "—" : v.toFixed(1)}</span></td>`;
          }
          default: {
            const v = r[c.key];
            return `<td class="num${c.opt ? " opt-col" : ""}${c.key === "mp" ? low : ""}">${v ?? "—"}</td>`;
          }
        }
      });

      tr.innerHTML = cells.join("");
      tr.addEventListener("click", () => onToggle(r));
      frag.appendChild(tr);

    });

    tbody.replaceChildren(frag);

    for (const th of headRow.querySelectorAll("th")) {
      const on = th.dataset.key === sortKey;
      th.classList.toggle("is-sorted", on);
      th.classList.toggle("asc", on && sortDir === "asc");
      th.setAttribute("aria-sort", on ? (sortDir === "asc" ? "ascending" : "descending") : "none");
    }
  }

  function toCsv(rows, withLeague) {
    const head = [];
    if (withLeague) head.push("league");
    head.push("team", "mp", "w", "d", "l", "gf", "ga", "pts", "form", "over_1_5", "over_2_5", "over_3_5", "scored", "btts", "clean_sheet");
    const lines = [head.join(",")];
    for (const r of rows) {
      const row = [];
      if (withLeague) row.push(`"${r.league.replace(/"/g, '""')}"`);
      row.push(
        `"${r.team.replace(/"/g, '""')}"`, r.mp, r.w, r.d, r.l, r.gf, r.ga, r.pts,
        `"${r.form.join("")}"`, r.o15 ?? "", r.o25 ?? "", r.o35 ?? "",
        r.scored ?? "", r.btts ?? "", r.cs ?? ""
      );
      lines.push(row.join(","));
    }
    return lines.join("\n");
  }

  return {
    SEASON, SEASON_LABEL, LEAGUES, HEAT_KEYS, LOW_SAMPLE,
    parseCsv, fetchResults, fetchFixtures, discoverLeagues,
    buildMatches, teamStats, leagueSummary, standingsFrom, nextFixtures,
    escapeHtml, fmt, heatColor, formStripHtml, sortRows, applyFilters,
    buildHead, renderTable, toCsv, openTeamPanel, closeTeamPanel,
    countryFlag, countryTag,
  };
})();

window.GL = GL;
