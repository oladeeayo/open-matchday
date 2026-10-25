/* over25stats — match detail page.
   URL params: ?league=<folder>&home=<team>&away=<team>
   Renders a single match card with centered hero, goal markets,
   1X2, most likely scorelines, corner markets, and team cards. */

const MatchPage = (() => {
  const $ = (s) => document.querySelector(s);

  const els = {
    root: () => document.getElementById("match-root"),
    loading: () => document.getElementById("state-loading"),
    error: () => document.getElementById("state-error"),
    errorDetail: () => document.getElementById("error-detail"),
  };

  const live = () => document.getElementById("live");
  const say = (msg) => { if (live()) live().textContent = msg; };

  const pageUrl = new URL(location.href, location.origin);

  const LEAGUE = pageUrl.searchParams.get("league") || "";
  const HOME = pageUrl.searchParams.get("home") || "";
  const AWAY = pageUrl.searchParams.get("away") || "";

  /* ---------- markets ---------- */

  const MARKETS = [
    { key: "o15", label: "Over 1.5" },
    { key: "o25", label: "Over 2.5" },
    { key: "o35", label: "Over 3.5" },
    { key: "btts", label: "BTTS" },
    { key: "h2", label: "Home 2+" },
    { key: "a2", label: "Away 2+" },
  ];

  const CONF = 65; // confidence line for result marks

  /* ---------- boot ---------- */

  async function main() {
    if (!LEAGUE || !HOME || !AWAY) {
      showError("Missing match parameters. Use ?league=, ?home=, ?away=.");
      return;
    }

    els.loading().hidden = false;
    els.root().hidden = true;
    els.error().hidden = true;

    try {
      const league = GL.LEAGUES.find((l) => l.folder === LEAGUE) ||
        { folder: LEAGUE, name: LEAGUE, country: "" };

      const [fixtures, results] = await Promise.all([
        GL.fetchFixtures(LEAGUE),
        GL.fetchResults(LEAGUE),
      ]);

      const matches = GL.buildMatches(results.rows);
      const model = Predict.buildLeague(matches);
      const cornerLeague = Predict.buildCornerLeague(matches);
      const cornerTeams = Predict.buildCornerModels(matches);

      if (!model) {
        showError(`No results data for ${league.name} yet.`);
        return;
      }

      const fixture = findFixture(fixtures, HOME, AWAY);
      const homeTeam = model.teams.get(HOME);
      const awayTeam = model.teams.get(AWAY);

      if (!homeTeam || !awayTeam) {
        showError(`One or both teams not found in ${league.name}.`);
        return;
      }

      const pred = Predict.predictMatch(model, HOME, AWAY);
      const corners = (cornerLeague && cornerTeams.size)
        ? Predict.predictCorners(cornerTeams, cornerLeague, HOME, AWAY)
        : null;

      if (!pred) {
        showError(`Could not build a prediction for this fixture.`);
        return;
      }

      els.loading().hidden = true;
      els.root().hidden = false;
      render(pred, league, fixture || null, pred.tip, model, null, null, corners);
      say(`Loaded ${league.name}: ${HOME} v ${AWAY}.`);
    } catch (err) {
      els.loading().hidden = true;
      showError(err.message || "Network error.");
    }
  }

  function findFixture(fixtures, home, away) {
    const today = new Date().toISOString().slice(0, 10);
    const pairing = (fixtures || []).filter((f) =>
      (f.home === home && f.away === away) || (f.home === away && f.away === home)
    );
    if (!pairing.length) return null;
    const byDate = (a, b) => String(a.date).localeCompare(String(b.date));
    const upcoming = pairing.filter((f) => !f.date || f.date >= today).sort(byDate);
    if (upcoming.length) return upcoming[0];
    return pairing.sort(byDate).pop();
  }

  function showError(msg) {
    els.loading().hidden = true;
    els.error().hidden = false;
    els.errorDetail().textContent = msg;
    els.root().hidden = true;
  }

  /* ---------- render ---------- */

  function render(p, league, fixture, tip, model, oddsPayload, played, corners) {
    const flag = GL.countryFlag(league.country);
    const kickoff = fixture && fixture.time ? fixture.time : "";
    const when = (fixture && fixture.date) || (played && played.date) ||
      (new Date().toISOString().slice(0, 10));

    const dateStr = new Date(when + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    });

    const ft = played ? { fh: played.fh, fa: played.fa, total: played.total } : null;

    const actualStrip = ft ? `
      <div class="match-foot">
        <div class="match-ft">
          <span class="mxg-k">Full time</span>
          <span class="mxg-v ft-score">${ft.fh} <i>–</i> ${ft.fa}</span>
          <span class="mxg-total">total ${ft.total}${ft.fh > ft.fa ? ` · ${escHtml(p.home)} win` : ft.fh < ft.fa ? ` · ${escHtml(p.away)} win` : " · draw"}</span>
        </div>
      </div>` : "";

    const actualWrap = ft ? `<div class="match-foot">${actualStrip}</div>` : "";

    const marketRows = MARKETS.map((m) => {
      const prob = p[m.key];
      const fair = p.fair ? p.fair[m.key] : 1 / Math.max(prob / 100, 0.01);
      const resHtml = ft ? (
        prob >= CONF
          ? `<td class="mres ${ft[m.key] ? "hit-yes" : "hit-no"}" title="${escHtml(m.label)}: ${ft[m.key] ? "hit" : "miss"} · called ${prob.toFixed(0)}%">${ft[m.key] ? "✓" : "✗"}</td>`
          : `<td class="mres muted" title="${escHtml(m.label)}: called ${prob.toFixed(0)}% (below the ${CONF}% line, unmarked)"></td>`
      ) : "";
      return `<tr class="mrow">
        <td class="mname">${escHtml(m.label)}</td>
        <td class="mprob">${pctCell(prob)}</td>
        <td class="mfair">${fair.toFixed(2)}</td>
        ${ft ? `<td class="mbook"><span class="muted">—</span></td>` : ""}
        ${ft ? resHtml : ""}
      </tr>`;
    }).join("");

    els.root().innerHTML = `
      <section class="match-hero">
        <div class="match-hero-header">
        <div class="match-meta">
          <span class="league-flag" aria-hidden="true">${flag}</span>
          <span class="match-league">${escHtml(league.name)}</span>
          <span class="sep">·</span>
          <span class="match-when">${escHtml(dateStr)}${kickoff ? ` · ${escHtml(kickoff)}` : ""}</span>
          ${ft ? `<span class="sep">·</span><span class="match-status is-ft">FT</span>` : ""}
        </div>
        </div>
        <div class="match-teams">
          <div class="mteam mteam-home">
            <span class="mteam-name">${escHtml(p.home)}</span>
            <span class="mteam-sub">${rankLine(p.homeRank, p.homeMp)}</span>
          </div>
          <div class="match-vs">v</div>
          <div class="mteam mteam-away">
            <span class="mteam-name">${escHtml(p.away)}</span>
            <span class="mteam-sub">${rankLine(p.awayRank, p.awayMp)}</span>
          </div>
        </div>
        ${actualWrap}
        <div class="match-xg">
          <span class="mxg-k">Expected goals</span>
          <span class="mxg-v">${p.xgH.toFixed(2)} <i>–</i> ${p.xgA.toFixed(2)}</span>
          <span class="mxg-total">total ${p.xgT.toFixed(2)}</span>
        </div>
        ${corners ? `
        <div class="match-xg match-xg-corners">
          <span class="mxg-k">Expected corners</span>
          <span class="mxg-v">${corners.cornersH.toFixed(1)} <i>–</i> ${corners.cornersA.toFixed(1)}</span>
          <span class="mxg-total">total ${corners.cornersT.toFixed(1)}</span>
        </div>` : ""}
      </section>

      <div class="match-grid">
        <section class="mcard mcard-markets">
          <h2 class="mcard-title">Goal markets${ft ? " · how they landed" : ""}</h2>
          <table class="mtable">
            <thead>
              <tr><th>Market</th><th class="num">Model</th><th class="num">Fair</th>${ft ? '<th class="num">Result</th>' : ""}</tr>
            </thead>
            <tbody>${marketRows}</tbody>
          </table>
          <p class="mcard-note">Fair odds are the model's own implied prices. Informational only — not betting advice.</p>
          ${ft ? `<p class="mcard-note mcard-disclaimer"><b>Result marks</b> (✓/✗) appear only where the model rated the market ${CONF}% or higher — the confidence line. Reads below it stay unmarked.</p>` : ""}
        </section>

        ${corners ? cornersCard(corners, ft) : ""}

        <section class="mcard mcard-1x2">
          <h2 class="mcard-title">Result 1X2</h2>
          <div class="one-x-two">
            ${x2Row("H", p.home, p.hw, ft)}
            ${x2Row("D", "Draw", p.dr, ft)}
            ${x2Row("A", p.away, p.aw, ft)}
          </div>
        </section>

        <section class="mcard mcard-scores">
          <h2 class="mcard-title">Most likely scorelines</h2>
          <div class="scorelines">
            ${(p.topScores || []).map((s, i) => `
              <div class="scoreline${i === 0 ? " is-top" : ""}">
                <span class="sl-score">${s.h}–${s.a}</span>
                <span class="sl-p">${(s.p * 100).toFixed(1)}<i>%</i></span>
              </div>`).join("") || '<p class="muted">—</p>'}
          </div>
          <p class="mcard-note">Best guess <b>${p.score ? `${p.score.h}–${p.score.a}` : "—"}</b> · model confidence ${p.confidence}%</p>
        </section>

        <section class="mcard mcard-form">
          <h2 class="mcard-title">Season snapshot</h2>
          ${teamCard(p.home, model)}
          ${teamCard(p.away, model)}
        </section>
      </div>
    `;

    // re-bind dynamic bits
    els.root().querySelectorAll("table.mtable").forEach((t) => GL.makeSortable(t));
    document.title = `${p.home} v ${p.away} — over25stats`;
  }

  function x2Row(k, label, prob, ft) {
    const value = Number.isFinite(prob) ? prob : 0;
    const res = ft ? `<span class="x2-res ${ft[k.toLowerCase()] ? "hit-yes" : "hit-no"}">${ft[k.toLowerCase()] ? "✓" : "✗"}</span>` : "";
    return `<div class="x2-row">
      <span class="x2-label">${escHtml(label)}</span>
      <span class="x2-p">${value.toFixed(1)}<i>%</i></span>
      ${res}
    </div>`;
  }

  function rankLine(rank, mp) {
    const bits = [];
    if (rank) bits.push(`#${rank}`);
    if (mp) bits.push(`${mp} played`);
    return bits.join(" · ");
  }

  function pctCell(v) {
    return `<span class="pct">${v.toFixed(1)}<i>%</i></span>`;
  }

  function cornersCard(corners, ft) {
    const fairO75 = 1 / Math.max(corners.o75 / 100, 0.01);
    const fairO85 = 1 / Math.max(corners.o85 / 100, 0.01);
    const res75 = ft ? `<td class="mres ${ft.cornersO75 ? "hit-yes" : "hit-no"}" title="Over 7.5 corners: ${ft.cornersO75 ? "hit" : "miss"}">${ft.cornersO75 ? "✓" : "✗"}</td>` : "";
    const res85 = ft ? `<td class="mres ${ft.cornersO85 ? "hit-yes" : "hit-no"}" title="Over 8.5 corners: ${ft.cornersO85 ? "hit" : "miss"}">${ft.cornersO85 ? "✓" : "✗"}</td>` : "";
    return `
      <section class="mcard mcard-corners">
        <h2 class="mcard-title">Corner markets${ft ? " · how they landed" : ""}</h2>
        <table class="mtable">
          <thead>
            <tr><th>Market</th><th class="num">Model</th><th class="num">Fair</th>${ft ? '<th class="num">Result</th>' : ""}</tr>
          </thead>
          <tbody>
            <tr class="mrow">
              <td class="mname">Over 7.5 corners</td>
              <td class="mprob">${pctCell(corners.o75)}</td>
              <td class="mfair">${fairO75.toFixed(2)}</td>${res75}
            </tr>
            <tr class="mrow">
              <td class="mname">Over 8.5 corners</td>
              <td class="mprob">${pctCell(corners.o85)}</td>
              <td class="mfair">${fairO85.toFixed(2)}</td>${res85}
            </tr>
          </tbody>
        </table>
        <div class="match-xg" style="border-top:0;margin-top:8px;padding-top:8px;">
          <span class="mxg-k">Expected corners</span>
          <span class="mxg-v">${corners.cornersH.toFixed(1)} <i>–</i> ${corners.cornersA.toFixed(1)}</span>
          <span class="mxg-total">total ${corners.cornersT.toFixed(1)}</span>
        </div>
        <p class="mcard-note">Expected corners use home/away corner rates shrunk toward the league venue mean, blended with the league's observed over-line rate.</p>
      </section>`;
  }

  function teamCard(name, model) {
    const t = model && model.teams ? model.teams.get(name) : null;
    if (!t) return `<div class="tcard"><span class="tcard-name">${escHtml(name)}</span><span class="muted">no season data in this competition</span></div>`;
    const last5 = (t.last5 || []).map((g) => {
      const r = g.gf > g.ga ? "W" : g.gf === g.ga ? "D" : "L";
      return `<i class="${r.toLowerCase()}" title="${escHtml(g.date || "")} ${g.gf}–${g.ga} v ${escHtml(g.opp || "")}">${r}</i>`;
    }).join("");
    const strip = last5 ? `<span class="form-strip">${last5}</span>` : "";
    return `<div class="tcard">
      <span class="tcard-name">${escHtml(name)}</span>
      <span class="tcard-line">#${t.rank} · ${t.mp} played · ${t.pts} pts${strip ? ` · ${strip}` : ""}</span>
      <span class="tcard-line muted">attack ${t.attStrength.toFixed(2)}× · defence ${t.defStrength ? t.defStrength.toFixed(2) : "?"}×</span>
    </div>`;
  }

  function escHtml(s) {
    return String(s).replace(/[&<>\"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  /* ---------- boot ---------- */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }

  return {};
})();
