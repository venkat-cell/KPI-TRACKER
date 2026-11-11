import type { Ctx } from '../ctx';
import { wavg } from '../lib/engine';
import { api } from '../lib/data';
import { fmtD, fmtShort, iso, mTitle, OPEN, pad, parse, PERIODS, shiftMonth } from '../lib/util';
import { Down, Icon, Legend, NotesRecs, PeriodButtons, Stat } from '../ui';

export default function Overview({ ctx }: { ctx: Ctx }) {
  const { eng, data, members, period, cFrom, cTo, date } = ctx, S = data;
  const { d, dim } = eng.parts(), mk = eng.mk(), mo = S.months[mk];
  const [from, to] = eng.range(period, cFrom, cTo);
  const todayIso = iso(new Date(ctx.nowTick)), showArrow = S.settings.highlightBelowMin;
  const dsMonth: string[] = []; for (let i = 1; i <= dim; i++) { const k = mk + '-' + pad(i); if (k <= todayIso && eng.isWork(k)) dsMonth.push(k); }
  const rows = members.map(u => {
    let lst: { name: string; pct: number; th: number; w: number }[];
    if (period === 'month') { const pe = mo && mo.people.find(p => p.id === u.id); lst = (pe ? pe.kpis : []).filter(k => +k.monthly && !k.na).map(k => { const c = eng.calc(k, d); return c.notDue ? null : { name: k.name, pct: c.K, th: eng.thr(k.min), w: eng.wOf(k) }; }).filter(Boolean) as typeof lst; }
    else lst = eng.perf(from, to, u.id).list.map(o => ({ name: o.name, pct: o.pct, th: eng.thr(o.min), w: o.w }));
    const n = lst.length, ov = wavg(lst), thAvg = n ? lst.reduce((x, o) => x + o.th, 0) / n : 0;
    const us = S.submissions[u.id] || {}, keys = Object.keys(us).sort();
    return { u, n, ov, thAvg, bel: lst.filter(o => o.pct < o.th).length, today: !!us[todayIso] || !eng.isWork(todayIso), subM: dsMonth.filter(k => us[k]).length,
      missM: dsMonth.filter(k => k < todayIso && !us[k]).length, last: keys[keys.length - 1], worst: [...lst].sort((a, b) => a.pct - b.pct)[0] };
  });
  const open = (id: string) => () => ctx.setView('person', id);
  const withK = rows.filter(x => x.ov !== null) as (typeof rows[number] & { ov: number })[];
  const team = withK.length ? withK.reduce((a, x) => a + x.ov, 0) / withK.length : 0;
  const onTrack = withK.filter(x => x.ov >= x.thAvg), noK = rows.filter(x => !x.n), pending = rows.filter(x => x.n && !x.today);
  const todayInMonth = todayIso.slice(0, 7) === mk;
  const tp = Math.round(team * 100), names = (a: typeof rows, k = 4) => a.slice(0, k).map(x => x.u.name).join(', ') + (a.length > k ? ` and ${a.length - k} more` : '');
  const bars = [...withK].sort((a, b) => b.ov - a.ov).map(x => { const dn = x.ov < x.thAvg; return { id: x.u.id, name: x.u.name, pctLabel: Math.round(x.ov * 100) + '%', below: showArrow && dn, w: Math.min(x.ov, 1) * 100 + '%', minLeft: Math.min(x.thAvg, 1) * 100 + '%', color: dn ? 'var(--color-accent-2)' : 'var(--color-accent)' }; });
  const notes: string[] = [], recs: string[] = [];
  if (!withK.length) notes.push(`No official has a scored KPI for ${mTitle(mk)} yet.`);
  else {
    notes.push(tp >= 100 ? `Team attainment is ${tp}% — the 100% target is met.` : `Team attainment is ${tp}% against the 100% target, ${100 - tp} points short.`);
    notes.push(`${onTrack.length} of ${withK.length} officials with KPIs are on track.`);
    const sorted = [...withK].sort((a, b) => b.ov - a.ov), top = sorted[0], low = sorted[sorted.length - 1];
    if (top && top.ov > 0) notes.push(`Top performer: ${top.u.name} at ${Math.round(top.ov * 100)}%.`);
    if (low && sorted.length > 1) notes.push(`Lowest: ${low.u.name} at ${Math.round(low.ov * 100)}%${low.worst ? ` — weakest KPI is ${low.worst.name.trim()} (${Math.round(low.worst.pct * 100)}%)` : ''}.`);
  }
  if (noK.length) notes.push(`${noK.length} official${noK.length > 1 ? 's have' : ' has'} no scored KPIs for ${mTitle(mk)}: ${names(noK)}.`);
  if (todayInMonth && pending.length) notes.push(`${pending.length} official${pending.length > 1 ? 's have' : ' has'} not submitted today: ${names(pending)}.`);
  const missT = withK.reduce((a, x) => a + x.missM, 0);
  if (missT) notes.push(`${missT} daily submission${missT > 1 ? 's' : ''} missed across the team this month.`);
  [...withK].filter(x => x.ov < x.thAvg).sort((a, b) => a.ov - b.ov).slice(0, 3).forEach(x =>
    recs.push(`Review ${x.u.name}'s plan — ${Math.round(x.ov * 100)}% with ${x.bel} KPI${x.bel === 1 ? '' : 's'} below threshold${x.worst ? `; start with ${x.worst.name.trim()}` : ''}.`));
  if (noK.length) recs.push(`Define KPIs for ${noK.length} official${noK.length > 1 ? 's' : ''} (${names(noK, 3)}) — choose them under “View an official”, then Edit KPIs.`);
  if (todayInMonth && pending.length) recs.push(`Remind the ${pending.length} official${pending.length > 1 ? 's' : ''} yet to submit today before the ${S.remindAt || '18:00'} cut-off.`);
  const worstSub = [...withK].sort((a, b) => b.missM - a.missM)[0];
  if (worstSub && worstSub.missM >= 2) recs.push(`${worstSub.u.name} has missed ${worstSub.missM} submissions this month — agree a fixed daily update time.`);
  const topR = [...withK].sort((a, b) => b.ov - a.ov)[0];
  if (topR && topR.ov >= topR.thAvg && topR.ov > 0) recs.push(`Recognise ${topR.u.name} (${Math.round(topR.ov * 100)}%) in the next review meeting.`);
  if (!recs.length) recs.push('The team is on track — hold the current pace.');

  // critical action list: overdue, pending approval or blocked Daily Brief items
  const km = eng.kmapAll(), uname = (id: string) => S.people.find(u => u.id === id)?.name || '—';
  const crit = S.entries.filter(en => OPEN(en.status || 'Completed')).map(en => {
    const st = en.status, k = km[en.kid], od = !!en.due && en.due < todayIso;
    const issue = st === 'Pending approval' ? 'Pending approval' : od ? 'Overdue' : en.blocker ? 'Blocked' : '';
    if (!issue) return null;
    const sev = od ? 'High' : 'Medium';
    return { en, sortKey: (sev === 'High' ? '0' : '1') + (en.due || '9999'), sev, issue: od && st === 'Pending approval' ? 'Pending approval · overdue' : issue, official: uname(en.pid), kpi: en.kid === '__other' ? 'Others' : (k?.name || '(deleted KPI)').trim(),
      activity: `${en.activity || '—'} · ${en.qty ?? ''} ${k?.uom || ''} · ${st}`, due: en.due ? fmtShort(en.due) : '—', delay: od ? Math.round((+parse(todayIso) - +parse(en.due)) / 864e5) + ' days' : '—',
      next: [en.blocker ? 'Blocker: ' + en.blocker : '', en.next ? 'Next: ' + en.next : ''].filter(Boolean).join('\n') || '—' };
  }).filter(<T,>(x: T | null): x is T => !!x).sort((a, b) => a.sortKey < b.sortKey ? -1 : 1);
  const setStatus = async (id: string, v: string) => { try { await api.setEntryStatus(id, v); ctx.audit(v === 'Completed' ? 'Approved' : 'Rejected', 'From critical action list'); await ctx.reload(); } catch (e) { ctx.toast((e as Error).message, true); } };

  const stats = [
    { v: withK.length ? tp + '%' : '—', l: 'Team attainment (average of officials)' },
    { v: `${onTrack.length}/${withK.length}`, l: 'Officials on track' },
    { v: `${rows.filter(x => x.today).length}/${members.length}`, l: 'Submitted today' },
    { v: String(withK.reduce((a, x) => a + x.bel, 0)), l: 'KPIs below threshold' },
    { v: String(crit.length), l: 'Open critical actions' },
  ];
  const plabel = (PERIODS.find(p => p[0] === period) || ['', 'Custom'])[1];
  const days = Array.from({ length: dim }, (_, j) => mk + '-' + pad(j + 1));

  return (
    <section className="col" style={{ gap: 'var(--space-6)' }}>
      <header className="col" style={{ gap: 'var(--space-2)' }}>
        <div className="kicker">Pillars KPI Monitoring · Management</div>
        <div className="row">
          <h1 className="h1">Overall KPI progress</h1>
          <div data-noprint="1" style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <button className="btn btn-ghost btn-icon" onClick={() => ctx.goTo(shiftMonth(mk, -1))} title="Previous month"><Icon n="caret-left" /></button>
            <button className="btn btn-ghost btn-icon" onClick={() => ctx.goTo(shiftMonth(mk, 1))} title="Next month"><Icon n="caret-right" /></button>
          </div>
        </div>
        <div className="rail">
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><span style={{ fontStyle: 'italic' }}>Report date</span><input className="input" type="date" value={date} onChange={e => ctx.setDate(e.target.value)} style={{ width: 'auto', minHeight: 36, padding: '3px 8px' }} /></label>
          <span>{plabel} performance · {from === to ? fmtD(from) : `${fmtD(from)} – ${fmtD(to)}`}</span>
          <span>{members.length} officials</span>
        </div>
      </header>
      <div data-noprint="1" className="row" style={{ gap: 'var(--space-2)' }}>
        <PeriodButtons periods={PERIODS} period={period} onPick={id => { ctx.setPeriod(id); if (id === 'custom' && !cFrom) ctx.setCustom(from, to); }} />
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={() => window.print()}><Icon n="file-pdf" />Download PDF</button>
      </div>
      {period === 'custom' && <div data-noprint="1" className="row" style={{ alignItems: 'end' }}>
        <div className="field"><label>From</label><input className="input" type="date" value={cFrom || from} onChange={e => ctx.setCustom(e.target.value, cTo || to)} /></div>
        <div className="field"><label>To</label><input className="input" type="date" value={cTo || to} onChange={e => ctx.setCustom(cFrom || from, e.target.value)} /></div>
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 'var(--space-5)', maxWidth: 1100 }}>{stats.map(s => <Stat key={s.l} {...s} />)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 'var(--space-8)' }}>
        <div className="col" style={{ gap: 'var(--space-3)' }}>
          <h3 className="h3">Attainment by official</h3>
          <Legend items={[['var(--color-accent)', 'On track'], ['var(--color-accent-2)', 'Below threshold'], ['line', 'Their threshold']]} />
          <div className="col" style={{ gap: 'var(--space-3)' }}>
            {bars.map(b => (
              <div key={b.id} onClick={open(b.id)} title={'Open ' + b.name} className="col" style={{ gap: 4, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', fontSize: 14, lineHeight: 1.35 }}><span style={{ fontWeight: 600 }}>{b.name}</span><span style={{ fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2 }}>{b.below && <Down />}{b.pctLabel}</span></div>
                <div style={{ position: 'relative', height: 16, background: 'var(--color-neutral-100)' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: b.w, background: b.color }} />
                  <div style={{ position: 'absolute', top: -3, bottom: -3, left: b.minLeft, width: 2, background: '#000' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', height: 16, fontSize: 11 }}><span style={{ position: 'absolute', left: 0 }}>0%</span><span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>50%</span><span style={{ position: 'absolute', right: 0 }}>100%</span></div>
        </div>
        <div className="col" style={{ gap: 'var(--space-5)' }}><NotesRecs notes={notes} recs={recs} /></div>
      </div>

      <div className="col" style={{ gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 'var(--space-2) var(--space-4)' }}><h3 className="h3">Critical action list</h3><span style={{ fontSize: 14 }}>Overdue work, items waiting for approval and reported blockers, across all officials.</span></div>
        {!crit.length && <p style={{ margin: 0, fontSize: 16 }}>Nothing overdue, pending approval or blocked.</p>}
        {!!crit.length && <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 1000, color: '#000' }}>
            <thead><tr><th style={{ width: 80 }}>Severity</th><th style={{ width: 130 }}>Issue</th><th style={{ width: 130 }}>Official</th><th>KPI / activity</th><th style={{ width: 90 }}>Due</th><th style={{ width: 70, textAlign: 'right' }}>Delay</th><th style={{ width: 200 }}>Next action / blocker</th><th data-noprint="1" style={{ width: 170 }} /></tr></thead>
            <tbody>
              {crit.map(cr => (
                <tr key={cr.en.id}>
                  <td><span style={{ display: 'inline-block', padding: '2px 8px', fontSize: 12, fontWeight: 600, background: cr.sev === 'High' ? 'var(--color-accent-2-200)' : 'var(--color-accent-100)' }}>{cr.sev}</span></td>
                  <td style={{ fontWeight: 600 }}>{cr.issue}</td><td>{cr.official}</td>
                  <td><div style={{ fontWeight: 600 }}>{cr.kpi}</div><div style={{ fontSize: 13 }}>{cr.activity}</div></td>
                  <td>{cr.due}</td><td style={{ textAlign: 'right' }}>{cr.delay}</td><td style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{cr.next}</td>
                  <td data-noprint="1"><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {cr.en.status === 'Pending approval' && <><button className="btn btn-primary" onClick={() => setStatus(cr.en.id, 'Completed')} style={{ padding: '4px 10px', fontSize: 13 }}>Approve</button><button className="btn btn-secondary" onClick={() => setStatus(cr.en.id, 'Rejected')} style={{ padding: '4px 10px', fontSize: 13 }}>Reject</button></>}
                    <button className="btn btn-ghost" onClick={() => ctx.setView('brief', cr.en.pid)} style={{ padding: '4px 8px', fontSize: 13 }}>Open</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>

      <div className="col" style={{ gap: 'var(--space-3)' }}>
        <h3 className="h3">All officials</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 920, color: '#000' }}>
            <thead><tr><th style={{ width: 56 }}>S.No</th><th>Official</th><th>Designation</th><th style={{ width: 60, textAlign: 'right' }}>KPIs</th><th style={{ width: 110, textAlign: 'right' }}>Attainment</th><th style={{ width: 80, textAlign: 'right' }}>Below</th><th style={{ width: 70 }}>Today</th><th style={{ width: 110 }}>Submissions</th><th style={{ width: 110 }}>Last submitted</th><th data-noprint="1" style={{ width: 90 }} /></tr></thead>
            <tbody>
              {rows.map(x => { const dn = x.ov !== null && x.ov < x.thAvg; return (
                <tr key={x.u.id}>
                  <td>{x.u.sno}</td><td style={{ fontWeight: 600 }}>{x.u.name}</td><td style={{ whiteSpace: 'pre-line' }}>{x.u.designation || '—'}</td><td style={{ textAlign: 'right' }}>{x.n}</td>
                  <td style={{ textAlign: 'right', background: showArrow && dn ? 'var(--color-accent-2-100)' : 'transparent' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontWeight: 600 }}>{showArrow && dn && <Down />}{x.ov === null ? '—' : Math.round(x.ov * 100) + '%'}</span></td>
                  <td style={{ textAlign: 'right' }}>{x.n ? x.bel : '—'}</td>
                  <td><Icon n={x.today ? 'check-circle' : todayInMonth ? 'x-circle' : 'circle-dashed'} style={{ fontSize: 22, color: x.today ? 'var(--color-accent-700)' : todayInMonth ? 'var(--color-accent-2-700)' : '#000' }} /></td>
                  <td>{dsMonth.length ? `${x.subM}/${dsMonth.length}` : '—'}</td><td>{x.last ? fmtShort(x.last) : '—'}</td>
                  <td data-noprint="1"><button className="btn btn-secondary" onClick={open(x.u.id)} style={{ padding: '4px 10px' }}>Open</button></td>
                </tr>); })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="col" style={{ gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 'var(--space-2) var(--space-5)' }}>
          <h3 className="h3">Daily submission register — {mTitle(mk)}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', fontSize: 13 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon n="check-circle" style={{ color: 'var(--color-accent-700)', fontSize: 16 }} />Submitted</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon n="x-circle" style={{ color: 'var(--color-accent-2-700)', fontSize: 16 }} />Not submitted</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon n="circle-dashed" style={{ fontSize: 16 }} />Due today</span>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, color: '#000', fontSize: 13 }}>
            <thead><tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 2, background: '#fff', textAlign: 'left', padding: '6px 10px', minWidth: 150, borderBottom: '1px solid #000', fontSize: 12, letterSpacing: '0.04em' }}>OFFICIAL</th>
              {days.map((k, j) => <th key={k} title={fmtD(k)} style={{ minWidth: 30, padding: '4px 2px', textAlign: 'center', borderBottom: '1px solid #000', background: k === date ? 'var(--color-accent-100)' : !eng.isWork(k) ? 'var(--color-neutral-200)' : 'transparent', lineHeight: 1.2 }}><div style={{ fontWeight: 600 }}>{j + 1}</div><div style={{ fontWeight: 400, fontSize: 11, fontStyle: 'italic' }}>{'SMTWTFS'[parse(k).getDay()]}</div></th>)}
              <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #000', fontSize: 12 }}>DONE</th>
              <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #000', fontSize: 12 }}>MISSED</th>
            </tr></thead>
            <tbody>
              {rows.map(x => { const us = S.submissions[x.u.id] || {}; return (
                <tr key={x.u.id}>
                  <td onClick={open(x.u.id)} style={{ position: 'sticky', left: 0, zIndex: 1, background: '#fff', padding: '6px 10px', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--color-neutral-200)', cursor: 'pointer' }}>{x.u.sno}. {x.u.name}</td>
                  {days.map(k => { const ok = !!us[k], hol = !eng.isWork(k), st = ok ? 'done' : hol ? 'hol' : k < todayIso ? 'miss' : k === todayIso ? 'due' : 'future';
                    return <td key={k} title={`${x.u.name} · ${fmtD(k)}: ${ok ? 'submitted ' + new Date(us[k].at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : hol ? 'holiday' : st === 'miss' ? 'not submitted' : st === 'due' ? 'due today' : 'upcoming'}`} style={{ textAlign: 'center', padding: '4px 2px', borderBottom: '1px solid var(--color-neutral-200)', background: k === date ? 'var(--color-accent-100)' : hol ? 'var(--color-neutral-100)' : 'transparent' }}>
                      {(st === 'done' || st === 'miss' || st === 'due') && <Icon n={st === 'done' ? 'check-circle' : st === 'miss' ? 'x-circle' : 'circle-dashed'} style={{ fontSize: 18, color: st === 'done' ? 'var(--color-accent-700)' : st === 'miss' ? 'var(--color-accent-2-700)' : '#000' }} />}
                    </td>; })}
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--color-neutral-200)' }}>{x.subM}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--color-neutral-200)', background: x.missM ? 'var(--color-accent-2-100)' : 'transparent' }}>{x.missM}</td>
                </tr>); })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
