/* ==========================================================================
   Tidemark engine: pure functions over the dataset, no DOM access.
   trace(heuristic) replays every transfer in time order and works out how
   much of each one carries stolen value; risk(id, trace) explains a score.
   ========================================================================== */
'use strict';

const Engine = (() => {
  /* Kinds of node. `role` decides how value moves through them:
     wallet   – holds a balance; outflows draw on it using the heuristic
     service  – passes value through; outputs inherit taint from linked inputs
     terminal – custodial or obfuscating; tracing stops and value is counted
     source   – the victim; only the theft transfer is traced
     cluster  – summary of unrelated counterparties; never traced          */
  const KINDS = {
    victim:    { label: 'Victim',                 role: 'source',   sev: 0 },
    theft:     { label: 'Exploiter',              role: 'wallet',   sev: 1 },
    wallet:    { label: 'Wallet',                 role: 'wallet',   sev: 0 },
    dex:       { label: 'DEX',                    role: 'service',  sev: 0.02 },
    bridge:    { label: 'Bridge',                 role: 'service',  sev: 0.02 },
    nokyc:     { label: 'No-KYC swap',            role: 'service',  sev: 0.6, noun: 'a no-KYC swap service' },
    mixer:     { label: 'Mixer',                  role: 'terminal', sev: 0.8, outcome: 'mixer', noun: 'a mixer' },
    exchange:  { label: 'Exchange',               role: 'terminal', sev: 0.05, outcome: 'vasp' },
    otc:       { label: 'OTC desk',               role: 'terminal', sev: 0.3, outcome: 'vasp' },
    sanctions: { label: 'Sanctioned exchange',    role: 'terminal', sev: 1, outcome: 'sanctioned', noun: 'a sanctioned exchange' },
    cluster:   { label: 'Other counterparties',   role: 'cluster',  sev: 0 },
  };

  /* Categories that count as direct exposure when a node sends to or
     receives from them. Theft is covered by the case trace itself. */
  const DIRECT = ['sanctions', 'mixer', 'nokyc'];
  const TAINT_WEIGHT = 0.95;

  const HEURISTICS = {
    haircut: { label: 'Haircut', blurb: 'Every outflow carries the wallet’s current share of stolen value. The usual default.' },
    fifo:    { label: 'FIFO',    blurb: 'Outflows spend the oldest deposits first, so clean money sent earlier leaves first.' },
    poison:  { label: 'Poison',  blurb: 'Once a wallet touches stolen value, everything it sends counts as stolen. Overstates.' },
  };

  const NODE = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const usdOf = (t) => t.amount * PRICES[t.asset];

  // Chronological order; ties keep dataset order (same-block legs stay in sequence).
  const SORTED = TRANSFERS
    .map((t, i) => ({ ...t, i, usd: usdOf(t) }))
    .sort((a, b) => a.ts - b.ts || a.i - b.i);
  const TX = Object.fromEntries(SORTED.map((t) => [t.id, t]));

  const IN = Object.fromEntries(NODES.map((n) => [n.id, []]));
  const OUT = Object.fromEntries(NODES.map((n) => [n.id, []]));
  for (const t of SORTED) { OUT[t.from].push(t); IN[t.to].push(t); }

  const roleOf = (id) => KINDS[NODE[id].kind].role;
  const openingUsd = (n) => (n.opening ? n.opening.amount * PRICES[n.opening.asset] : 0);
  const EPS = 1e-9;

  /* One wallet ledger per heuristic. deposit(usd, f) adds value whose
     stolen share is f; withdraw(usd) removes value and returns the stolen
     share of what left. */
  function ledger(heuristic) {
    if (heuristic === 'fifo') {
      const lots = [];
      return {
        deposit(usd, f) { lots.push({ usd, f }); },
        withdraw(usd) {
          let need = usd; let stolen = 0;
          while (need > EPS && lots.length) {
            const lot = lots[0]; const take = Math.min(lot.usd, need);
            stolen += take * lot.f; lot.usd -= take; need -= take;
            if (lot.usd <= EPS) lots.shift();
          }
          return usd > 0 ? stolen / usd : 0;
        },
        balance: () => lots.reduce((s, l) => s + l.usd, 0),
        stolen: () => lots.reduce((s, l) => s + l.usd * l.f, 0),
      };
    }
    if (heuristic === 'poison') {
      let bal = 0; let poisoned = false;
      return {
        deposit(usd, f) { bal += usd; if (f > 0) poisoned = true; },
        withdraw(usd) { bal -= usd; return poisoned ? 1 : 0; },
        balance: () => bal,
        stolen: () => (poisoned ? Math.max(0, bal) : 0),
      };
    }
    let bal = 0; let stolen = 0; // haircut
    return {
      deposit(usd, f) { bal += usd; stolen += usd * f; },
      withdraw(usd) {
        if (bal <= EPS) { bal -= usd; return 0; }
        const f = Math.min(1, stolen / bal);
        const covered = Math.min(usd, bal);
        stolen -= covered * f; bal -= usd;
        return usd > 0 ? (covered * f) / usd : 0;
      },
      balance: () => bal,
      stolen: () => Math.max(0, stolen),
    };
  }

  /* `until` replays only transfers up to that time, so the same code answers
     "where was the money at time t" for the replay. */
  function trace(heuristic = 'haircut', until = Infinity) {
    const wallets = new Map();
    const walletOf = (id) => {
      let w = wallets.get(id);
      if (!w) {
        w = ledger(heuristic); wallets.set(id, w);
        const open = openingUsd(NODE[id]); if (open) w.deposit(open, 0);
      }
      return w;
    };
    const frac = new Map(); const tainted = new Map();
    const inAgg = new Map(); const outAgg = new Map();
    const bump = (m, id, usd, v) => {
      const a = m.get(id) || { usd: 0, tainted: 0 }; a.usd += usd; a.tainted += v; m.set(id, a);
    };
    let stolen = 0;

    for (const t of SORTED) {
      if (t.ts > until) break;
      let f = 0;
      const role = roleOf(t.from);
      if (t.theft) { f = 1; stolen += t.usd; }
      else if (role === 'wallet') f = walletOf(t.from).withdraw(t.usd);
      else if (role === 'service') {
        f = t.link ? (frac.get(t.link) || 0) : 0;
        if (heuristic === 'poison' && f > 0) f = 1;
      }
      frac.set(t.id, f); tainted.set(t.id, f * t.usd);
      bump(outAgg, t.from, t.usd, f * t.usd);
      bump(inAgg, t.to, t.usd, f * t.usd);
      if (roleOf(t.to) === 'wallet') walletOf(t.to).deposit(t.usd, f);
    }

    const balance = new Map(); const residual = new Map();
    for (const n of NODES) {
      if (roleOf(n.id) !== 'wallet') continue;
      const w = walletOf(n.id);
      balance.set(n.id, w.balance()); residual.set(n.id, w.stolen());
    }

    const hops = hopDistances(tainted);
    const outcomes = { wallets: 0, vasp: 0, sanctioned: 0, mixer: 0, fees: 0 };
    const destinations = [];
    for (const n of NODES) {
      const role = roleOf(n.id);
      if (role === 'terminal') {
        const v = inAgg.get(n.id)?.tainted || 0;
        if (v > EPS) {
          const outcome = KINDS[n.kind].outcome;
          outcomes[outcome] += v;
          destinations.push({ id: n.id, outcome, tainted: v, hops: hops.get(n.id) });
        }
      } else if (role === 'service') {
        const fee = (inAgg.get(n.id)?.tainted || 0) - (outAgg.get(n.id)?.tainted || 0);
        if (fee > EPS) outcomes.fees += fee;
      } else if (role === 'wallet') {
        const v = residual.get(n.id) || 0;
        if (v > 0.005) {
          outcomes.wallets += v;
          destinations.push({ id: n.id, outcome: 'wallets', tainted: v, hops: hops.get(n.id) });
        }
      }
    }
    const order = { vasp: 0, sanctioned: 1, mixer: 2, wallets: 3 };
    destinations.sort((a, b) => order[a.outcome] - order[b.outcome] || b.tainted - a.tainted);
    const total = Object.values(outcomes).reduce((s, v) => s + v, 0);

    return { heuristic, stolen, frac, tainted, inAgg, outAgg, balance, residual, hops, outcomes, total, destinations };
  }

  /* Shortest number of hops from the exploiter along transfers carrying
     stolen value. Used for display only. */
  function hopDistances(tainted) {
    const dist = new Map([[CASE.root, 0]]); const queue = [CASE.root];
    while (queue.length) {
      const u = queue.shift();
      for (const t of OUT[u]) {
        if ((tainted.get(t.id) || 0) <= 0 || dist.has(t.to)) continue;
        dist.set(t.to, dist.get(u) + 1); queue.push(t.to);
      }
    }
    return dist;
  }

  /* Risk score: 1 − Π(1 − wᵢ) over independent factors, so each factor can
     only raise the score and the result stays within 0–100. */
  function risk(id, tr) {
    const n = NODE[id]; const kind = KINDS[n.kind];
    if (kind.role === 'cluster') return null;
    const factors = [];
    if (kind.sev > 0) factors.push({ key: 'entity', label: `Entity type: ${kind.label}`, share: 1, weight: kind.sev });

    const inA = tr.inAgg.get(id) || { usd: 0, tainted: 0 };
    const received = inA.usd + openingUsd(n);
    const taintShare = n.kind === 'victim' || received <= 0 ? 0 : Math.min(1, inA.tainted / received);
    if (taintShare > 0.0005 && n.kind !== 'theft') {
      factors.push({ key: 'taint', label: 'Received value traced to the exploit', share: taintShare, weight: TAINT_WEIGHT * taintShare });
    }

    let inTot = 0; let outTot = 0; const inBy = {}; const outBy = {};
    for (const t of IN[id]) { inTot += t.usd; const c = NODE[t.from].kind; if (DIRECT.includes(c)) inBy[c] = (inBy[c] || 0) + t.usd; }
    for (const t of OUT[id]) { if (t.theft) continue; outTot += t.usd; const c = NODE[t.to].kind; if (DIRECT.includes(c)) outBy[c] = (outBy[c] || 0) + t.usd; }
    for (const c of DIRECT) {
      const si = inTot ? (inBy[c] || 0) / inTot : 0;
      const so = outTot ? (outBy[c] || 0) / outTot : 0;
      const share = Math.max(si, so);
      if (share > 0.0005 && n.kind !== c) {
        factors.push({ key: 'direct-' + c, label: `${so >= si ? 'Sent to' : 'Received from'} ${KINDS[c].noun}`, dir: so >= si ? 'out' : 'in', share, weight: KINDS[c].sev * share });
      }
    }
    const clean = factors.reduce((p, f) => p * (1 - f.weight), 1);
    const score = Math.round(100 * (1 - clean));
    const level = score >= 75 ? 'severe' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';
    return { score, level, factors, taintShare };
  }

  /* Where stolen value sat at time `at`, by outcome bucket: a truncated replay. */
  function moneyAt(tr, at) {
    return at === Infinity ? { ...tr.outcomes } : trace(tr.heuristic, at).outcomes;
  }

  /* The JSON a real `POST /v1/cases/:id/trace` would return. */
  function toTraceResult(tr, minUsd) {
    const edges = new Map();
    for (const t of SORTED) {
      const v = tr.tainted.get(t.id) || 0;
      if (v < Math.max(minUsd, 0.01)) continue;
      const key = t.from + '>' + t.to;
      const e = edges.get(key) || { from: t.from, to: t.to, usd: 0, taintedUsd: 0, transfers: 0 };
      e.usd += t.usd; e.taintedUsd += v; e.transfers += 1; edges.set(key, e);
    }
    const round = (v) => Math.round(v * 100) / 100;
    return {
      caseId: CASE.id,
      heuristic: tr.heuristic,
      minUsd,
      stolenUsd: round(tr.stolen),
      totals: Object.fromEntries(Object.entries(tr.outcomes).map(([k, v]) => [k, round(v)])),
      destinations: tr.destinations.map((d) => ({
        id: d.id, label: NODE[d.id].label || NODE[d.id].address, kind: NODE[d.id].kind,
        outcome: d.outcome, taintedUsd: round(d.tainted), hops: d.hops ?? null, chains: NODE[d.id].chains,
      })),
      edges: [...edges.values()].map((e) => ({ ...e, usd: round(e.usd), taintedUsd: round(e.taintedUsd) })),
      dataset: 'tidemark-demo (fictional)',
    };
  }

  /* Invariants checked on every page load and shown under the hood. */
  function selfTest() {
    const res = [];
    const check = (name, fn) => {
      try { const out = fn(); res.push({ name, pass: !!out.pass, detail: out.detail }); }
      catch (e) { res.push({ name, pass: false, detail: String(e && e.message || e) }); }
    };
    const money = (v) => '$' + Math.round(v).toLocaleString('en-US');
    const H = trace('haircut'); const F = trace('fifo'); const P = trace('poison');

    check('Haircut conserves stolen value', () => ({ pass: Math.abs(H.total - H.stolen) < 1, detail: `${money(H.total)} accounted for of ${money(H.stolen)}` }));
    check('FIFO conserves stolen value', () => ({ pass: Math.abs(F.total - F.stolen) < 1, detail: `${money(F.total)} accounted for of ${money(F.stolen)}` }));
    check('Poison overstates once clean funds mix in', () => ({ pass: P.total > P.stolen + 1, detail: `${money(P.total)} flagged, ${money(P.total - P.stolen)} more than was stolen` }));
    check('No wallet ever goes negative', () => {
      const worst = Math.min(...[H, F, P].flatMap((t) => [...t.balance.values()]));
      return { pass: worst > -0.01, detail: `lowest closing balance ${money(worst)}` };
    });
    check('Bridge release inherits its deposit’s taint', () => ({ pass: Math.abs(H.frac.get('a04') - H.frac.get('a03')) < 1e-12, detail: `${(H.frac.get('a04') * 100).toFixed(3)}% on both legs` }));
    check('FIFO spends the older clean deposit first', () => {
      const v = F.tainted.get('a09');
      return { pass: Math.abs(v - 50000 * F.frac.get('a08')) < 1, detail: `first outflow carries ${money(v)} of 450,000 USDT` };
    });
    check('Risk scores stay within 0–100', () => {
      const scores = NODES.map((n) => risk(n.id, H)).filter(Boolean).map((r) => r.score);
      return { pass: scores.every((s) => s >= 0 && s <= 100), detail: `${scores.length} nodes, max ${Math.max(...scores)}` };
    });
    check('Replay ends where the trace ends, for every method', () => {
      const last = SORTED[SORTED.length - 1].ts;
      let gap = 0;
      for (const t of [H, F, P]) {
        const at = moneyAt(t, last);
        for (const k of Object.keys(t.outcomes)) gap = Math.max(gap, Math.abs(at[k] - t.outcomes[k]));
      }
      return { pass: gap < 0.01, detail: `largest difference across buckets: ${money(gap)}` };
    });
    check('Tracing is deterministic', () => {
      const again = trace('haircut');
      return { pass: SORTED.every((t) => again.tainted.get(t.id) === H.tainted.get(t.id)), detail: `${SORTED.length} transfers replayed twice` };
    });
    return res;
  }

  return { KINDS, HEURISTICS, NODE, SORTED, TX, IN, OUT, roleOf, trace, risk, moneyAt, toTraceResult, selfTest, openingUsd };
})();
