import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './lib/supabase';
import { api, loadAll, type Data } from './lib/data';
import { Engine } from './lib/engine';
import { dimOf, iso, pad } from './lib/util';
import type { Ctx, DialogName, View } from './ctx';
import { Icon } from './ui';
import Login from './views/Login';
import KpiPage from './views/KpiPage';
import BriefPage from './views/BriefPage';
import Overview from './views/Overview';
import { AuditDialog, DocDialog, KpiDialog, TeamDialog } from './views/Dialogs';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (!configured) return <div className="page"><h1 className="h1">Setup needed</h1><p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README) and rebuild.</p></div>;
  if (session === undefined) return <div className="page"><p>Loading…</p></div>;
  if (!session) return <Login />;
  return <Portal session={session} />;
}

function Portal({ session }: { session: Session }) {
  const [data, setData] = useState<Data | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [date, setDateRaw] = useState(iso(new Date()));
  const [view, setViewRaw] = useState<View>('person');
  const [viewPid, setViewPid] = useState('');
  const [period, setPeriod] = useState('month');
  const [cFrom, setCFrom] = useState(''); const [cTo, setCTo] = useState('');
  const [dialog, setDialog] = useState<DialogName>(null);
  const [docUrl, setDocUrl] = useState(''); const [kpiPid, setKpiPid] = useState('');
  const [toastMsg, setToastMsg] = useState<{ m: string; err?: boolean } | null>(null);
  const [vw, setVw] = useState(window.innerWidth);
  const [nowTick, setNowTick] = useState(Date.now());
  const [refreshed, setRefreshed] = useState(0);
  const pending = useRef(0);

  const reload = useCallback(async () => {
    try { setData(await loadAll()); setLoadErr(''); } catch (e) { setLoadErr((e as Error).message); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // live updates from other users (debounced; skipped while our own writes are in flight)
  useEffect(() => {
    let t: number | undefined;
    const ch = supabase.channel('kpi-live').on('postgres_changes', { event: '*', schema: 'public' }, () => {
      clearTimeout(t); t = window.setTimeout(() => { if (!pending.current) reload(); }, 800);
    }).subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [reload]);
  useEffect(() => {
    const r = () => setVw(window.innerWidth); window.addEventListener('resize', r);
    const i = window.setInterval(() => setNowTick(Date.now()), 60000);
    const f = () => reload(); window.addEventListener('focus', f);
    return () => { window.removeEventListener('resize', r); window.removeEventListener('focus', f); clearInterval(i); };
  }, [reload]);

  const toast = useCallback((m: string, err?: boolean) => { setToastMsg({ m, err }); window.setTimeout(() => setToastMsg(null), err ? 6000 : 2500); }, []);
  const mutate = useCallback(async (local: (d: Data) => Data, remote: () => Promise<unknown>, msg?: string) => {
    setData(d => (d ? local(d) : d)); pending.current++;
    try { await remote(); if (msg) toast(msg); return true; }
    catch (e) { toast('Not saved: ' + (e as Error).message, true); await reload(); return false; }
    finally { pending.current--; }
  }, [reload, toast]);
  const audit = useCallback((a: string, d: string) => { Promise.resolve(api.audit(a, d)).catch(() => { /* audit is best-effort */ }); }, []);

  const me = data?.people.find(p => p.authUid === session.user.id);
  const members = useMemo(() => (data?.people || []).filter(u => u.role !== 'management' && u.active).sort((a, b) => (+a.sno || 0) - (+b.sno || 0)), [data]);
  const eng = useMemo(() => data ? new Engine({ ...data, date, meetings: [], cgoals: [] }) : null, [data, date]);

  if (loadErr && !data) return <div className="page"><h1 className="h1">Couldn't load</h1><p>{loadErr}</p><button className="btn btn-primary" onClick={reload}>Try again</button></div>;
  if (!data || !eng) return <div className="page"><p>Loading KPI data…</p></div>;
  if (!me) return (
    <div className="page"><h1 className="h1">No access yet</h1>
      <p>Your login isn't linked to an official. Ask management to set it up under Team &amp; logins.</p>
      <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}><Icon n="sign-out" />Sign out</button></div>
  );

  const isMgmt = me.role === 'management', canAll = isMgmt || me.viewAll;
  const vp = !canAll ? me.id : members.some(u => u.id === viewPid) ? viewPid : (me.role === 'member' ? me.id : members[0]?.id || '');
  const mk = date.slice(0, 7), mo = data.months[mk];
  const P = mo ? mo.people.filter(p => p.id === vp) : [];
  const curView: View = view === 'overview' && !isMgmt ? 'person' : view;

  const goTo = (mk2: string) => { const t = iso(new Date()); setDateRaw(t.slice(0, 7) === mk2 ? t : mk2 < t.slice(0, 7) ? mk2 + '-' + pad(dimOf(mk2)) : mk2 + '-01'); };
  const setView = (v: View, pid?: string) => { setViewRaw(v); if (pid !== undefined) setViewPid(pid); window.scrollTo(0, 0); };
  const ctx: Ctx = {
    data, eng, me, isMgmt, canAll, vp, vUser: data.people.find(u => u.id === vp), P, hasMonth: !!mo && (P.length > 0 || isMgmt), members,
    date, setDate: d => d && setDateRaw(d), goTo, view: curView, setView, period, setPeriod: p => setPeriod(p),
    cFrom, cTo, setCustom: (a, b) => { setCFrom(a); setCTo(b); },
    openDialog: (d, extra) => { setDialog(d); if (extra?.docUrl !== undefined) setDocUrl(extra.docUrl); if (extra?.kpiPid !== undefined) setKpiPid(extra.kpiPid); },
    mutate, reload, toast, audit, nowTick,
  };

  const narrow = vw < 760;
  const tabCls = (on: boolean) => on ? 'btn btn-primary' : 'btn btn-secondary';
  const memberSel = canAll && (
    <select className="input" value={curView === 'overview' ? '' : vp} onChange={e => e.target.value && setView(curView === 'brief' ? 'brief' : 'person', e.target.value)} style={{ width: 'auto', minHeight: 40 }}>
      <option value="">View an official…</option>
      {members.map(u => <option key={u.id} value={u.id}>{u.sno}. {u.name}</option>)}
    </select>
  );
  const mTab = (label: string, icon: string, on: boolean, go: () => void) => (
    <button key={label} onClick={go} style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 58, fontSize: 11, color: on ? 'var(--color-accent-700)' : '#000', fontWeight: on ? 600 : 400, borderTop: `3px solid ${on ? 'var(--color-accent)' : 'transparent'}` }}>
      <Icon n={icon} style={{ fontSize: 22 }} /><span>{label}</span>
    </button>
  );

  return (
    <div className="page">
      <nav data-noprint="1" style={{ position: 'sticky', top: 0, zIndex: 60, background: '#fff', paddingTop: 'var(--space-3)', boxShadow: '0 6px 10px -10px rgba(0,0,0,.35)', display: 'flex', flexWrap: narrow ? 'nowrap' : 'wrap', overflowX: 'auto', alignItems: 'center', gap: 'var(--space-3)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--color-neutral-300)' }}>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>Pillars KPI</div>
        {!narrow && <>
          <button className={tabCls(curView === 'person')} onClick={() => setView('person')}><Icon n="chart-line-up" />KPI</button>
          <button className={tabCls(curView === 'brief')} onClick={() => setView('brief')}><Icon n="notebook" />Daily Brief</button>
          {isMgmt && <button className={tabCls(curView === 'overview')} onClick={() => setView('overview')}><Icon n="chart-bar" />Team overview</button>}
        </>}
        {memberSel}
        {isMgmt && <>
          <button className="btn btn-ghost" onClick={() => setDialog('team')} style={{ whiteSpace: 'nowrap' }}><Icon n="users-three" />Team &amp; logins</button>
          <button className="btn btn-ghost" onClick={() => setDialog('audit')} style={{ whiteSpace: 'nowrap' }}><Icon n="clock-counter-clockwise" />Audit log</button>
        </>}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 15, whiteSpace: 'nowrap' }}><Icon n="user-circle" style={{ fontSize: 22 }} /><span><b>{me.name}</b> · {isMgmt ? 'Management' : 'Official'}</span></div>
        <button className="btn btn-secondary" onClick={async () => { await reload(); setRefreshed(Date.now()); window.setTimeout(() => setRefreshed(0), 2500); }} title="Reload the latest figures from the server"><Icon n="arrows-clockwise" />{refreshed ? 'Refreshed ✓' : 'Refresh'}</button>
        <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()} style={{ whiteSpace: 'nowrap' }}><Icon n="sign-out" />Sign out</button>
      </nav>

      {curView === 'person' && <KpiPage ctx={ctx} narrow={narrow} />}
      {curView === 'brief' && <BriefPage ctx={ctx} />}
      {curView === 'overview' && <Overview ctx={ctx} />}

      {narrow && <>
        <div data-noprint="1" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, display: 'grid', gridTemplateColumns: `repeat(${isMgmt ? 3 : 2},minmax(0,1fr))`, background: '#fff', borderTop: '1px solid var(--color-neutral-300)', boxShadow: '0 -2px 10px rgba(0,0,0,.08)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {mTab(isMgmt ? 'KPI' : 'My KPIs', 'chart-line-up', curView === 'person', () => setView('person'))}
          {mTab('Brief', 'notebook', curView === 'brief', () => setView('brief'))}
          {isMgmt && mTab('Overview', 'chart-bar', curView === 'overview', () => setView('overview'))}
        </div>
        <div style={{ height: 76 }} />
      </>}

      {dialog === 'team' && isMgmt && <TeamDialog ctx={ctx} onClose={() => setDialog(null)} />}
      {dialog === 'audit' && isMgmt && <AuditDialog onClose={() => setDialog(null)} />}
      {dialog === 'kpi' && isMgmt && <KpiDialog ctx={ctx} pid={kpiPid || vp} onClose={() => setDialog(null)} />}
      {dialog === 'doc' && docUrl && <DocDialog url={docUrl} onClose={() => setDialog(null)} />}
      {toastMsg && <div className={'toast' + (toastMsg.err ? ' err' : '')} role="status">{toastMsg.m}</div>}
    </div>
  );
}
