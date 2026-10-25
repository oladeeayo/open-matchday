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
    scored: [50, 95], s2: [20, 60], btts: [30, 70], cs: [10, 55],
  };
  const HEAT_KEYS = ["o15", "o25", "o35", "scored", "btts", "cs"];
  const LOW_SAMPLE = 5;

  /* Confidence line for RESULT MARKS: a finished fixture only gets a check /
     cross (and the ledger only counts a call in its hit rate) when the model
     rated the market this high or better. */
  const CONF_MARK = 70;

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

  /* ---------- club badges (badges/badges.js manifest) ---------- */

  const BADGE_STOP = new Set([
    "fc", "afc", "cf", "sc", "ac", "af", "sk", "sv", "vfb", "vfl", "tsg", "bsg",
    "fk", "nk", "hnk", "of", "de", "del", "da", "la", "le", "and", "club",
    "united", "city", "town", "university", "ii", "u21", "09", "1888", "1899",
    "as", "cd", "ud", "sd", "rc", "cp", "ca", "sg", "ss",
  ]);
  const BADGE_SYN = { utd: "united" };
  let badgeIndex = null;
  const badgeSeen = new Map();

  function badgeWords(str) {
    return str
      .replace(/\([^)]*\)/g, " ")
      .replace(/[æ]/g, "ae").replace(/[ø]/g, "o")
      .replace(/[ðđ]/g, "d").replace(/ß/g, "ss")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
      .split(" ").filter(Boolean)
      .map((w) => BADGE_SYN[w] || w)
      .filter((w) => w.length > 1 && !BADGE_STOP.has(w));
  }

  function buildBadgeIndex() {
    const keys = [];
    const byWord = new Map();
    for (const [key, src] of Object.entries(window.BADGES || {})) {
      const i = keys.push([new Set(badgeWords(key)), src, /\([^)]*\)/.test(key)]) - 1;
      for (const w of keys[i][0]) {
        if (!byWord.has(w)) byWord.set(w, []);
        byWord.get(w).push(i);
      }
    }
    return { keys, byWord };
  }

  function badgeFallback(name) {
    const want = badgeWords(name);
    if (!want.length) return "";
    const idx = badgeIndex || (badgeIndex = buildBadgeIndex());
    const posts = want.map((w) => idx.byWord.get(w));
    if (posts.some((p) => !p)) return "";
    let best = "", bestExtra = Infinity, bestParen = true, tied = false;
    const shortest = posts.slice().sort((a, b) => a.length - b.length)[0];
    for (const i of shortest) {
      const [set, src, paren] = idx.keys[i];
      if (!want.every((w) => set.has(w))) continue;
      const extra = set.size - want.length;
      if (extra < bestExtra) {
        best = src; bestExtra = extra; bestParen = paren; tied = false;
      } else if (extra === bestExtra && src !== best) {
        // "FC Twente" and "Twente (Ned)" are one club — prefer the plain key
        if (!paren && bestParen) { best = src; bestParen = false; tied = false; }
        else if (paren && !bestParen) { /* keep the plain key */ }
        else tied = true;
      }
    }
    return tied ? "" : best;
  }

  /** Local club badge (badges/badges.js manifest). Empty string when unknown. */
  function badgeSrc(name) {
    const badges = window.BADGES;
    if (!badges || !name) return "";
    if (badges[name]) return badges[name];
    if (badgeSeen.has(name)) return badgeSeen.get(name);
    const src = badgeFallback(name);
    badgeSeen.set(name, src);
    return src;
  }

  /** Markup for a badge inside a team name; empty when the club has no badge. */
  function badgeHtml(name) {
    const src = badgeSrc(name);
    if (!src) return "";
    return `<img class="badge" src="${escapeHtml(src)}" alt="" width="18" height="18" loading="lazy" onerror="this.remove()">`;
  }

  /**
   * Picker label for a league. Flags cannot render inside a native <option>,
   * so the country is only spelled out when two leagues share a name.
   */
  function optionLabel(leagues, lg) {
    const clash = leagues.filter((l) => l.name === lg.name).length > 1;
    return clash ? `${lg.name} — ${lg.country}` : lg.name;
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

  /** Drop every cached CSV so the next read hits the network again. */
  function clearCache() {
    cache.clear();
  }

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
          home_corners: num(r.home_corners),
          away_corners: num(r.away_corners),
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

  const UEFA_COEFF = {
    England: 103.796, Italy: 88.589, Spain: 83.243, Germany: 81.545,
    France: 69.153, Portugal: 65.750, Belgium: 59.450, Netherlands: 52.562,
    Turkey: 50.275, Czechia: 45.125, Poland: 45.125, Greece: 45.012,
    Norway: 38.612, Denmark: 38.306, Cyprus: 34.693, Switzerland: 30.200,
    Austria: 28.250, Hungary: 27.812, Scotland: 26.250, Croatia: 25.906,
    Sweden: 25.750,
    Romania: 24.750, Israel: 23.375, Slovenia: 22.718, Ukraine: 22.587,
    Azerbaijan: 21.687, Slovakia: 20.500, Bulgaria: 20.437, Serbia: 17.750,
    Russia: 17.332, Iceland: 17.020, Ireland: 16.218, Armenia: 15.437,
    Kosovo: 13.781, Latvia: 13.500, "Bosnia & Herzegovina": 13.468,
    Finland: 13.125, Kazakhstan: 12.375, Moldova: 10.250,
    "Faroe Islands": 9.750, "North Macedonia": 8.967, Albania: 8.750,
    Belarus: 8.708, Lithuania: 7.875, Malta: 7.625, Andorra: 7.498,
    Estonia: 7.041, Gibraltar: 6.874, Georgia: 6.500,
    "Northern Ireland": 6.375, Luxembourg: 5.500, Montenegro: 5.833,
    Wales: 4.500, "San Marino": 2.999,
    // non-UEFA estimates for the leagues the data covers
    Argentina: 18.000, Australia: 10.000, Brazil: 28.000, China: 12.000,
    Japan: 20.000, Mexico: 18.000, USA: 16.000, "South Korea": 12.000,
    Austria_U21: 0, Europe: 0,  // UEFA-level competitions — no country rating
  };

  /** UEFA association coefficient for a league's country, for context.
   *  Returns 0 for UEFA-level competitions (no country rating applies). */
  function leagueRating(country) {
    return UEFA_COEFF[country] || 0;
  }

  /** Domestic-league profile for a team from team_index.js:
   *  { folder, country, coeff, mp, attRel, defRel, tier } or null. */
  function teamExternal(name) {
    const idx = window.TEAM_INDEX && window.TEAM_INDEX[name];
    if (!idx) return null;
    const [fidx, mp, attRel, defRel, tier] = idx;
    const folder = (window.TEAM_FOLDERS || [])[fidx] || "";
    if (!folder) return null;
    const known = LEAGUES.find((l) => l.folder === folder);
    const code = folder.split("_")[0];
    const country = known ? known.country : (COUNTRY[code] || "");
    return {
      folder, country, coeff: leagueRating(country),
      mp: mp || 0, attRel: attRel || 1, defRel: defRel || 1, tier: tier || 0,
    };
  }

  /* Club Elo (elo.js) — reputation prior for cross-league fixtures.
     window.CLUB_ELO      = { clubelo name: [elo, fed, level], ... }
     window.CLUB_ELO_ALIASES = { data-folder name: clubelo name, ... }
     Lookup order: exact → alias → normalized key → unique token subset.
     Misses fall back to the coefficient estimate (elo ≈ 1551 + 1.112*coeff,
     fitted against 25 federation level-1 means), or null when the country
     carries no coefficient (UEFA-level-only teams). */
  const ELO_DROP = new Set([
    "fc", "cf", "sc", "ac", "afc", "af", "sk", "sv", "vfb", "vfl", "tsg", "bsg",
    "fk", "nk", "hnk", "of", "de", "del", "da", "la", "le", "and", "club",
    "united", "city", "town", "university", "ii", "iii", "u19", "u21", "u23",
    "as", "cd", "ud", "sd", "rc", "cp", "ca", "sg", "ss", "bs", "if",
    "09", "1846", "1848", "1860", "1878", "1887", "1888", "1893", "1897",
    "1899", "1900", "1905", "1907", "1908", "1909", "1910", "1911", "1912",
    "1919", "1920", "1928", "1946", "1960", "1965", "1967", "1970", "1974",
    "1988", "1999", "b", "c", "1", "2", "3",
  ]);
  const ELO_SYN = { utd: "united", intl: "internazionale" };

  function eloKey(s) {
    s = String(s || "");
    s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    s = s.replace(/ø/gi, "o").replace(/æ/gi, "ae").replace(/ß/g, "ss");
    s = s.replace(/&/g, " and ").replace(/['’.]/g, " ").replace(/[-–—/]/g, " ");
    s = s.replace(/[^A-Za-z ]/g, " ").toLowerCase();
    return s.split(/\s+/).filter(Boolean)
      .map((w) => ELO_SYN[w] || w)
      .filter((w) => w && !ELO_DROP.has(w))
      .join(" ");
  }

  let _eloIndex = null;
  function eloIndex() {
    if (_eloIndex) return _eloIndex;
    const table = window.CLUB_ELO || {};
    const idx = new Map();
    for (const [name, rec] of Object.entries(table)) {
      const k = eloKey(name);
      const prev = idx.get(k);
      // level-1 first, then higher Elo — Everton ENG beats Everton CHI
      if (!prev || (rec[2] > prev.level) || (rec[2] === prev.level && rec[0] > prev.elo)) {
        idx.set(k, { name, elo: rec[0], fed: rec[1], level: rec[2] });
      }
    }
    _eloIndex = idx;
    return idx;
  }

  /** Club Elo rating for a data-folder team name, or null.
   *  Returns { name, elo, fed, level } — name is Club Elo's own spelling. */
  function teamElo(name) {
    if (!name) return null;
    const table = window.CLUB_ELO || {};
    const hit = table[name];
    if (hit) return { name, elo: hit[0], fed: hit[1], level: hit[2] };
    const ali = (window.CLUB_ELO_ALIASES || {})[name];
    if (ali && table[ali]) {
      return { name: ali, elo: table[ali][0], fed: table[ali][1], level: table[ali][2] };
    }
    const idx = eloIndex();
    const kHit = idx.get(eloKey(name));
    if (kHit) return kHit;
    // badge-style fallback: unique clubelo key containing every query word
    const want = eloKey(name).split(" ");
    if (!want.length) return null;
    let best = null, bestExtra = Infinity, tied = false;
    for (const [ek, club] of idx) {
      const kw = ek.split(" ");
      if (!kw.length || !want.every((w) => kw.includes(w))) continue;
      const extra = kw.length - want.length;
      if (extra < bestExtra) { best = club; bestExtra = extra; tied = false; }
      else if (extra === bestExtra && club.name !== best.name) tied = true;
    }
    return tied ? null : best;
  }

  /** Elo estimate from a UEFA association coefficient — the fallback when a
   *  side has no Club Elo entry. Returns null for coefficient 0 (no rating). */
  function eloFromCoeff(coeff) {
    if (!coeff || coeff <= 0) return null;
    return Math.round(1551 + 1.112 * coeff);
  }

  /** Full lookup for the predictor: real Club Elo when the table knows the
   *  club, otherwise a coefficient-based estimate. src is "club" or "est". */
  function teamEloFull(name, ex) {
    const hit = teamElo(name);
    if (hit) return { elo: hit.elo, src: "club", fed: hit.fed, level: hit.level };
    const est = eloFromCoeff(ex ? ex.coeff : 0);
    if (est) return { elo: est, src: "est", fed: "", level: 0 };
    return null;
  }

  return {
    SEASON, SEASON_LABEL, LEAGUES, HEAT_KEYS, LOW_SAMPLE,
    parseCsv, fetchResults, fetchFixtures, discoverLeagues,
    buildMatches, teamStats, leagueSummary, standingsFrom, nextFixtures,
    escapeHtml, fmt, heatColor, formStripHtml, sortRows, applyFilters,
    buildHead, renderTable, toCsv, openTeamPanel, closeTeamPanel,
    countryFlag, countryTag, optionLabel, clearCache, badgeHtml, badgeSrc,
    HEAT_DOMAINS, CONF_MARK,
    UEFA_COEFF, leagueRating, teamExternal,
    teamElo, teamEloFull, eloFromCoeff, eloKey,

    /** Top-10 leagues by UEFA association coefficient (tier-1 domestic leagues only).
     *  Used to scope corner predictions to the highest-profile leagues.
     */
    CORNER_LEAGUES: (() => {
      const UEFA_COEFF = {
        England: 103.796, Spain: 83.243, Germany: 81.545, Italy: 88.589,
        France: 69.153, Portugal: 65.750, Belgium: 59.450, Netherlands: 52.562,
        Turkey: 50.275, Poland: 45.125, Scotland: 38.750, Greece: 31.250,
        Switzerland: 41.250, Austria: 36.500, Denmark: 33.500, Sweden: 33.000,
        Norway: 31.750, Romania: 29.500, Russia: 35.000, Ireland: 27.000,
        Brazil: 58.500, Argentina: 49.500,
        Mexico: 41.500, USA: 38.250, Japan: 47.500, "South Korea": 43.000,
        Australia: 35.500,
      };
      const tier1 = LEAGUES.filter((l) => /_[1]_/.test(l.folder));
      tier1.sort((a, b) => (UEFA_COEFF[b.country] || 0) - (UEFA_COEFF[a.country] || 0));
      return new Set(tier1.slice(0, 10).map((l) => l.folder));
    })(),
  };
})();

window.GL = GL;
