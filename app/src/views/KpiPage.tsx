import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Ctx } from '../ctx';
import { api } from '../lib/data';
import type { Kpi, MonthPerson } from '../lib/engine';
import { setDayLocal, peopleLocal, updKpiLocal } from '../lib/local';
import { personPerf } from '../lib/perf';
import { C, f1, fmtD, FREQS, iso, MONTHS, mTitle, pad, parse, PERIODS, shiftMonth, UOMS } from '../lib/util';
import { Down, Icon, Legend, NotesRecs, PeriodButtons, Stat } from '../ui';

// An input that saves when it loses focus (or on Enter), not on every keystroke.
function BlurInput({ value, onCommit, as, ...rest }: { value: string | number; onCommit: (v: string) => void; as?: 'textarea' } & Record<string, unknown>) {
  const [v, setV] = useState(String(value ?? ''));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setV(String(value ?? '')); }, [value]);
  const commit = () => { focused.current = false; if (v !== String(value ?? '')) onCommit(v); };
  const props = { ...rest, value: v, onFocus: () => { focused.current = true; }, onChange: (e: { target: { value: string } }) => setV(e.target.value), onBlur: commit };
  if (as === 'textarea') return <textarea {...(props as object)} />;
  return <input {...(props as object)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

const LEFTS = [0, 40, 116, 204, 404, 488, 540, 612, 668, 736, 800, 852, 924];
const WIDTHS = [40, 76, 88, 200, 84, 52, 72, 56, 68, 64, 52, 72, 60];
const HEADERS = ['S.NO', 'NAME', 'Designation', 'KPI', 'FREQUENCY', 'UOM', 'MONTHLY TARGET', 'Target\nper Period', 'Target\nTill Date', 'ACHVD\nTill Date', 'DIFF', 'ACHVD %', 'Min %\nto Attain'];
const B = '1px solid #000';

export default function KpiPage({ ctx, narrow }: { ctx: Ctx; narrow: boolean }) {
  const { eng, data, isMgmt, P, date, vp, vUser, me } = ctx;
  const { y, m, d, dim } = eng.parts(), mk = eng.mk();
  const [mode, setMode] = useState<'entry' | 'edit'>('entry');
  const [sheetMode, setSheetMode] = useState<'auto' | 'cards' | 'sheet'>('auto');
  const [freeze, setFreeze] = useState(true);
  const [sheetFull, setSheetFull] = useState(false);
  const [sheetW, setSheetW] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ms = () => { const w = sheetRef.current?.clientWidth || 0; if (w) setSheetW(w); };
    ms(); window.addEventListener('resize', ms); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetFull(false); };
    window.addEventListener('keydown', k); return () => { window.removeEventListener('resize', ms); window.removeEventListener('keydown', k); };
  }, [sheetMode, sheetFull]);

  const editing = isMgmt && mode === 'edit';
  const mo = data.months[mk], hasMonth = !!mo;
  const showArrow = data.settings.highlightBelowMin;
  const todayIso = iso(new Date(ctx.nowTick)), subs = data.submissions[vp] || {};
  const cards = sheetMode === 'cards' || (sheetMode !== 'sheet' && narrow);
  const fzFits = sheetW === 0 || sheetW >= 1248, fz: CSSProperties['position'] = freeze && fzFits ? 'sticky' : 'static';
  const canEditDay = isMgmt || vp === me.id;
  const lockTargets = !isMgmt;
  const kmapMonth = Object.fromEntries(P.flatMap(p => p.kpis.map(k => [k.id, k])));

  // ── changes ──
  const updKpi = (p: MonthPerson, k: Kpi, patch: Partial<Kpi>) => {
    Object.keys(patch).forEach(f => ctx.audit('KPI changed', `${p.name} · ${k.name.trim()} (${mTitle(mk)}): ${f} “${(k as unknown as Record<string, unknown>)[f] ?? ''}” → “${(patch as Record<string, unknown>)[f]}”`));
    ctx.mutate(updKpiLocal(mk, p.id, k.id, patch), () => api.updKpi(mk, k.id, patch));
  };
  const setDay = (p: MonthPerson, k: Kpi, ds: string, val: string) => {
    if (val !== '' && isNaN(+val)) return ctx.toast('Enter a number.', true);
    ctx.audit('Daily figure edited', `${p.name} · ${k.name.trim()} · ${fmtD(ds)}: ${eng.dayValAt(ds, k.id) || 0} → ${val || 0}`);
    ctx.mutate(setDayLocal(ds, k.id, val), () => api.setDay(p.id, k.id, ds, val));
  };
  const updPerson = (p: MonthPerson, patch: { sno?: number; name?: string; designation?: string }) =>
    ctx.mutate(peopleLocal(mk, ps => ps.map(x => x.id === p.id ? { ...x, ...patch } : x)), () => api.updMonthPerson(mk, p.id, patch));
  const setSub = (day: string, on: boolean) => {
    ctx.audit(on ? 'Day submitted' : 'Submission removed', `${vUser?.name || ''} · ${fmtD(day)}`);
    ctx.mutate(dd => { const n = { ...(dd.submissions[vp] || {}) }; if (on) n[day] = { at: new Date().toISOString(), by: me.id }; else delete n[day]; return { ...dd, submissions: { ...dd.submissions, [vp]: n } }; },
      () => api.setSub(vp, day, me.id, on));
  };
  const createMonth = async (target: string, src: string | null) => {
    try { await api.createMonth(target, src); await ctx.reload(); ctx.toast(`${mTitle(target)} created`); } catch (e) { ctx.toast((e as Error).message, true); }
  };
  const nextMk = shiftMonth(mk, 1);
  const src = (() => { const ks = Object.keys(data.months).filter(k => k < mk).sort(); if (ks.length) return ks[ks.length - 1]; const all = Object.keys(data.months).sort(); return all[all.length - 1] || null; })();

  // ── rows ──
  const rows = eng.sheetRows(P);
  const tableList = eng.tableList(P);
  const totalN = (() => { const e = tableList.filter(o => !o.na && o.w > 0), sw = e.reduce((a, o) => a + o.w, 0); return sw ? e.reduce((a, o) => a + Math.min(o.pct, 1) * o.w, 0) / sw : null; })();
  const total = totalN || 0, naCount = tableList.filter(o => o.na).length;
  const totalPct = totalN === null ? 'No score' : Math.round(total * 100) + '%';
  const totalBg = totalN === null ? C.grey : total < 0.5 ? C.red : total < 0.8 ? C.amber : C.green;
  const totalDown = showArrow && totalN !== null && total < 1;
  const totalNote = (totalN === null ? 'No eligible KPIs' : total < 1 ? 'Short by ' + Math.round((1 - total) * 100) + '%' : 'Target met') + (naCount ? ` · ${naCount} not scored` : '') + (data.settings.scoring === 'Equal weights' ? '' : ' · weighted');

  const rowView = (r: ReturnType<typeof eng.sheetRows>[number]) => {
    const { k, c, th, w, p } = r, wd = eng.workDays(mk), el = eng.workElapsed(mk, d), pl = eng.perLabel(k, c.G);
    const comp = k.module === 'meeting' && k.meetRule === 'compliance';
    return {
      perDay: comp ? (+k.monthly || 0) + '%' : pl.v, perUnit: comp ? 'of meetings held' : pl.u,
      pdW: eng.ovNum(k.perDayOv) !== null ? 700 : 400, tdW: eng.ovNum(k.tillOv) !== null ? 700 : 400,
      perDayTitle: eng.ovNum(k.perDayOv) !== null ? 'Set manually by management (bold)' : eng.isLevel(k) ? 'Level target — the same % applies every working day' : c.G >= 1 ? `Monthly target ÷ ${wd} working days` : `Spread over the month: ${pl.v} ${pl.u}. Target Till Date counts only whole units that have fallen due so far.`,
      tillTitle: eng.ovNum(k.tillOv) !== null ? 'Set manually by management (bold)' : eng.isLevel(k) ? 'Level target — not added up day by day' : c.G >= 1 ? `Per day × ${el} working days elapsed up to the report date` : `Whole units due after ${el} of ${wd} working days (${f1(+k.monthly || 0)} × ${el} ÷ ${wd}, rounded down)`,
      pct: k.na ? 'N/A' : c.noWork ? 'Holiday' : c.noData ? 'No entry' : c.notDue ? 'Not due' : Math.round(c.K * 100) + '%',
      down: showArrow && r.down,
      pctBg: k.na || c.notDue ? C.grey : c.K < 0.5 ? C.red : c.K < th ? C.amber : C.green,
      pctTitle: k.na || c.notDue ? 'Not scored' : c.K < 0.5 ? 'Red — below 50% of target till date' : c.K < th ? `Amber — below the ${Math.round(th * 100)}% minimum` : 'Green — at or above the minimum',
      tag: [k.module === 'team' ? 'auto · average score of ' + (c.team || 0) + ' officials' : '', k.module === 'cascade' ? eng.cgTag(k.id) : '', k.module === 'meeting' ? 'from Meeting Hub (module coming next)' : '',
        !k.module && k.agg === 'latest' ? 'latest value counts' : '', !k.module && k.lower ? 'lower is better' : '', k.na ? 'Not applicable' : '', w !== 1 && !k.na ? 'weight ' + w : '', k.approval ? 'needs approval' : ''].filter(Boolean).join(' · '),
      dayRo: (ds: string) => !!k.module || !eng.isWork(ds) || !canEditDay,
      dayVal: (ds: string) => (k.module === 'cascade' || k.module === 'team') ? '' : eng.dayValAt(ds, k.id),
      p,
    };
  };

  // ── export ──
  const download = () => {
    const report = {
      workDays: eng.workDays(mk), workElapsed: eng.workElapsed(mk, d), submitted: Array.from({ length: dim }, (_, j) => !!subs[mk + '-' + pad(j + 1)]), total,
      threshold: data.settings.arrowRule === 'Below 100%' ? '100' : 'min', title: 'PILLARS KPI MONITORING ', monthName: MONTHS[m - 1], day: d, daysInMonth: dim,
      people: P.filter(p => p.kpis.length).map(p => ({ sno: p.sno, name: p.name, designation: p.designation,
        kpis: p.kpis.map(k => ({ ...k, perLabel: (() => { const L = eng.perLabel(k, eng.pace(k, d).G); return L.v + ' ' + L.u; })(), level: eng.isLevel(k), pdOv: eng.ovNum(k.perDayOv), tdOv: eng.ovNum(k.tillOv),
          ...(!k.module && (k.agg === 'latest' || k.lower) ? { staticAch: true, remarksExtra: [k.agg === 'latest' ? 'Latest value' : '', k.lower ? 'Lower is better' : ''].filter(Boolean).join(' · ') } : {}),
          ...(k.module === 'team' ? { staticAch: true, dailyOverride: Array.from({ length: dim }, () => ''), remarksExtra: 'Average overall score of the team' } : {}),
          ...(k.module === 'cascade' ? { staticAch: true, dailyOverride: Array.from({ length: dim }, () => ''), remarksExtra: 'From Goals cascade' } : {}),
          ...(k.module === 'meeting' ? { staticAch: true, dailyOverride: Array.from({ length: dim }, () => ''), remarksExtra: 'From Meeting Hub' } : {}),
          wEff: k.na ? 0 : eng.wOf(k), achieved: (k.module || k.agg === 'latest' || k.lower) ? eng.calc(k, d).I : eng.achFor(k.id), remarks: eng.remFor(k.id),
          daily: Array.from({ length: dim }, (_, j) => eng.dayVal(j + 1, k.id)) })) })),
      brief: data.entries.filter(en => en.date.slice(0, 7) === mk && en.pid === vp).sort((a, b) => a.date < b.date ? -1 : 1)
        .map(en => ({ date: parse(en.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), target: en.kid === '__other' ? 'Others (not in KPI)' : (kmapMonth[en.kid] || eng.kmapAll()[en.kid] || { name: '' }).name, activity: en.activity, uom: (eng.kmapAll()[en.kid] || { uom: '' }).uom, qty: en.qty ?? '', link: en.link, status: en.status || 'Completed' })),
    };
    const blob = (window as unknown as { KPIXlsx: { build: (r: unknown) => Blob } }).KPIXlsx.build(report);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `KPI ${vUser?.name || ''} ${MONTHS[m - 1]} ${pad(d)}-${y}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const o = JSON.parse(String(rd.result)); if (!o.months) throw new Error('That file is not a KPI portal backup.');
        if (!confirm('Replace all months, KPIs, daily figures, Daily Brief entries and submissions with this backup? Logins are kept.')) return;
        const r = await api.importBackup(o) as { kpis: number; log: number; entries: number };
        await ctx.reload(); ctx.toast(`Imported ${r.kpis} KPIs, ${r.log} daily figures, ${r.entries} Daily Brief entries`);
      } catch (x) { ctx.toast((x as Error).message, true); }
    };
    rd.readAsText(f);
  };
  const backup = () => {
    const b = new Blob([JSON.stringify({ app: 'pillars-kpi-portal', v: 4, source: 'cloud', savedAt: new Date().toISOString(), date, users: data.people.map(u => ({ id: u.id, sno: u.sno, name: u.name, designation: u.designation, role: u.role, viewAll: u.viewAll, reportsTo: u.reportsTo || '' })), months: data.months, log: data.log, remarks: data.remarks, entries: data.entries, submissions: data.submissions, calendar: data.calendar, remindAt: data.remindAt }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `KPI backup ${iso(new Date())}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const perf = personPerf(ctx);
  const showReminder = !isMgmt && vp === me.id && eng.isWork(todayIso) && !subs[todayIso] && !!data.months[todayIso.slice(0, 7)] && new Date(ctx.nowTick).toTimeString().slice(0, 5) >= (data.remindAt || '18:00');
  const btnFz = freeze && fzFits ? 'btn btn-primary' : 'btn btn-secondary';
  const td = (i: number, extra?: CSSProperties): CSSProperties => ({ position: fz, left: LEFTS[i], zIndex: 2, background: '#fff', borderRight: B, borderBottom: B, fontSize: 13, textAlign: 'center', verticalAlign: 'middle', padding: 4, ...(i === 12 ? { boxShadow: '4px 0 6px -3px rgba(0,0,0,.35)' } : {}), ...extra });
  const dayBg = (j: number, ds: string) => !eng.isWork(ds) ? 'var(--color-neutral-200)' : j + 1 === d ? 'var(--color-accent-200)' : j + 1 < d ? 'var(--color-accent-100)' : 'transparent';
  const days = Array.from({ length: dim }, (_, j) => mk + '-' + pad(j + 1));

  return (
    <>
      <header className="col" style={{ gap: 'var(--space-2)' }}>
        <div className="kicker">Pillars KPI Monitoring · {vUser?.name || ''}</div>
        <div className="row">
          <h1 className="h1">{mTitle(mk)} KPI</h1>
          <div data-noprint="1" style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <button className="btn btn-ghost btn-icon" onClick={() => ctx.goTo(shiftMonth(mk, -1))} title="Previous month"><Icon n="caret-left" /></button>
            <button className="btn btn-ghost btn-icon" onClick={() => ctx.goTo(nextMk)} title="Next month"><Icon n="caret-right" /></button>
          </div>
        </div>
        <div className="rail">
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><span style={{ fontStyle: 'italic' }}>Report date</span>
            <input className="input" type="date" value={date} onChange={e => ctx.setDate(e.target.value)} style={{ width: 'auto', minHeight: 36, padding: '3px 8px' }} /></label>
          <span>{parse(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (eng.isWork(date) ? '' : ' · Holiday — no calculation today')}</span>
          <span>Day {d} of {dim}</span>
        </div>
      </header>

      {showReminder && (
        <div data-noprint="1" className="row" style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-accent-2-100)', borderLeft: '4px solid var(--color-accent-2)' }}>
          <Icon n="bell-ringing" style={{ fontSize: 24, color: 'var(--color-accent-2-700)' }} />
          <div style={{ flex: 1, minWidth: 220, fontSize: 16, lineHeight: 1.4 }}><b>Today's KPI submission is pending.</b> It's past your {data.remindAt} reminder — update today's figures and tick the submission.</div>
          <button className="btn btn-primary" onClick={() => setSub(todayIso, true)}><Icon n="check-circle" />Submit today</button>
        </div>
      )}

      <div data-noprint="1" className="row">
        {isMgmt && <>
          <div className="seg" role="radiogroup">
            <label className="seg-opt"><input type="radio" name="mode" checked={mode === 'entry'} onChange={() => setMode('entry')} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />Daily entry</label>
            <label className="seg-opt"><input type="radio" name="mode" checked={mode === 'edit'} onChange={() => setMode('edit')} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />Edit KPIs</label>
          </div>
          <button className="btn btn-secondary" onClick={() => ctx.openDialog('kpi', { kpiPid: vp })} disabled={!hasMonth}><Icon n="plus" />Add KPI</button>
          {hasMonth && !data.months[nextMk] && <button className="btn btn-secondary" onClick={async () => { await createMonth(nextMk, mk); ctx.goTo(nextMk); }}><Icon n="calendar-plus" />Create {mTitle(nextMk)} KPIs</button>}
        </>}
        <div style={{ display: 'flex' }}>
          <button className={cards ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setSheetMode('cards')} style={{ minHeight: 40 }}><Icon n="cards" />Cards</button>
          <button className={cards ? 'btn btn-secondary' : 'btn btn-primary'} onClick={() => setSheetMode('sheet')} style={{ minHeight: 40 }}><Icon n="table" />Sheet</button>
        </div>
        <button className={btnFz} onClick={() => setFreeze(f => !f)} disabled={!fzFits} title={fzFits ? 'Keep S.NO to Min % columns fixed while scrolling dates' : 'Widen the window (about 1248px of table space) to freeze columns'}><Icon n="push-pin" />{fzFits ? 'Freeze columns' : 'Freeze needs a wider screen'}</button>
        <button className="btn btn-secondary" onClick={() => { setSheetMode('sheet'); setSheetFull(true); }} disabled={!hasMonth}><Icon n="arrows-out" />Expand sheet</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={() => window.print()}><Icon n="file-pdf" />Download PDF</button>
        <button className="btn btn-primary" onClick={download} disabled={!hasMonth}><Icon n="microsoft-excel-logo" />Export Excel</button>
        {isMgmt && <>
          <button className="btn btn-ghost" onClick={backup} title="Download a backup of all months, entries and submissions"><Icon n="cloud-arrow-down" />Backup</button>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()} title="Import a backup file — including one saved from the standalone HTML portal"><Icon n="cloud-arrow-up" />Import backup</button>
          <input type="file" accept=".json,application/json" ref={fileRef} onChange={onImport} style={{ display: 'none' }} />
        </>}
      </div>

      {!hasMonth && (
        <section className="col" style={{ gap: 'var(--space-3)', padding: 'var(--space-8) 0' }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>No KPIs set for {mTitle(mk)} yet</h2>
          <p style={{ margin: 0, maxWidth: '56ch', fontSize: 16, lineHeight: 1.6 }}>Start the month by carrying over the KPI list from {src ? mTitle(src) : 'the previous month'}. Targets and people copy across; daily figures start blank.</p>
          {!isMgmt && <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Management will set up your KPIs for this month.</p>}
          {isMgmt && <div className="row">
            <button className="btn btn-primary" onClick={() => createMonth(mk, src)} disabled={!src}><Icon n="copy" />Copy KPIs from {src ? mTitle(src) : 'previous month'}</button>
            <button className="btn btn-secondary" onClick={() => createMonth(mk, null)}>Start blank</button>
          </div>}
        </section>
      )}

      {hasMonth && <>
        {!rows.length && <p style={{ margin: 0, fontSize: 16 }}>{isMgmt ? `${vUser?.name || 'This official'} has no KPIs for ${mTitle(mk)} yet — switch to Edit KPIs and use Add KPI.` : 'Management will set up your KPIs for this month.'}</p>}

        {cards && (
          <div className="col" style={{ gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', background: totalBg }}>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total achieved · {parse(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div><div style={{ fontSize: 13 }}>{totalNote}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 34, fontWeight: 600, lineHeight: 1 }}>{totalDown && <Down size={22} />}{totalPct}</div>
            </div>
            {rows.map(r => { const v = rowView(r), ro = v.dayRo(date); return (
              <div key={r.k.id} className="col" style={{ gap: 10, padding: 'var(--space-3) var(--space-4)', background: '#fff', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{r.k.name}</div>
                    <div style={{ fontSize: 12 }}>{r.k.freq || 'Monthly'} · {r.k.uom} · min {(+r.k.min || 0) + '%'}</div>
                    {v.tag && <div style={{ fontSize: 12, fontStyle: 'italic' }}>{v.tag}</div>}
                  </div>
                  <div title={v.pctTitle} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 10px', fontSize: 18, fontWeight: 600, whiteSpace: 'nowrap', background: v.pctBg }}>{v.down && <Down />}{v.pct}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 6, fontSize: 12 }}>
                  <div><div>Monthly</div><b style={{ fontSize: 15 }}>{r.k.monthly}</b></div>
                  <div><div>Till date</div><b style={{ fontSize: 15 }}>{f1(r.c.H)}</b></div>
                  <div><div>Achieved</div><b style={{ fontSize: 15 }}>{f1(r.c.I)}</b></div>
                  <div><div>Gap</div><b style={{ fontSize: 15 }}>{f1(r.c.J)}</b></div>
                </div>
                {!ro && <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 14 }}><span style={{ flex: 1 }}>Achieved on {parse(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  <BlurInput type="number" inputMode="decimal" value={v.dayVal(date)} onCommit={x => setDay(r.p, r.k, date, x)} style={{ width: 110, minHeight: 44, font: 'inherit', fontSize: 16, padding: '4px 8px', border: '1px solid var(--color-neutral-300)', background: 'var(--color-accent-100)', color: '#000', boxSizing: 'border-box' }} /></label>}
              </div>); })}
            <p style={{ margin: 0, fontSize: 13, fontStyle: 'italic' }}>Log detailed activity in the Daily Brief. Switch to “Sheet” for the full Excel-style view.</p>
          </div>
        )}

        {sheetFull && (
          <div data-noprint="1" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 48, zIndex: 301, background: '#fff', borderBottom: '2px solid #000', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '0 var(--space-4)' }}>
            <span style={{ fontSize: 16, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>KPI sheet · {mTitle(mk)} · {vUser?.name}</span>
            <button className={btnFz} onClick={() => setFreeze(f => !f)} disabled={!fzFits} style={{ minHeight: 36, padding: '4px 10px' }}><Icon n="push-pin" />{fzFits ? 'Freeze columns' : 'Freeze needs a wider screen'}</button>
            <button className="btn btn-primary" onClick={() => setSheetFull(false)} style={{ minHeight: 36, padding: '4px 12px' }} title="Exit full screen (Esc)"><Icon n="arrows-in" />Exit full screen</button>
          </div>
        )}
        {!cards && !sheetFull && <div data-noprint="1" style={{ textAlign: 'right', marginBottom: -20 }}><button className="btn btn-primary" onClick={() => setSheetFull(true)} style={{ minHeight: 36, padding: '4px 12px' }}><Icon n="arrows-out" />Full screen</button></div>}
        {!cards && (
          <div data-sheet="1" ref={sheetRef} style={{ overflow: 'auto', maxHeight: sheetFull ? 'none' : 'calc(100vh - 150px)', position: sheetFull ? 'fixed' : 'static', top: sheetFull ? 48 : 'auto', left: 0, right: 0, bottom: 0, zIndex: sheetFull ? 300 : 'auto', background: '#fff', WebkitOverflowScrolling: 'touch' } as CSSProperties}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, borderLeft: B, borderTop: B, tableLayout: 'fixed', width: 984 + dim * 44, fontFamily: 'var(--font-body)', color: '#000', background: '#fff' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 6 }}>
                <tr aria-hidden="true">{WIDTHS.map((w, i) => <td key={i} style={{ width: w, padding: 0, height: 0 }} />)}{days.map(ds => <td key={ds} style={{ width: 44, padding: 0, height: 0 }} />)}</tr>
                <tr>
                  <th colSpan={3} style={{ ...td(0), zIndex: 4, borderBottom: B, background: 'var(--color-accent-200)', fontSize: 12, fontWeight: 600, padding: '4px 8px', letterSpacing: '0.04em' }}>PILLARS KPI MONITORING</th>
                  <th colSpan={8} style={{ ...td(3), zIndex: 4, borderRight: 'none', background: 'var(--color-accent-200)' }} />
                  <th style={{ ...td(11), zIndex: 4, background: 'var(--color-accent-200)', fontSize: 11, fontWeight: 600, padding: '4px 2px', whiteSpace: 'nowrap', overflow: 'hidden' }}>{MONTHS[m - 1]}</th>
                  <th style={{ ...td(12), zIndex: 4, background: 'var(--color-accent-200)', fontSize: 12, fontWeight: 600, padding: '4px 8px' }}>{d}</th>
                  <th colSpan={dim} style={{ borderRight: B, borderBottom: B, background: 'var(--color-accent-200)', fontSize: 12, fontWeight: 600, padding: '4px 8px', textAlign: 'left', letterSpacing: '0.04em' }}>DAILY ACHIEVED — {MONTHS[m - 1]} {y}</th>
                </tr>
                <tr>
                  {HEADERS.map((h, i) => <th key={h} style={{ ...td(i), zIndex: 4, background: 'var(--color-accent-200)', fontSize: 12, fontWeight: 600, padding: 6, whiteSpace: 'pre-line', lineHeight: 1.25 }}>{h}</th>)}
                  {days.map((ds, j) => <th key={ds} style={{ borderRight: B, borderBottom: B, background: j + 1 === d ? 'var(--color-accent-300)' : eng.isWork(ds) ? 'var(--color-accent-200)' : 'var(--color-neutral-200)', fontSize: 12, fontWeight: 600, padding: '4px 2px', textAlign: 'center', lineHeight: 1.2 }}><div>{j + 1}</div><div style={{ fontWeight: 400, fontSize: 11, fontStyle: 'italic' }}>{'SMTWTFS'[parse(ds).getDay()]}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => { const v = rowView(r), { k, c, p } = r; return (
                  <tr key={k.id}>
                    {r.i === 0 && <>
                      <td rowSpan={p.kpis.length} style={td(0, { fontWeight: 600 })}>{editing ? <BlurInput type="number" value={p.sno} onCommit={x => updPerson(p, { sno: +x || 0 })} className="cell-in" style={{ textAlign: 'center', padding: '4px 2px' }} /> : p.sno}</td>
                      <td rowSpan={p.kpis.length} style={td(1, { fontWeight: 600, textAlign: 'left', padding: '6px 8px' })}>{editing ? <BlurInput value={p.name} onCommit={x => updPerson(p, { name: x })} className="cell-in" /> : p.name}</td>
                      <td rowSpan={p.kpis.length} style={td(2, { fontWeight: 600, textAlign: 'left', padding: '6px 8px', whiteSpace: 'pre-line' })}>
                        {editing ? <div className="col" style={{ gap: 'var(--space-2)' }}>
                          <BlurInput as="textarea" rows={2} value={p.designation} onCommit={x => updPerson(p, { designation: x })} className="cell-in" style={{ resize: 'vertical' }} />
                          <button data-noprint="1" className="btn btn-ghost" onClick={() => ctx.openDialog('kpi', { kpiPid: p.id })} style={{ fontSize: 12, fontWeight: 400 }}><Icon n="plus" />KPI</button>
                        </div> : p.designation}
                      </td>
                    </>}
                    <td style={td(3, { textAlign: 'left', padding: '6px 8px' })}>
                      {!editing && <><span>{k.name}</span>{v.tag && <span style={{ fontSize: 11, fontStyle: 'italic' }}> · {v.tag}</span>}</>}
                      {editing && <>
                        <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
                          <BlurInput value={k.name} onCommit={x => updKpi(p, k, { name: x })} className="cell-in" style={{ flex: 1, minWidth: 0 }} />
                          <button className="btn btn-ghost" data-noprint="1" title="Delete KPI" style={{ padding: 4 }} onClick={() => { if (!confirm(`Delete KPI “${k.name}” from ${mTitle(mk)}?`)) return; ctx.audit('KPI deleted', `${p.name} · ${k.name.trim()} (${mTitle(mk)})`); ctx.mutate(peopleLocal(mk, ps => ps.map(x => x.id !== p.id ? x : { ...x, kpis: x.kpis.filter(q => q.id !== k.id) })), () => api.delKpi(mk, k.id)); }}><Icon n="trash" /></button>
                        </div>
                        <div data-noprint="1" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center', marginTop: 4, fontSize: 12 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Weight <BlurInput type="number" min="0" step="0.5" value={k.weight ?? 1} onCommit={x => updKpi(p, k, { weight: x })} style={{ width: 48, border: 'none', background: 'var(--color-accent-100)', font: 'inherit', textAlign: 'center', padding: 2, color: '#000' }} /></label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={!!k.na} onChange={e => updKpi(p, k, { na: e.target.checked })} />Not applicable</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={!!k.approval} onChange={e => updKpi(p, k, { approval: e.target.checked })} />Needs approval</label>
                          <select value={k.agg || 'sum'} onChange={e => updKpi(p, k, { agg: e.target.value as 'sum' | 'latest' })} title="How achievement is counted" style={{ border: 'none', background: 'var(--color-accent-100)', font: 'inherit', padding: 2, color: '#000' }}><option value="sum">Total of entries</option><option value="latest">Latest value (%, rate)</option></select>
                          <select value={k.lower ? 'lower' : 'higher'} onChange={e => updKpi(p, k, { lower: e.target.value === 'lower' })} title="Which direction is good" style={{ border: 'none', background: 'var(--color-accent-100)', font: 'inherit', padding: 2, color: '#000' }}><option value="higher">Higher is better</option><option value="lower">Lower is better</option></select>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Tracker
                            <select value={k.module || ''} onChange={e => updKpi(p, k, { module: e.target.value as Kpi['module'], meetRule: k.meetRule || (k.uom === '%' ? 'compliance' : 'count') })} style={{ border: 'none', background: 'var(--color-accent-100)', font: 'inherit', padding: 2, color: '#000' }}><option value="">None</option><option value="meeting">Meeting Hub</option><option value="cascade">Goals cascade</option><option value="team">Team overall score</option></select>
                          </label>
                        </div>
                      </>}
                    </td>
                    <td style={td(4)}><select value={k.freq || 'Monthly'} disabled={lockTargets} onChange={e => updKpi(p, k, { freq: e.target.value })} style={{ width: '100%', border: 'none', background: 'var(--color-accent-100)', font: 'inherit', fontSize: 12, padding: '4px 0', color: '#000', borderRadius: 'var(--radius-sm)' }}>{FREQS.map(f => <option key={f}>{f}</option>)}</select></td>
                    <td style={td(5)}>{editing ? <select value={k.uom} onChange={e => { let x = e.target.value; if (x === 'Other…') { x = (prompt('Unit of measurement:', '') || '').trim(); if (!x) return; } updKpi(p, k, { uom: x }); }} className="cell-in" style={{ fontSize: 12, padding: '4px 0' }}>{(UOMS.includes(k.uom) || !k.uom ? UOMS : [k.uom, ...UOMS]).map(u => <option key={u}>{u}</option>)}</select> : k.uom}</td>
                    <td style={td(6)}><BlurInput type="number" min="0" readOnly={lockTargets} value={k.monthly} onCommit={x => updKpi(p, k, { monthly: x })} title="Edit monthly target — per day and till-date targets recalculate" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-accent-300)', background: 'var(--color-accent-100)', font: 'inherit', fontWeight: 600, textAlign: 'center', padding: '4px 2px', color: '#000', borderRadius: 'var(--radius-sm)' }} /></td>
                    <td style={td(7)} title={v.perDayTitle}>{editing ? <BlurInput type="number" step="any" value={k.perDayOv ?? ''} placeholder={'auto ' + f1(eng.isLevel(k) ? (+k.monthly || 0) : (+k.monthly || 0) / eng.workDays(mk))} onCommit={x => updKpi(p, k, { perDayOv: x })} title="Blank = auto (monthly target ÷ working days)" className="cell-in" style={{ fontSize: 12, padding: '4px 2px', textAlign: 'center' }} /> : <><span style={{ fontWeight: v.pdW }}>{v.perDay}</span><div style={{ fontSize: 10, fontStyle: 'italic', whiteSpace: 'nowrap' }}>{v.perUnit}</div></>}</td>
                    <td style={td(8)} title={v.tillTitle}>{editing ? <BlurInput type="number" step="any" value={k.tillOv ?? ''} placeholder="auto" onCommit={x => updKpi(p, k, { tillOv: x })} title="Blank = auto (per day × working days elapsed)" className="cell-in" style={{ fontSize: 12, padding: '4px 2px', textAlign: 'center' }} /> : <span style={{ fontWeight: v.tdW }}>{f1(c.H)}</span>}</td>
                    <td style={td(9, { fontWeight: 600 })}>{f1(c.I)}</td>
                    <td style={td(10)}>{f1(c.J)}</td>
                    <td title={v.pctTitle} style={td(11, { fontWeight: 600, background: v.pctBg })}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>{v.down && <Down />}<span>{v.pct}</span></div></td>
                    <td style={td(12, { fontWeight: 600 })}>{editing ? <BlurInput type="number" value={k.min} onCommit={x => updKpi(p, k, { min: x })} className="cell-in" style={{ textAlign: 'center', padding: '4px 2px' }} /> : (+k.min || 0) + '%'}</td>
                    {days.map((ds, j) => (
                      <td key={ds} style={{ borderRight: B, borderBottom: B, fontSize: 13, textAlign: 'center', verticalAlign: 'middle', padding: 2, background: dayBg(j, ds) }}>
                        <BlurInput type="number" value={v.dayVal(ds)} readOnly={v.dayRo(ds)} onCommit={x => setDay(p, k, ds, x)} title={!eng.isWork(ds) ? 'Holiday — not counted' : k.module ? 'Calculated by its tracker' : (j + 1) + ' ' + MONTHS[m - 1]}
                          style={{ width: '100%', boxSizing: 'border-box', border: 'none', background: 'transparent', font: 'inherit', textAlign: 'center', padding: '4px 0', color: '#000' }} />
                      </td>
                    ))}
                  </tr>); })}
                <tr>
                  <td colSpan={11} style={{ ...td(0), background: 'var(--color-accent-200)', fontWeight: 600, padding: '6px 8px', textAlign: 'right' }}>TOTAL ACHIEVED % (Target 100%)</td>
                  <td style={{ ...td(11), background: totalBg, fontWeight: 600, padding: '6px 4px' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>{totalDown && <Down />}<span>{totalPct}</span></div></td>
                  <td style={{ ...td(12), background: 'var(--color-accent-200)', fontWeight: 600, padding: '6px 8px' }}>100%</td>
                  <td colSpan={dim} style={{ borderRight: B, borderBottom: B, background: 'var(--color-accent-200)', fontSize: 13, fontWeight: 600, padding: '6px 8px', textAlign: 'left' }}>{totalNote}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2) var(--space-4)', fontSize: 14 }}>
          <b>ACHVD % colours:</b>
          {([[C.green, 'Green — at or above Min % to attain'], [C.amber, 'Amber — 50% up to Min %'], [C.red, 'Red — below 50%'], [C.grey, 'Grey — not due / no entry / N/A']] as [string, string][]).map(([c, l]) => <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 14, background: c, border: B }} />{l}</span>)}
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Down />below minimum</span>
          <span style={{ fontStyle: 'italic' }}>Total: green 80%+, amber 50–80%, red below 50%</span>
        </div>
        <p data-noprint="1" style={{ margin: 0, maxWidth: '72ch', fontSize: 14, fontStyle: 'italic', lineHeight: 1.6 }}>Monthly targets are set by management. Per day = monthly ÷ {eng.workDays(mk)} working days; target till date grows each working day. <Down /> marks a KPI {data.settings.arrowRule === 'Below 100%' ? 'below 100% of its target till date' : 'below its Min % to attain'}. Type daily figures under each date, or log them through the Daily Brief.</p>

        <SubmissionLog ctx={ctx} days={days} subs={subs} todayIso={todayIso} setSub={setSub} />
      </>}

      <section data-printbreak="1" className="col" style={{ gap: 'var(--space-5)', marginTop: 'var(--space-6)' }}>
        <div className="col" style={{ gap: 'var(--space-2)' }}>
          <h2 className="h2">Performance</h2>
          <div style={{ fontSize: 15, fontStyle: 'italic' }}>{perf.periodLabel} · {perf.rangeLabel}</div>
        </div>
        <div data-noprint="1" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <PeriodButtons periods={PERIODS} period={ctx.period} onPick={id => { ctx.setPeriod(id); if (id === 'custom' && !ctx.cFrom) ctx.setCustom(perf.from, perf.to); }} />
        </div>
        {ctx.period === 'custom' && <div data-noprint="1" className="row" style={{ alignItems: 'end' }}>
          <div className="field"><label>From</label><input className="input" type="date" value={ctx.cFrom || perf.from} onChange={e => ctx.setCustom(e.target.value, ctx.cTo || perf.to)} /></div>
          <div className="field"><label>To</label><input className="input" type="date" value={ctx.cTo || perf.to} onChange={e => ctx.setCustom(ctx.cFrom || perf.from, e.target.value)} /></div>
        </div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 'var(--space-5)', maxWidth: 1100 }}>{perf.stats.map(s => <Stat key={s.l} {...s} />)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 'var(--space-8)' }}>
          <div className="col" style={{ gap: 'var(--space-3)' }}>
            <h3 className="h3">Attainment by KPI</h3>
            <Legend items={[['var(--color-accent)', 'On track'], ['var(--color-accent-2)', 'Below threshold'], ['line', 'Min % / 100% line']]} />
            <div className="col" style={{ gap: 'var(--space-3)' }}>
              {perf.bars.map((b, i) => (
                <div key={i} className="col" style={{ gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', fontSize: 13, lineHeight: 1.35 }}><span>{b.name}</span><span style={{ fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2 }}>{b.below && <Down />}{b.pctLabel}</span></div>
                  <div style={{ position: 'relative', height: 14, background: 'var(--color-neutral-100)' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: b.w, background: b.color }} />
                    <div style={{ position: 'absolute', top: -3, bottom: -3, left: b.minLeft, width: 2, background: '#000' }} />
                    <div style={{ position: 'absolute', top: -3, bottom: -3, left: '66.66%', width: 1, background: '#000', opacity: 0.5 }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ position: 'relative', height: 16, fontSize: 11 }}><span style={{ position: 'absolute', left: 0 }}>0%</span><span style={{ position: 'absolute', left: '33.33%', transform: 'translateX(-50%)' }}>50%</span><span style={{ position: 'absolute', left: '66.66%', transform: 'translateX(-50%)' }}>100%</span><span style={{ position: 'absolute', right: 0 }}>150%+</span></div>
          </div>
          <div className="col" style={{ gap: 'var(--space-3)' }}>
            <h3 className="h3">Cumulative attainment {perf.trendUnit}</h3>
            <div style={{ fontSize: 13 }}>Overall % against target, building through the period (each KPI capped at 100%).</div>
            <div style={{ position: 'relative', height: 220, display: 'flex', alignItems: 'flex-end', gap: 2, borderBottom: B, marginTop: 16 }}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', borderTop: '1px dashed #000', height: 0 }} />
              <div style={{ position: 'absolute', left: 0, bottom: '100%', fontSize: 11, paddingBottom: 2 }}>100%</div>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: '50%', borderTop: '1px dotted var(--color-neutral-300)', height: 0 }} />
              {perf.trend.map((t, i) => <div key={i} title={t.title} style={{ flex: 1, minWidth: 0, height: t.h, background: t.color }} />)}
            </div>
            <div style={{ display: 'flex', gap: 2, fontSize: 11 }}>{perf.trend.map((t, i) => <div key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', overflow: 'visible', whiteSpace: 'nowrap' }}>{t.label}</div>)}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 'var(--space-8)' }}><NotesRecs notes={perf.notes} recs={perf.recs} /></div>
      </section>

      <section data-noprint="1" className="row" style={{ marginTop: 'var(--space-6)' }}>
        <h2 className="h2">Daily Brief</h2>
        <span style={{ fontSize: 15, flex: 1, minWidth: 240 }}>Record activities and achieved quantities — completed work updates this sheet.</span>
        <button className="btn btn-primary" onClick={() => ctx.setView('brief')}><Icon n="notebook" />Open Daily Brief</button>
      </section>
    </>
  );
}

function SubmissionLog({ ctx, days, subs, todayIso, setSub }: { ctx: Ctx; days: string[]; subs: Record<string, { at: string }>; todayIso: string; setSub: (d: string, on: boolean) => void }) {
  const { date, eng } = ctx, mk = eng.mk();
  const canEdit = ctx.isMgmt || ctx.vp === ctx.me.id;
  const due = days.filter(k => k <= todayIso && eng.isWork(k)), ok = due.filter(k => subs[k]).length;
  const dateShort = parse(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <section className="col" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 'var(--space-2) var(--space-5)' }}>
        <h2 className="h2">Daily submission log</h2>
        <div style={{ fontSize: 15 }}>{due.length ? `${ok} of ${due.length} working days submitted in ${mTitle(mk)}` : `${mTitle(mk)} hasn't started yet`}</div>
      </div>
      {canEdit && <div data-noprint="1" className="row">
        {subs[date] ? <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 600 }}><Icon n="check-circle" style={{ fontSize: 24, color: 'var(--color-accent-700)' }} />Submitted for {dateShort} at {new Date(subs[date].at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <button className="btn btn-ghost" onClick={() => setSub(date, false)}>Undo</button>
        </> : date <= todayIso && <button className="btn btn-primary" onClick={() => setSub(date, true)} style={{ minHeight: 44 }}><Icon n="check-circle" />Submit KPIs for {dateShort}</button>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 14, fontStyle: 'italic' }}>Reminder time: {ctx.data.remindAt} (set by management)</span>
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(44px,1fr))', gap: 4, maxWidth: 1100 }}>
        {days.map((k, j) => {
          const s = !!subs[k], past = k < todayIso, isToday = k === todayIso, hol = !eng.isWork(k);
          const st = s ? 'done' : hol ? 'hol' : past ? 'miss' : 'due';
          return (
            <button key={k} disabled={!canEdit || k > todayIso} onClick={() => setSub(k, !s)} title={s ? `Submitted ${new Date(subs[k].at).toLocaleString('en-GB')}` : hol ? 'Holiday' : past ? 'Missed — click to mark submitted' : isToday ? 'Due today — click to submit' : 'Upcoming'}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 56, border: `1px solid ${k === date ? '#000' : isToday ? 'var(--color-accent)' : 'var(--color-neutral-300)'}`, background: st === 'done' ? 'var(--color-accent-100)' : st === 'miss' ? 'var(--color-accent-2-100)' : st === 'hol' ? 'var(--color-neutral-200)' : '#fff', color: '#000', font: 'inherit', fontSize: 13, cursor: canEdit && k <= todayIso ? 'pointer' : 'default', padding: '4px 0', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontWeight: 600 }}>{j + 1}</span>
              {st !== 'hol' && <Icon n={st === 'done' ? 'check-circle' : st === 'miss' ? 'x-circle' : 'circle-dashed'} style={{ fontSize: 18, color: st === 'done' ? 'var(--color-accent-700)' : st === 'miss' ? 'var(--color-accent-2-700)' : '#000' }} />}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', fontSize: 13 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon n="check-circle" style={{ color: 'var(--color-accent-700)' }} />Submitted</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon n="x-circle" style={{ color: 'var(--color-accent-2-700)' }} />Missed</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon n="circle-dashed" />Due / upcoming</span>
        <span style={{ fontStyle: 'italic' }}>Grey days are holidays. Click a day to tick or untick it.</span>
      </div>
    </section>
  );
}
