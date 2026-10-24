/* over25stats — goal-market prediction engine.
   Poisson xG from league-relative strengths + form + position context.
   Pure functions; depends on GL (lib.js) only for types if loaded first. */

const Predict = (() => {
  const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
  const fact = (n) => (n < FACT.length ? FACT[n] : FACT.reduce((a, _, i) => (i <= n ? a * i : a), 1));

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function poissonPmf(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    return Math.exp(-lambda) * Math.pow(lambda, k) / fact(k);
  }

  /** P(X >= n) for Poisson(lambda). */
  function poissonAtLeast(n, lambda) {
    if (n <= 0) return 1;
    let s = 0;
    for (let k = 0; k < n; k++) s += poissonPmf(k, lambda);
    return clamp(1 - s, 0, 1);
  }

  /** Most likely scoreline on a small grid. */
  function bestScore(xgH, xgA, maxG = 6) {
    let best = { h: 0, a: 0, p: -1 };
    for (let h = 0; h <= maxG; h++) {
      for (let a = 0; a <= maxG; a++) {
        const p = poissonPmf(h, xgH) * poissonPmf(a, xgA);
        if (p > best.p) best = { h, a, p };
      }
    }
    return best;
  }

  /* ---------- league + team models ---------- */

  /**
   * Build per-league model from finished matches.
   * teams: Map name -> { mp, gf, ga, pts, rank, attH, attA, defH, defA,
   *                       o25, btts, scored, formGf, formGa, last5 }
   */
  function buildLeague(matches) {
    const n = matches.length;
    if (!n) return null;

    let sumHG = 0, sumAG = 0, o15 = 0, o25 = 0, o35 = 0, btts = 0;
    for (const m of matches) {
      sumHG += m.fh;
      sumAG += m.fa;
      const t = m.total;
      if (t >= 2) o15++;
      if (t >= 3) o25++;
      if (t >= 4) o35++;
      if (m.fh >= 1 && m.fa >= 1) btts++;
    }
    const avgHG = sumHG / n;
    const avgAG = sumAG / n;
    const league = {
      n, avgHG, avgAG,
      avgGpm: (sumHG + sumAG) / n,
      o15: o15 / n, o25: o25 / n, o35: o35 / n, btts: btts / n,
    };

    // raw per-team venue splits
    const raw = new Map();
    const side = (name) => {
      if (!raw.has(name)) {
        raw.set(name, {
          team: name,
          hMp: 0, hGf: 0, hGa: 0, hPts: 0,
          aMp: 0, aGf: 0, aGa: 0, aPts: 0,
          mp: 0, gf: 0, ga: 0, pts: 0,
          o25: 0, scored: 0, btts: 0,
          games: [],
        });
      }
      return raw.get(name);
    };

    for (const m of matches) {
      const H = side(m.home);
      const A = side(m.away);
      H.hMp++; A.aMp++;
      H.hGf += m.fh; H.hGa += m.fa;
      A.aGf += m.fa; A.aGa += m.fh;
      H.mp++; A.mp++;
      H.gf += m.fh; H.ga += m.fa;
      A.gf += m.fa; A.ga += m.fh;
      if (m.fh > m.fa) { H.hPts += 3; H.pts += 3; A.aPts += 0; }
      else if (m.fh < m.fa) { A.aPts += 3; A.pts += 3; }
      else { H.hPts += 1; A.aPts += 1; H.pts += 1; A.pts += 1; }
      if (m.total >= 3) { H.o25++; A.o25++; }
      if (m.fh >= 1 && m.fa >= 1) { H.btts++; A.btts++; }
      if (m.fh >= 1) H.scored++;
      if (m.fa >= 1) A.scored++;
      H.games.push({ fh: m.fh, fa: m.fa, total: m.total, home: true, date: m.date, gw: m.gw, opp: m.away });
      A.games.push({ fh: m.fh, fa: m.fa, total: m.total, home: false, date: m.date, gw: m.gw, opp: m.home });
    }

    // standings for rank
    const table = [...raw.values()]
      .map((t) => ({ team: t.team, pts: t.pts, gf: t.gf, ga: t.ga, mp: t.mp }))
      .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team));
    const rankOf = new Map(table.map((t, i) => [t.team, i + 1]));
    const size = table.length || 1;

    // shrinkage prior: k=4 pseudo-observations toward league mean
    // att = (goals + k * league_avg) / (games + k)  — goals are a sum, not a rate
    const K = 4;
    const teams = new Map();
    for (const t of raw.values()) {
      const rank = rankOf.get(t.team) || size;
      const attH = t.hMp
        ? (t.hGf + K * avgHG) / (t.hMp + K)
        : (t.mp ? (t.gf + K * ((avgHG + avgAG) / 2)) / (t.mp + K) : avgHG);
      const attA = t.aMp
        ? (t.aGf + K * avgAG) / (t.aMp + K)
        : (t.mp ? (t.gf + K * ((avgHG + avgAG) / 2)) / (t.mp + K) : avgAG);
      const defH = t.hMp
        ? (t.hGa + K * avgAG) / (t.hMp + K)
        : (t.mp ? (t.ga + K * ((avgHG + avgAG) / 2)) / (t.mp + K) : avgAG);
      const defA = t.aMp
        ? (t.aGa + K * avgHG) / (t.aMp + K)
        : (t.mp ? (t.ga + K * ((avgHG + avgAG) / 2)) / (t.mp + K) : avgHG);

      // attack/defense strength vs league (used for context)
      const attStrength = (attH + attA) / 2 / ((avgHG + avgAG) / 2);
      const defStrength = (defH + defA) / 2 / ((avgHG + avgAG) / 2); // >1 = worse defense

      // form last 5 (most recent last) — filled in second pass
      const last5 = t.games.slice(-5);

      teams.set(t.team, {
        team: t.team,
        rank, size,
        mp: t.mp, hMp: t.hMp, aMp: t.aMp,
        gf: t.gf, ga: t.ga, pts: t.pts,
        hGf: t.hGf, hGa: t.hGa, aGf: t.aGf, aGa: t.aGa,
        // venue-split expected goals rates (shrunk)
        attH, attA, defH, defA,
        attStrength, defStrength,
        // empirical
        o25Rate: t.mp ? t.o25 / t.mp : league.o25,
        scoredRate: t.mp ? t.scored / t.mp : 0.5,
        bttsRate: t.mp ? t.btts / t.mp : league.btts,
        // form (filled properly)
        formGf: 0, formGa: 0, last5: last5.map((g) => ({
          gf: g.home ? g.fh : g.fa,
          ga: g.home ? g.fa : g.fh,
          total: g.total, home: g.home, opp: g.opp, date: g.date,
        })),
      });
    }

    // second pass form
    for (const t of teams.values()) {
      let gf = 0, ga = 0;
      for (const g of t.last5) { gf += g.gf; ga += g.ga; }
      const k = t.last5.length || 1;
      t.formGf = gf / k;
      t.formGa = ga / k;
      t.formN = t.last5.length;
    }

    return { league, teams, rankOrder: table.map((t) => t.team), size };
  }

  /* ---------- corner models ---------- */

  /**
   * Build per-league corner summary from finished matches.
   * Uses home_corners / away_corners columns from the results CSV.
   */
  function buildCornerLeague(matches) {
    const n = matches.length;
    if (!n) return null;
    let sumHomeCorners = 0, sumAwayCorners = 0;
    let over75 = 0, over85 = 0;
    for (const m of matches) {
      const hc = m.home_corners != null ? m.home_corners : (m.cornersH != null ? m.cornersH : null);
      const ac = m.away_corners != null ? m.away_corners : (m.cornersA != null ? m.cornersA : null);
      if (hc == null || ac == null) continue;
      sumHomeCorners += hc;
      sumAwayCorners += ac;
      const total = hc + ac;
      if (total >= 8) over75++;
      if (total >= 9) over85++;
    }
    const actualN = matches.filter(m => m.home_corners != null && m.away_corners != null).length;
    if (!actualN) return null;
    return {
      n: actualN,
      avgHomeCorners: sumHomeCorners / actualN,
      avgAwayCorners: sumAwayCorners / actualN,
      avgTotalCorners: (sumHomeCorners + sumAwayCorners) / actualN,
      o75Rate: over75 / actualN,
      o85Rate: over85 / actualN,
    };
  }

  /**
   * Build per-team corner models from finished matches.
   * Returns Map: team name -> { mp, hMp, aMp, attCornerH, attCornerA,
   *   defCornerH, defCornerA, o75Rate, o85Rate, mp }
   */
  function buildCornerModels(matches) {
    const raw = new Map();
    function side(name) {
      if (!raw.has(name)) {
        raw.set(name, {
          team: name,
          hMp: 0, hCornersFor: 0, hCornersAgainst: 0,
          aMp: 0, aCornersFor: 0, aCornersAgainst: 0,
          mp: 0, cornersFor: 0, cornersAgainst: 0,
          o75: 0, o85: 0,
        });
      }
      return raw.get(name);
    }

    for (const m of matches) {
      const hc = m.home_corners != null ? m.home_corners : null;
      const ac = m.away_corners != null ? m.away_corners : null;
      if (hc == null || ac == null) continue;

      const H = side(m.home);
      const A = side(m.away);
      H.hMp++; A.aMp++;
      H.hCornersFor += hc; H.hCornersAgainst += ac;
      A.aCornersFor += ac; A.aCornersAgainst += hc;
      H.mp++; A.mp++;
      H.cornersFor += hc; H.cornersAgainst += ac;
      A.cornersFor += ac; A.cornersAgainst += hc;
      const total = hc + ac;
      if (total >= 8) { H.o75++; A.o75++; }
      if (total >= 9) { H.o85++; A.o85++; }
    }

    // league means for shrinkage
    let sumHFor = 0, sumHAgainst = 0, sumAMp = 0;
    for (const t of raw.values()) {
      sumHFor += t.hCornersFor; sumHAgainst += t.hCornersAgainst;
      sumAMp += t.aMp;
    }
    const leagueHomeFor = sumHFor / Math.max(raw.size, 1);
    const leagueHomeAgainst = sumHAgainst / Math.max(raw.size, 1);
    const leagueAwayFor = raw.size ? Array.from(raw.values()).reduce((s, t) => s + t.aCornersFor, 0) / Math.max(raw.size, 1) : 0;
    const leagueAwayAgainst = raw.size ? Array.from(raw.values()).reduce((s, t) => s + t.aCornersAgainst, 0) / Math.max(raw.size, 1) : 0;

    const K = 4;
    const teams = new Map();
    for (const t of raw.values()) {
      const attCornerH = t.hMp ? (t.hCornersFor + K * leagueHomeFor) / (t.hMp + K) : leagueHomeFor;
      const attCornerA = t.aMp ? (t.aCornersFor + K * leagueAwayFor) / (t.aMp + K) : leagueAwayFor;
      const defCornerH = t.hMp ? (t.hCornersAgainst + K * leagueHomeAgainst) / (t.hMp + K) : leagueHomeAgainst;
      const defCornerA = t.aMp ? (t.aCornersAgainst + K * leagueAwayAgainst) / (t.aMp + K) : leagueAwayAgainst;

      teams.set(t.team, {
        team: t.team,
        mp: t.mp, hMp: t.hMp, aMp: t.aMp,
        attCornerH, attCornerA, defCornerH, defCornerA,
        o75Rate: t.mp ? t.o75 / t.mp : 0,
        o85Rate: t.mp ? t.o85 / t.mp : 0,
      });
    }
    return teams;
  }

  /* ---------- match prediction ---------- */

  /**
   * Predict one fixture. Returns null if either team model missing.
   *
   * Context rules (user brief):
   * - Both teams bottom-ish AND weak attacks → dampen totals (even if both concede).
   * - Both teams top-ish OR both attacks above average → mild open-game lift.
   * - Clear mismatch (big strength gap) → underdog attack dampened (bus-parking).
   * - Near-equal mid/top strength → small competitive lift on goals.
   */
  function predictMatch(model, homeName, awayName) {
    const home = model.teams.get(homeName);
    const away = model.teams.get(awayName);
    if (!home || !away) return null;
    const L = model.league;

    // multiplicative Poisson means: venue attack rate × opponent venue defense vs league venue mean
    // home concedes on average avgAG per game; away concedes on average avgHG per game
    let xgH = home.attH * (away.defA / Math.max(L.avgHG, 0.2));
    let xgA = away.attA * (home.defH / Math.max(L.avgAG, 0.2));

    // base rate floor/ceiling
    xgH = clamp(xgH, 0.15, 4.8);
    xgA = clamp(xgA, 0.12, 4.5);

    // form blend: recent scoring vs season rate (weight grows with form sample)
    const fw = 0.25;
    const safeDiv = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : null);
    if (home.formN >= 2 && home.mp > 0) {
      const seasonHf = home.hMp > 0 ? safeDiv(home.hGf, home.hMp) : safeDiv(home.gf, home.mp);
      if (seasonHf) xgH *= (1 - fw) + fw * clamp(home.formGf / Math.max(seasonHf, 0.2), 0.6, 1.5);
      const seasonHa = home.hMp > 0 ? safeDiv(home.hGa, home.hMp) : safeDiv(home.ga, home.mp);
      if (seasonHa) xgA *= (1 - fw * 0.5) + fw * 0.5 * clamp(home.formGa / Math.max(seasonHa, 0.2), 0.6, 1.5);
    }
    if (away.formN >= 2 && away.mp > 0) {
      const seasonAf = away.aMp > 0 ? safeDiv(away.aGf, away.aMp) : safeDiv(away.gf, away.mp);
      if (seasonAf) xgA *= (1 - fw) + fw * clamp(away.formGf / Math.max(seasonAf, 0.2), 0.6, 1.5);
      const seasonAa = away.aMp > 0 ? safeDiv(away.aGa, away.aMp) : safeDiv(away.ga, away.mp);
      if (seasonAa) xgH *= (1 - fw * 0.5) + fw * 0.5 * clamp(away.formGa / Math.max(seasonAa, 0.2), 0.6, 1.5);
    }

    // position context
    const n = model.size || 1;
    const homeBottom = home.rank > n * 0.55;
    const awayBottom = away.rank > n * 0.55;
    const homeTop = home.rank <= Math.max(3, n * 0.3);
    const awayTop = away.rank <= Math.max(3, n * 0.3);
    const weakAtt = (t) => t.attStrength < 0.92 || t.scoredRate < 0.45;
    const strongAtt = (t) => t.attStrength > 1.08 || t.scoredRate > 0.62;
    const gap = Math.abs(home.attStrength - away.attStrength);
    const rankGap = Math.abs(home.rank - away.rank);
    const nearEqual = gap < 0.12 && rankGap <= Math.max(2, n * 0.2);

    // 1) bottom scrap: both low in table AND neither can score
    if (homeBottom && awayBottom && weakAtt(home) && weakAtt(away)) {
      xgH *= 0.86;
      xgA *= 0.86;
    }
    // 2) both scoring sides (top or strong attacks) — open game
    else if ((homeTop && awayTop) || (strongAtt(home) && strongAtt(away))) {
      xgH *= 1.07;
      xgA *= 1.07;
    }
    // 3) mismatch: strong side expected to control; underdog shrinks
    else if (gap > 0.28) {
      if (home.attStrength > away.attStrength) {
        xgA *= 0.9; // away underdog parks bus slightly
        xgH *= 1.04;
      } else {
        xgH *= 0.9;
        xgA *= 1.04;
      }
    }
    // 4) equal strength matchup — competitive, goals slightly up
    if (nearEqual) {
      xgH *= 1.03;
      xgA *= 1.03;
    }

    if (!Number.isFinite(xgH)) xgH = L.avgHG;
    if (!Number.isFinite(xgA)) xgA = L.avgAG;
    xgH = clamp(xgH, 0.12, 5.2);
    xgA = clamp(xgA, 0.1, 4.8);

    const xgT = xgH + xgA;

    // Poisson lines
    const po = {
      o15: poissonAtLeast(2, xgT),
      o25: poissonAtLeast(3, xgT),
      o35: poissonAtLeast(4, xgT),
      btts: (1 - poissonPmf(0, xgH)) * (1 - poissonPmf(0, xgA)),
      h2: poissonAtLeast(2, xgH),
      a2: poissonAtLeast(2, xgA),
    };

    // blend with empirical rates (league-prior weighted by sample)
    const wTeam = clamp((Math.min(home.mp, away.mp) - 2) / 10, 0, 0.35);
    const emp = {
      o25: (1 - wTeam) * L.o25 + wTeam * (home.o25Rate + away.o25Rate) / 2,
      btts: (1 - wTeam) * L.btts + wTeam * (home.bttsRate + away.bttsRate) / 2,
    };
    const o25 = clamp(0.72 * po.o25 + 0.28 * emp.o25, 0.02, 0.97);
    const btts = clamp(0.72 * po.btts + 0.28 * emp.btts, 0.02, 0.97);

    // re-derive O15/O35 lightly pulled toward league history
    const o15 = clamp(0.8 * po.o15 + 0.2 * clamp(L.o25 + (L.o15 - L.o25), 0, 1), 0.05, 0.98);
    const o35 = clamp(0.8 * po.o35 + 0.2 * (L.o35 * (po.o25 / Math.max(L.o25, 0.05))), 0.01, 0.9);

    const score = bestScore(xgH, xgA);

    // confidence: sample + agreement of signals
    const mpMin = Math.min(home.mp, away.mp);
    const sample = clamp(mpMin / 10, 0.2, 1);
    const agree = 1 - Math.abs(po.o25 - o25); // blended close to pure
    const confidence = clamp(0.45 * sample + 0.35 * agree + 0.2 * (1 - Math.abs(xgT - 2.7) / 4), 0.2, 0.98);

    // tip: strongest market at threshold
    const markets = [
      { key: "o15", label: "O1.5", p: o15 },
      { key: "o25", label: "O2.5", p: o25 },
      { key: "o35", label: "O3.5", p: o35 },
      { key: "btts", label: "BTTS", p: btts },
      { key: "h2", label: "H2+", p: po.h2 },
      { key: "a2", label: "A2+", p: po.a2 },
    ].sort((a, b) => b.p - a.p);

    return {
      home: homeName, away: awayName,
      xgH: Math.round(xgH * 100) / 100,
      xgA: Math.round(xgA * 100) / 100,
      xgT: Math.round(xgT * 100) / 100,
      score,
      o15: pct1(o15), o25: pct1(o25), o35: pct1(o35),
      btts: pct1(btts),
      h2: pct1(po.h2), a2: pct1(po.a2),
      markets,
      tip: markets[0],
      confidence: Math.round(confidence * 100),
      homeRank: home.rank, awayRank: away.rank,
      homeMp: home.mp, awayMp: away.mp,
      // explainability crumbs
      context: contextLabel({ homeBottom, awayBottom, homeTop, awayTop, gap, nearEqual, weakAttH: weakAtt(home), weakAttA: weakAtt(away), strongH: strongAtt(home), strongA: strongAtt(away) }),
    };
  }

  function contextLabel(c) {
    if (c.homeBottom && c.awayBottom && c.weakAttH && c.weakAttA) return "bottom scrap · dampened";
    if ((c.homeTop && c.awayTop) || (c.strongH && c.strongA)) return "open · scoring sides";
    if (c.gap > 0.28) return "mismatch · bus factor";
    if (c.nearEqual) return "even matchup";
    return "baseline";
  }

  const pct1 = (p) => Math.round(p * 1000) / 10;

  return { buildLeague, predictMatch, poissonAtLeast, poissonPmf, bestScore, clamp,
           buildCornerLeague, buildCornerModels, predictCorners };
})();

// expose predictCorners for the corner page
Predict.predictCorners = predictCorners;

window.Predict = Predict;
