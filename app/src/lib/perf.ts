// Performance section maths: headline figures, bars, cumulative trend, observations and
// recommendations for one official over the chosen period (ported from the prototype).
import type { Ctx } from '../ctx';
import { wavg } from './engine';
import { addDays, f1, fmtD, mTitle, MS, OPEN, parse, PERIODS, iso, pad } from './util';

export function personPerf(ctx: Ctx) {
  const { eng, data, vp, period, cFrom, cTo, P } = ctx, S = data, date = ctx.date;
  const { d, dim } = eng.parts(), mk = eng.mk();
  const [from, to] = eng.range(period, cFrom, cTo), pf = eng.perf(from, to, vp);
  const tableList = eng.tableList(P);
  const list = (period === 'month' ? tableList : pf.list.map(o => ({ ...o, th: eng.thr(o.min), gap: o.t - o.a }))).filter(o => !o.na);
  const overallN = wavg(list), overall = overallN || 0;
  const spanDays = Math.round((+parse(to) - +parse(from)) / 864e5) + 1;
  const prev = eng.perf(addDays(from, -spanDays), addDays(from, -1), vp);
  const delta = prev.overall !== null && pf.overall !== null ? Math.round((pf.overall - prev.overall) * 100) : null;
  const below = list.filter(o => o.pct < o.th).sort((a, b) => a.pct - b.pct);
  const showArrow = S.settings.highlightBelowMin;
  const bars = list.map(o => { const b = o.pct < o.th; return { name: o.name, pctLabel: Math.round(o.pct * 100) + '%', below: showArrow && b, w: (Math.min(o.pct, 1.5) / 1.5 * 100) + '%', minLeft: (Math.min(o.th, 1.5) / 1.5 * 100) + '%', color: b ? 'var(--color-accent-2)' : 'var(--color-accent)' }; });
  const tm = spanDays <= 62 ? 'd' : spanDays <= 731 ? 'm' : 'q';
  const keyOf = (dt: string) => tm === 'd' ? dt : tm === 'm' ? dt.slice(0, 7) : dt.slice(0, 4) + 'Q' + (Math.floor((+dt.slice(5, 7) - 1) / 3) + 1);
  const cum: Record<string, [number, number]> = {}, buckets: { key: string; v: number; end: string }[] = [];
  pf.daily.forEach(r => {
    Object.entries(r.k).forEach(([kid, [t, a]]) => { const c = cum[kid] || (cum[kid] = [0, 0]); c[0] += t; c[1] += a; });
    const vs = Object.values(cum).filter(c => c[0] > 0), v = vs.length ? vs.reduce((x, c) => x + Math.min(c[1] / c[0], 1), 0) / vs.length : 0;
    const key = keyOf(r.date), last = buckets[buckets.length - 1];
    if (last && last.key === key) { last.v = v; last.end = r.date; } else buckets.push({ key, v, end: r.date });
  });
  const step = Math.max(1, Math.ceil(buckets.length / 10));
  const trend = buckets.map((b, i) => {
    const lbl = tm === 'd' ? String(+b.key.slice(8)) + (b.key.slice(8) === '01' || i === 0 ? ' ' + MS[+b.key.slice(5, 7) - 1] : '') : tm === 'm' ? MS[+b.key.slice(5, 7) - 1] + (b.key.slice(5, 7) === '01' || i === 0 ? ' ' + b.key.slice(2, 4) : '') : b.key.slice(4) + ' ' + b.key.slice(2, 4);
    return { h: Math.max(b.v * 100, 0.8) + '%', label: i % step === 0 || i === buckets.length - 1 ? lbl : '', title: `${fmtD(b.end)}: ${Math.round(b.v * 100)}%`, color: i === buckets.length - 1 ? 'var(--color-accent-700)' : 'var(--color-accent)' };
  });
  const myKids = new Set<string>(); Object.values(S.months).forEach(mo => mo.people.forEach(p => { if (p.id === vp) p.kpis.forEach(k => myKids.add(k.id)); }));
  const mine = (en: { pid: string; kid: string }) => en.pid ? en.pid === vp : myKids.has(en.kid);
  const inRange = S.entries.filter(en => mine(en) && en.date >= from && en.date <= to);
  const activeDays = new Set(pf.daily.filter(r => Object.values(r.k).some(([, a]) => a)).map(r => r.date)).size;
  const todayIso = iso(new Date(ctx.nowTick)), subs = S.submissions[vp] || {};
  const dueDays: string[] = []; for (let c = from; c <= to && c <= todayIso; c = addDays(c, 1)) if (S.months[c.slice(0, 7)] && eng.isWork(c)) dueDays.push(c);
  const subIn = dueDays.filter(x => subs[x]).length, missIn = dueDays.filter(x => !subs[x] && x < todayIso).length;
  const naCount = tableList.filter(o => o.na).length;
  const notes: string[] = [];
  if (!list.length) notes.push('No KPI targets exist for this period yet.');
  else {
    const op = Math.round(overall * 100);
    notes.push(op >= 100 ? `Overall attainment is ${op}% — the 100% target is met.` : `Overall attainment is ${op}% against the 100% target, ${100 - op} points short.`);
    notes.push(below.length ? `${list.length - below.length} of ${list.length} KPIs are on track. ${below.length} need attention: ${below.slice(0, 3).map(o => `${o.name.trim()} (${Math.round(o.pct * 100)}%)`).join('; ')}${below.length > 3 ? ` and ${below.length - 3} more` : ''}.` : `All ${list.length} KPIs are at or above their threshold.`);
    const best = [...list].sort((a, b) => b.pct - a.pct)[0];
    if (best && best.pct > 0) notes.push(`Strongest result: ${best.name.trim()} at ${Math.round(best.pct * 100)}% of target.`);
    const zeros = list.filter(o => !o.a).length;
    if (zeros) notes.push(`${zeros} KPI${zeros > 1 ? 's have' : ' has'} no achievement logged yet in this period.`);
    if (delta !== null) notes.push(delta === 0 ? `Level with the previous ${spanDays}-day period on a pro-rated basis.` : `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta)} points versus the previous ${spanDays}-day period (pro-rated).`);
    if (period === 'month') {
      const left = dim - d, gapK = [...list].filter(o => o.gap > 0).sort((a, b) => (b.gap / (b.t || 1)) - (a.gap / (a.t || 1)))[0];
      if (gapK) notes.push(`${left} day${left === 1 ? '' : 's'} left in ${mTitle(mk)}. Largest open gap: ${gapK.name.trim()} — ${f1(gapK.gap)} ${gapK.uom} to go.`);
    }
    const ipR = inRange.filter(en => en.status === 'In progress');
    if (ipR.length) notes.push(`${ipR.length} activit${ipR.length === 1 ? 'y is' : 'ies are'} still in progress (${f1(ipR.reduce((a, en) => a + (+(en.qty as number) || 0), 0))} units not yet counted in the score).`);
    if (dueDays.length) notes.push(`Daily KPI submission made on ${subIn} of ${dueDays.length} working day${dueDays.length > 1 ? 's' : ''}${missIn ? ` — ${missIn} missed` : ''}.`);
    notes.push(`Achievement was recorded on ${activeDays} of ${spanDays} day${spanDays > 1 ? 's' : ''}; ${inRange.length} Daily Brief activit${inRange.length === 1 ? 'y' : 'ies'} logged.`);
  }
  if (naCount && period === 'month') notes.push(`${naCount} KPI${naCount > 1 ? 's are' : ' is'} not scored yet (not due, no entry or not applicable) and excluded from the score.`);
  const overdueMine = S.entries.filter(en => mine(en) && en.due && en.due < todayIso && OPEN(en.status || 'Completed'));
  if (overdueMine.length) notes.push(`${overdueMine.length} activit${overdueMine.length === 1 ? 'y is' : 'ies are'} past their due date and not completed.`);
  const pendMine = S.entries.filter(en => mine(en) && en.status === 'Pending approval');
  if (pendMine.length) notes.push(`${pendMine.length} completed item${pendMine.length === 1 ? ' is' : 's are'} waiting for management approval (not yet counted).`);
  const kmap = eng.kmapAll();
  const recs: string[] = [];
  if (list.length) {
    const left = period === 'month' ? dim - d : 0;
    below.slice(0, 3).forEach(o => {
      const g = Math.max(0, o.gap);
      recs.push(left > 0 && g > 0 ? `Prioritise ${o.name.trim()}: ${f1(g)} ${o.uom} still needed — about ${f1(g / left)} per day over the remaining ${left} days.` : `Close the gap on ${o.name.trim()} (${Math.round(o.pct * 100)}% of target) — agree a recovery plan and owner this week.`);
    });
    const zeros = list.filter(o => !o.a);
    if (zeros.length > 3) recs.push(`Start logging the ${zeros.length} KPIs with no entries yet — a 5-minute end-of-day update through the Daily Brief keeps the tracker accurate.`);
    if (spanDays > 3 && activeDays / spanDays < 0.5) recs.push(`Figures were logged on only ${activeDays} of ${spanDays} days — make daily entry a fixed routine so trends stay reliable.`);
    const weekly = below.filter(o => { const k = kmap[o.id]; return k && (k.freq === 'Weekly' || k.freq === 'Daily' || k.freq === 'Alternate days'); });
    if (weekly.length) recs.push(`Block fixed calendar slots for recurring KPIs (${weekly.slice(0, 2).map(o => o.name.trim()).join('; ')}) so they don't bunch up at month-end.`);
    if (delta !== null && delta < 0) recs.push(`Performance slipped ${Math.abs(delta)} points versus the previous period — review blockers in the next MIS meeting.`);
    const over = list.filter(o => o.pct >= 1.5);
    if (over.length) recs.push(`Review targets for ${over.slice(0, 2).map(o => o.name.trim()).join('; ')} — consistently above 150%, so the target may be too low.`);
    if (missIn) recs.push(`${missIn} daily submission${missIn > 1 ? 's were' : ' was'} missed — submit before ${S.remindAt || '18:00'} each day.`);
    const ipOld = inRange.filter(en => en.status === 'In progress' && en.date <= addDays(date, -3));
    if (ipOld.length) recs.push(`Follow up on ${ipOld.length} in-progress item${ipOld.length > 1 ? 's' : ''} older than 3 days — mark them Completed once done so the score reflects them.`);
    if (overdueMine.length) recs.push(`Clear ${overdueMine.length} overdue item${overdueMine.length > 1 ? 's' : ''} — update the status or agree a new due date with management.`);
    if (!below.length) recs.push('All KPIs are on track — hold the current pace and consider stretching targets next month.');
  } else recs.push('Set up KPIs for this period to get recommendations.');
  const stats = [
    { v: overallN === null ? '—' : Math.round(overall * 100) + '%', l: overallN === null ? 'No score available' : (S.settings.scoring === 'Equal weights' ? 'Attainment vs 100% target' : 'Weighted attainment vs 100% target') },
    { v: `${list.length - below.length}/${list.length}`, l: 'KPIs on track' },
    { v: delta === null ? '—' : (delta > 0 ? '+' : '') + delta + ' pts', l: 'vs previous period' },
    { v: dueDays.length ? `${subIn}/${dueDays.length}` : '—', l: 'Daily submissions made' },
    { v: String(inRange.length), l: 'Daily Brief activities' },
  ];
  const plabel = (PERIODS.find(p => p[0] === period) || ['', 'Custom'])[1];
  return { from, to, stats, bars, trend, notes, recs, trendUnit: tm === 'd' ? 'by day' : tm === 'm' ? 'by month' : 'by quarter', periodLabel: plabel + ' performance', rangeLabel: from === to ? fmtD(from) : `${fmtD(from)} – ${fmtD(to)}` };
}

export const monthDays = (mk: string, dim: number) => Array.from({ length: dim }, (_, j) => mk + '-' + pad(j + 1));
