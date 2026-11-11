import { useEffect, useState } from 'react';
import type { Ctx } from '../ctx';
import { api } from '../lib/data';
import type { Calendar, Kpi } from '../lib/engine';
import { peopleLocal, uid } from '../lib/local';
import { DOW, driveEmbed, fmtD, FREQS, mTitle, UOMS } from '../lib/util';
import { Dialog, Icon } from '../ui';

export function DocDialog({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <Dialog onClose={onClose} width="min(1000px,96vw)">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div className="dialog-title" style={{ margin: 0 }}>Reference</div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <a className="btn btn-secondary" href={url} target="_blank" rel="noopener" style={{ textDecoration: 'none' }}><Icon n="arrow-square-out" />Open in Drive</a>
          <button className="btn btn-ghost btn-icon" onClick={onClose} title="Close"><Icon n="x" /></button>
        </div>
      </div>
      <iframe src={driveEmbed(url)} style={{ width: '100%', height: '70vh', border: '1px solid var(--color-neutral-300)', background: '#fff' }} allow="autoplay" title="Reference document" />
      <div style={{ fontSize: 13, fontStyle: 'italic' }}>If the file doesn't show, set its Drive sharing to “Anyone with the link can view”.</div>
    </Dialog>
  );
}

export function AuditDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [count, setCount] = useState(0);
  useEffect(() => { api.auditLog().then(setRows).catch(() => setRows([])); api.auditCount().then(setCount); }, []);
  return (
    <Dialog onClose={onClose} width="min(1000px,96vw)">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div className="dialog-title" style={{ margin: 0 }}>Audit log</div>
        <button className="btn btn-ghost btn-icon" onClick={onClose} title="Close"><Icon n="x" /></button>
      </div>
      <div className="dialog-body">Every change to targets, KPIs, daily figures, activity status, approvals, submissions, months and logins — newest first. Showing {rows?.length || 0} of {count}.</div>
      {!rows ? <p>Loading…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 760, color: '#000' }}>
            <thead><tr><th style={{ width: 150 }}>When</th><th style={{ width: 130 }}>Who</th><th style={{ width: 150 }}>Action</th><th>Detail</th></tr></thead>
            <tbody>{rows.map(a => (
              <tr key={a.id as number}><td style={{ fontSize: 13 }}>{new Date(a.at as string).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td style={{ fontSize: 13, fontWeight: 600 }}>{a.by_name as string}</td><td style={{ fontSize: 13 }}>{a.action as string}</td><td style={{ fontSize: 13 }}>{a.detail as string}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}

export function KpiDialog({ ctx, pid, onClose }: { ctx: Ctx; pid: string; onClose: () => void }) {
  const mk = ctx.eng.mk(), mo = ctx.data.months[mk];
  const opts = (mo?.people || []);
  const [d, setD] = useState({ pid: opts.some(p => p.id === pid) ? pid : opts[0]?.id || '', name: '', freq: 'Monthly', uom: 'Nos', monthly: '', min: '100' });
  const set = (k: string) => (e: { target: { value: string } }) => setD(x => ({ ...x, [k]: e.target.value }));
  const uomList = d.uom && !UOMS.includes(d.uom) ? [d.uom, ...UOMS] : UOMS;
  const save = async () => {
    const p = opts.find(x => x.id === d.pid); if (!p) return;
    const k: Kpi = { id: 'k' + uid(), name: d.name.trim(), freq: d.freq, uom: d.uom, monthly: +d.monthly, min: +d.min || 0, prorate: true, agg: 'sum', weight: 1 };
    ctx.audit('KPI added', `${p.name} · ${k.name} (${mTitle(mk)}): target ${k.monthly} ${k.uom}, min ${k.min}%`);
    onClose();
    await ctx.mutate(peopleLocal(mk, ps => ps.map(x => x.id === p.id ? { ...x, kpis: [...x.kpis, k] } : x)), () => api.addKpi(mk, p.id, p.kpis.length, k), 'KPI added');
  };
  return (
    <Dialog onClose={onClose}>
      <div className="dialog-title">Add a KPI</div>
      <div className="field"><label>Person</label><select className="input" value={d.pid} onChange={set('pid')}>{opts.map(p => <option key={p.id} value={p.id}>{p.sno}. {p.name}</option>)}</select></div>
      <div className="field"><label>KPI</label><input className="input" value={d.name} onChange={set('name')} placeholder="e.g. Weekly review compliance" /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 'var(--space-3)' }}>
        <div className="field"><label>Frequency</label><select className="input" value={d.freq} onChange={set('freq')}>{FREQS.map(f => <option key={f}>{f}</option>)}</select></div>
        <div className="field"><label>UOM</label><select className="input" value={d.uom} onChange={e => { let v = e.target.value; if (v === 'Other…') { v = (prompt('Unit of measurement:', '') || '').trim(); if (!v) return; } setD(x => ({ ...x, uom: v })); }}>{uomList.map(u => <option key={u}>{u}</option>)}</select></div>
        <div className="field"><label>Monthly target</label><input className="input" type="number" value={d.monthly} onChange={set('monthly')} /></div>
        <div className="field"><label>Min % to attain</label><input className="input" type="number" value={d.min} onChange={set('min')} /></div>
      </div>
      <div className="dialog-body">Per day = monthly target ÷ working days. Weight, approval and tracker settings are under Edit KPIs.</div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={!d.name.trim() || !d.pid || d.monthly === ''}>Add KPI</button>
      </div>
    </Dialog>
  );
}

export function TeamDialog({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const { data, me } = ctx;
  const [pw, setPw] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [hol, setHol] = useState({ date: '', name: '' });
  const users = [...data.people].filter(u => u.active).sort((a, b) => (a.role === 'management') === (b.role === 'management') ? (+a.sno || 0) - (+b.sno || 0) : a.role === 'management' ? 1 : -1);
  const cal = data.calendar;

  const updUser = (id: string, patch: Record<string, unknown>, label: string) => {
    const u0 = data.people.find(u => u.id === id);
    ctx.audit('Login changed', `${u0?.name}: ${label}`);
    const sync: Record<string, unknown> = {}; ['name', 'designation', 'sno'].forEach(k => { if (k in patch) sync[k] = patch[k]; });
    ctx.mutate(d => ({ ...d, people: d.people.map(u => u.id === id ? { ...u, ...patch, viewAll: 'view_all' in patch ? !!patch.view_all : u.viewAll, reportsTo: 'reports_to' in patch ? patch.reports_to as string : u.reportsTo } : u) }),
      async () => {
        await api.updPerson(id, patch);
        if (Object.keys(sync).length) for (const mk of Object.keys(data.months)) if (data.months[mk].people.some(p => p.id === id)) await api.updMonthPerson(mk, id, sync);
        await ctx.reload();
      });
  };
  const setPassword = async (id: string) => {
    const v = (pw[id] || '').trim(); if (v.length < 6) return ctx.toast('Use at least 6 characters.', true);
    setBusy(id);
    try { await api.adminUsers({ action: 'set_password', person_id: id, password: v }); setPw(p => ({ ...p, [id]: '' })); await ctx.reload(); ctx.toast('Password set'); }
    catch (e) { ctx.toast((e as Error).message, true); }
    setBusy('');
  };
  const removeLogin = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}'s login? Their KPI data is kept.`)) return;
    try { await api.adminUsers({ action: 'remove_login', person_id: id }); await ctx.reload(); ctx.toast('Login removed'); } catch (e) { ctx.toast((e as Error).message, true); }
  };
  const deactivate = (id: string, name: string) => { if (confirm(`Remove ${name} from the team list? Their past data is kept.`)) updUser(id, { active: false }, 'removed from team'); };
  const addUser = async () => {
    const n = Math.max(0, ...data.people.map(u => +u.sno || 0)) + 1, id = 'u' + uid();
    try {
      await api.addPerson({ id, sno: n, name: 'NEW OFFICIAL', designation: '', role: 'member' });
      for (const mk of Object.keys(data.months).filter(k => k >= ctx.eng.mk())) await api.addMonthPerson(mk, { person_id: id, sno: n, name: 'NEW OFFICIAL', designation: '' });
      ctx.audit('Person added', 'NEW OFFICIAL'); await ctx.reload(); ctx.toast('Added — set their name, then a password');
    } catch (e) { ctx.toast((e as Error).message, true); }
  };
  const setCal = (c: Calendar, label: string) => { ctx.audit('Calendar changed', label); ctx.mutate(d => ({ ...d, calendar: c }), () => api.setSetting('calendar', c)); };
  const setScoring = (patch: Partial<typeof data.settings>) => { const s = { ...data.settings, ...patch }; ctx.audit('Scoring changed', JSON.stringify(patch)); ctx.mutate(d => ({ ...d, settings: s }), () => api.setSetting('scoring', s)); };

  return (
    <Dialog onClose={onClose} width="min(1180px,96vw)">
      <div className="dialog-title">Team &amp; logins</div>
      <div className="dialog-body">Each official signs in with their name and password and sees only their own KPIs. Officials marked “Sees all” can view every official's sheet but only edit their own. Management sees and edits everything. Changes save instantly.</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 1080, color: '#000' }}>
          <thead><tr><th style={{ width: 70 }}>S.No</th><th>Name</th><th>Designation</th><th style={{ width: 140 }}>Role</th><th style={{ width: 70 }}>Sees all</th><th style={{ width: 170 }}>Reports to</th><th style={{ width: 240 }}>Password</th><th style={{ width: 48 }} /></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td><input className="input" type="number" defaultValue={u.sno} onBlur={e => +e.target.value !== u.sno && updUser(u.id, { sno: +e.target.value || 0 }, `S.No → ${e.target.value}`)} /></td>
                <td><input className="input" defaultValue={u.name} onBlur={e => e.target.value.trim() && e.target.value !== u.name && updUser(u.id, { name: e.target.value.trim() }, `name → ${e.target.value}`)} /></td>
                <td><input className="input" defaultValue={u.designation} onBlur={e => e.target.value !== u.designation && updUser(u.id, { designation: e.target.value }, `designation → ${e.target.value}`)} /></td>
                <td><select className="input" value={u.role} disabled={u.id === me.id} onChange={e => updUser(u.id, { role: e.target.value }, `role → ${e.target.value}`)}><option value="member">Official</option><option value="management">Management</option></select></td>
                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={u.viewAll || u.role === 'management'} disabled={u.role === 'management'} onChange={e => updUser(u.id, { view_all: e.target.checked }, `sees all → ${e.target.checked}`)} /></td>
                <td><select className="input" value={u.reportsTo || ''} onChange={e => updUser(u.id, { reports_to: e.target.value || null }, `reports to → ${data.people.find(x => x.id === e.target.value)?.name || 'nobody'}`)}><option value="">—</option>{users.filter(x => x.id !== u.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
                <td><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input className="input" type="password" autoComplete="new-password" placeholder={u.hasLogin ? 'Login set — new password' : 'No login yet — set password'} value={pw[u.id] || ''} onChange={e => setPw(p => ({ ...p, [u.id]: e.target.value }))} style={{ minWidth: 0 }} />
                  <button className="btn btn-secondary" onClick={() => setPassword(u.id)} disabled={!(pw[u.id] || '').trim() || busy === u.id} style={{ padding: '4px 10px' }}>{busy === u.id ? '…' : 'Set'}</button>
                  {u.hasLogin && u.id !== me.id && <button className="btn btn-ghost" onClick={() => removeLogin(u.id, u.name)} title="Remove login" style={{ padding: 4 }}><Icon n="user-minus" /></button>}
                </div></td>
                <td><button className="btn btn-ghost" onClick={() => deactivate(u.id, u.name)} disabled={u.id === me.id} title="Remove from team" style={{ padding: 4 }}><Icon n="trash" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="col" style={{ gap: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-neutral-300)' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Working calendar</div>
        <div style={{ fontSize: 13 }}>Targets use working days only. Days off and holidays are shaded on the KPI sheet and not counted.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', fontSize: 14 }}>
          {DOW.map((lbl, i) => <label key={lbl} style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={(cal.off || []).includes(i)} onChange={e => { const off = new Set(cal.off || []); if (e.target.checked) off.add(i); else off.delete(i); setCal({ ...cal, off: [...off].sort() }, `${lbl} ${e.target.checked ? 'set as day off' : 'set as working day'}`); }} />{lbl} off</label>)}
        </div>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <input className="input" type="date" value={hol.date} onChange={e => setHol(h => ({ ...h, date: e.target.value }))} style={{ width: 'auto' }} />
          <input className="input" value={hol.name} onChange={e => setHol(h => ({ ...h, name: e.target.value }))} placeholder="Holiday name" style={{ width: 'auto' }} />
          <button className="btn btn-secondary" disabled={!hol.date || (cal.holidays || []).some(x => x.date === hol.date)} onClick={() => { setCal({ ...cal, holidays: [...(cal.holidays || []), { date: hol.date, name: hol.name.trim() }] }, `Holiday added: ${fmtD(hol.date)} ${hol.name}`); setHol({ date: '', name: '' }); }}>Add holiday</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {[...(cal.holidays || [])].sort((a, b) => a.date < b.date ? -1 : 1).map(x => <span key={x.date} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '2px 4px 2px 8px', background: 'var(--color-neutral-100)', fontSize: 13 }}>{fmtD(x.date)}{x.name ? ' · ' + x.name : ''}<button className="btn btn-ghost" onClick={() => setCal({ ...cal, holidays: cal.holidays.filter(y => y.date !== x.date) }, `Holiday removed: ${fmtD(x.date)}`)} style={{ padding: '0 4px', minHeight: 0 }}><Icon n="x" /></button></span>)}
        </div>
      </div>
      <div className="col" style={{ gap: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-neutral-300)' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Scoring &amp; reminders</div>
        <div className="row" style={{ fontSize: 14 }}>
          <label className="row" style={{ gap: 6 }}>Overall score<select className="input" value={data.settings.scoring} onChange={e => setScoring({ scoring: e.target.value as 'Weighted' })} style={{ width: 'auto' }}><option>Weighted</option><option>Equal weights</option></select></label>
          <label className="row" style={{ gap: 6 }}>▼ arrow when<select className="input" value={data.settings.arrowRule} onChange={e => setScoring({ arrowRule: e.target.value as 'Below min %' })} style={{ width: 'auto' }}><option>Below min %</option><option>Below 100%</option></select></label>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={data.settings.highlightBelowMin} onChange={e => setScoring({ highlightBelowMin: e.target.checked })} />Show ▼ arrows</label>
          <label className="row" style={{ gap: 6 }}>Daily reminder at<input className="input" type="time" defaultValue={data.remindAt} onBlur={e => e.target.value && e.target.value !== data.remindAt && ctx.mutate(d => ({ ...d, remindAt: e.target.value }), () => api.setSetting('remind_at', e.target.value))} style={{ width: 'auto' }} /></label>
        </div>
      </div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={addUser}><Icon n="user-plus" />Add person</button>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Dialog>
  );
}
