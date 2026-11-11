import { useState } from 'react';
import type { Ctx } from '../ctx';
import { api } from '../lib/data';
import type { Entry } from '../lib/engine';
import { bumpLocal, entriesLocal } from '../lib/local';
import { dimOf, fmtShort, iso, MONTHS, OFFICIAL_STATUSES, OPEN, pad, parse, STATUSES } from '../lib/util';
import { Icon } from '../ui';

const EMPTY = { kid: '', activity: '', qty: '', link: '', status: 'Completed', due: '', blocker: '', next: '' };

export default function BriefPage({ ctx }: { ctx: Ctx }) {
  const { eng, data, isMgmt, P, vp, vUser, me, date } = ctx;
  const mk = eng.mk(), dim = dimOf(mk), [y, m] = mk.split('-').map(Number);
  const [form, setForm] = useState({ ...EMPTY, date });
  const [evDraft, setEvDraft] = useState(iso(new Date()));
  const [evDate, setEvDate] = useState('');
  const [edit, setEdit] = useState<{ id: string; d: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const kmap = eng.kmapAll();
  const canWrite = isMgmt || vp === me.id;
  const todayIso = iso(new Date(ctx.nowTick));
  const fDate = form.date.slice(0, 7) === mk ? form.date : date;
  const set = (k: string) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }));

  const kpiOpts = P.flatMap(p => p.kpis.filter(k => !k.module).map(k => ({ id: k.id, label: (P.length > 1 ? p.name + ' — ' : '') + k.name })));
  const fk = kmap[form.kid];
  const holiday = !!fDate && !eng.isWork(fDate);
  const invalid = !canWrite || busy || !fDate || holiday || (form.kid === '__other' ? !form.activity.trim() : (!kpiOpts.some(o => o.id === form.kid) || form.qty === '' || isNaN(+form.qty)));

  const addEntry = async () => {
    const dup = form.kid !== '__other' && data.entries.some(x => x.kid === form.kid && x.date === fDate && (x.activity || '').trim().toLowerCase() === form.activity.trim().toLowerCase() && +(x.qty as number) === +form.qty && x.status !== 'Rejected');
    if (dup && !confirm('An identical activity is already logged for this date. Add it again?')) return;
    setBusy(true);
    try {
      const en = await api.addEntry({ person_id: vp, d: fDate, kid: form.kid, activity: form.activity.trim(), qty: form.kid === '__other' && form.qty === '' ? '' : form.qty, link: form.link.trim(), status: form.status, due: form.due, blocker: form.blocker.trim(), next: form.next.trim() });
      ctx.audit('Activity added', `${vUser?.name || ''} · ${form.kid === '__other' ? 'Others' : (fk?.name || '').trim()}: “${en.activity || '—'}” (${en.qty ?? ''} ${fk?.uom || ''}) — ${en.status}`);
      ctx.mutate(d => { const n = entriesLocal(es => [en, ...es])(d); return en.status === 'Completed' ? bumpLocal(n, en.date, en.kid, +(en.qty as number) || 0) : n; }, async () => null,
        en.status === 'Pending approval' ? 'Added — waiting for management approval' : 'Added');
      setForm(f => ({ ...EMPTY, date: f.date, kid: f.kid, status: f.status }));
    } catch (e) { ctx.toast((e as Error).message, true); }
    setBusy(false);
  };
  const replaceEntry = (en: Entry) => ctx.reload().then(() => en);
  const setStatus = async (en: Entry, v: string) => {
    try { const n = await api.setEntryStatus(en.id, v); ctx.audit(en.status === 'Pending approval' && n.status === 'Completed' ? 'Approved' : n.status === 'Rejected' ? 'Rejected' : 'Status changed', `${vUser?.name || ''} · ${(kmap[en.kid]?.name || 'Others').trim()}: “${en.activity || '—'}” ${en.status} → ${n.status}`); await replaceEntry(n); if (n.status !== v) ctx.toast('Sent for management approval'); }
    catch (e) { ctx.toast((e as Error).message, true); await ctx.reload(); }
  };
  const save = async (en: Entry) => {
    if (!edit) return;
    try { await api.updateEntry(en.id, edit.d); ctx.audit('Activity edited', `${(kmap[en.kid]?.name || 'Others').trim()}: “${en.activity}”`); setEdit(null); await ctx.reload(); ctx.toast('Saved'); }
    catch (e) { ctx.toast((e as Error).message, true); }
  };
  const del = async (en: Entry) => {
    if (!confirm('Delete this activity?')) return;
    ctx.audit('Activity deleted', `${(kmap[en.kid]?.name || 'Others').trim()}: “${en.activity || '—'}” (${en.qty ?? ''} ${kmap[en.kid]?.uom || ''}, ${en.status})`);
    ctx.mutate(d => { const n = entriesLocal(es => es.filter(x => x.id !== en.id))(d); return en.status === 'Completed' ? bumpLocal(n, en.date, en.kid, -(+(en.qty as number) || 0)) : n; }, () => api.deleteEntry(en.id), 'Deleted');
  };

  const mine = data.entries.filter(en => en.pid === vp);
  const list = (evDate ? mine.filter(en => en.date === evDate) : mine.filter(en => en.date.slice(0, 7) === mk)).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const ipCount = mine.filter(en => en.date.slice(0, 7) === mk && en.status === 'In progress').length;
  const kpiOptsFor = (en: Entry) => [{ id: '__other', label: 'Others — not counted in any KPI' }, ...P.flatMap(p => p.kpis.filter(x => !x.module || x.id === en.kid).map(x => ({ id: x.id, label: (P.length > 1 ? p.name + ' — ' : '') + x.name.trim() })))];

  return (
    <section className="col" style={{ gap: 'var(--space-4)' }}>
      <header className="col" style={{ gap: 'var(--space-2)' }}>
        <div className="kicker">Pillars KPI Monitoring · {vUser?.name || ''}</div>
        <h1 className="h1">Daily Brief</h1>
        <div className="rail">
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><span style={{ fontStyle: 'italic' }}>Month</span>
            <input className="input" type="month" value={mk} onChange={e => e.target.value && ctx.goTo(e.target.value)} style={{ width: 'auto', minHeight: 36, padding: '3px 8px' }} /></label>
          <span>{ipCount ? `${ipCount} item${ipCount > 1 ? 's' : ''} in progress this month (not yet counted).` : 'Only Completed work counts toward the score.'}</span>
        </div>
      </header>
      <div className="col" style={{ gap: 'var(--space-1)' }}>
        <h2 className="h2">Record achievement</h2>
        <div style={{ fontSize: 14, fontStyle: 'italic', maxWidth: '110ch' }}>Your one daily log for every KPI. Only <b>Completed</b> work adds to the score; KPIs marked “needs approval” wait for management. KPIs fed by a tracker (Meeting Hub, Goals, team score) aren't listed here.</div>
      </div>
      {!canWrite && <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>You're viewing {vUser?.name}'s Daily Brief. Only they or management can add entries.</p>}
      {canWrite && (
        <div data-noprint="1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 'var(--space-3)', alignItems: 'end', maxWidth: 1300 }}>
          <div className="field"><label>Date</label><input className="input" type="date" value={fDate} min={mk + '-01'} max={mk + '-' + pad(dim)} onChange={set('date')} />{holiday && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent-2-700)', marginTop: 2 }}>Holiday — entries are not counted. Pick a working day.</div>}</div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label>KPI</label>
            <select className="input" value={form.kid} onChange={set('kid')}><option value="">Select KPI…</option>{kpiOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}<option value="__other">Others — not counted in any KPI</option></select></div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label>Detailed activity</label><input className="input" value={form.activity} onChange={set('activity')} placeholder="What was done" /></div>
          <div className="field"><label>UOM</label><input className="input" value={form.kid === '__other' ? '—' : fk?.uom || ''} readOnly style={{ background: 'transparent' }} /></div>
          <div className="field"><label>Achieved</label><input className="input" type="number" value={form.qty} onChange={set('qty')} /></div>
          <div className="field"><label>Status</label><select className="input" value={form.status} onChange={set('status')}>{(isMgmt ? STATUSES : OFFICIAL_STATUSES).map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label>Reference link (Google Drive)</label><input className="input" type="url" value={form.link} onChange={set('link')} placeholder="https://drive.google.com/…" /></div>
          <div className="field"><label>Due date</label><input className="input" type="date" value={form.due} onChange={set('due')} /></div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label>Blocker / dependency</label><input className="input" value={form.blocker} onChange={set('blocker')} placeholder="Optional" /></div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label>Next action</label><input className="input" value={form.next} onChange={set('next')} placeholder="Optional" /></div>
          <button className="btn btn-primary" onClick={addEntry} disabled={invalid} style={{ minHeight: 44 }}><Icon n="plus" />{busy ? 'Adding…' : 'Add entry'}</button>
        </div>
      )}
      <div data-noprint="1" className="row" style={{ alignItems: 'end', maxWidth: 1300, paddingTop: 'var(--space-3)' }}>
        <div className="field"><label>View date</label><input className="input" type="date" value={evDraft} onChange={e => setEvDraft(e.target.value)} style={{ width: 'auto' }} /></div>
        <button className="btn btn-primary" onClick={() => { setEvDate(evDraft); if (evDraft) ctx.goTo(evDraft.slice(0, 7)); }} disabled={!evDraft} style={{ minHeight: 44 }}><Icon n="eye" />View</button>
        <button className="btn btn-secondary" onClick={() => { const t = iso(new Date()); setEvDate(t); setEvDraft(t); ctx.goTo(t.slice(0, 7)); }} style={{ minHeight: 44 }}><Icon n="calendar-check" />Today</button>
        <button className="btn btn-ghost" onClick={() => setEvDate('')} disabled={!evDate} style={{ minHeight: 44 }}>Show whole month</button>
        <div style={{ flex: 1, minWidth: 200, fontSize: 15, alignSelf: 'center' }}><b>{evDate ? parse(evDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : 'Whole month · ' + MONTHS[m - 1] + ' ' + y}</b> · {list.length} entr{list.length === 1 ? 'y' : 'ies'}</div>
      </div>
      {!!evDate && !list.length && <p style={{ margin: 0, fontSize: 15 }}>No Daily Brief entries on this date.</p>}
      {!!list.length && (
        <div style={{ overflowX: 'auto', maxWidth: 1300 }}>
          <table className="table" style={{ minWidth: 720, color: '#000' }}>
            <thead><tr><th style={{ width: 90 }}>Date</th><th>KPI</th><th>Detailed activity</th><th style={{ width: 60 }}>UOM</th><th style={{ width: 84, textAlign: 'right' }}>Achieved</th><th style={{ width: 170 }}>Status</th><th style={{ width: 220 }}>Due · blocker · next</th><th style={{ width: 150 }}>Reference</th><th data-noprint="1" style={{ width: 76 }} /></tr></thead>
            <tbody>
              {list.map(en => {
                const k = kmap[en.kid], st = en.status || 'Completed', od = !!en.due && en.due < todayIso && OPEN(st);
                const canEdit = isMgmt || en.by === me.id || en.pid === me.id;
                const base = isMgmt ? STATUSES : OFFICIAL_STATUSES;
                const target = en.kid === '__other' ? 'Others (not in KPI)' : (k?.name || '(deleted KPI)');
                if (edit && edit.id === en.id) {
                  const e = edit.d, setE = (f: string) => (ev: { target: { value: string } }) => setEdit({ ...edit, d: { ...edit.d, [f]: ev.target.value } });
                  const bad = !e.date || (e.kid !== '__other' && (e.qty === '' || isNaN(+e.qty))) || (e.date !== en.date && !eng.isWork(e.date));
                  return (
                    <tr key={en.id} style={{ background: 'var(--color-accent-100)' }}>
                      <td>{!eng.isWork(e.date) && <div style={{ fontSize: 11, lineHeight: 1.3, marginBottom: 4, padding: '2px 4px', background: 'var(--color-accent-2-100)' }}>{e.date === en.date ? 'This date is a holiday — the entry is kept but not counted.' : 'That date is a holiday — pick a working day.'}</div>}<input type="date" value={e.date} onChange={setE('date')} className="mini-in" /></td>
                      <td><select value={e.kid} onChange={setE('kid')} className="mini-in">{kpiOptsFor(en).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></td>
                      <td><textarea value={e.activity} onChange={setE('activity')} rows={2} className="mini-in" style={{ resize: 'vertical' }} /></td>
                      <td>{e.kid === '__other' ? '—' : kmap[e.kid]?.uom || ''}</td>
                      <td><input type="number" step="any" value={e.qty} onChange={setE('qty')} className="mini-in" style={{ textAlign: 'right' }} /></td>
                      <td style={{ fontSize: 12 }}>{st}</td>
                      <td><div className="col" style={{ gap: 4 }}><input type="date" value={e.due} onChange={setE('due')} className="mini-in" title="Due date" /><input value={e.blocker} onChange={setE('blocker')} placeholder="Blocker" className="mini-in" /><input value={e.next} onChange={setE('next')} placeholder="Next action" className="mini-in" /></div></td>
                      <td><input type="url" value={e.link} onChange={setE('link')} placeholder="Drive / file link" className="mini-in" /></td>
                      <td data-noprint="1"><div className="col" style={{ gap: 4 }}><button className="btn btn-primary" onClick={() => save(en)} disabled={bad} title="Save" style={{ padding: '4px 6px' }}><Icon n="check" /></button><button className="btn btn-ghost" onClick={() => setEdit(null)} title="Cancel" style={{ padding: '4px 6px' }}><Icon n="x" /></button></div></td>
                    </tr>
                  );
                }
                return (
                  <tr key={en.id}>
                    <td>{fmtShort(en.date)}</td><td>{target}</td><td>{en.activity || '—'}</td><td>{en.kid === '__other' ? '' : k?.uom || ''}</td><td style={{ textAlign: 'right' }}>{en.qty ?? ''}</td>
                    <td><div className="col" style={{ gap: 4 }}>
                      <select value={st} disabled={!canWrite} onChange={e => setStatus(en, e.target.value)} title="Only completed work counts toward the score" style={{ border: `1px solid ${st === 'Completed' ? 'var(--color-accent-300)' : st === 'Rejected' ? 'var(--color-neutral-300)' : 'var(--color-accent-2-300)'}`, background: st === 'Completed' ? 'var(--color-accent-100)' : st === 'Rejected' ? 'var(--color-neutral-100)' : 'var(--color-accent-2-100)', font: 'inherit', fontSize: 13, padding: '4px 6px', color: '#000', borderRadius: 'var(--radius-sm)' }}>
                        {(base.includes(st) ? base : [st, ...base]).map(s => <option key={s}>{s}</option>)}
                      </select>
                      {isMgmt && st === 'Pending approval' && <div data-noprint="1" style={{ display: 'flex', gap: 4 }}><button className="btn btn-primary" onClick={() => setStatus(en, 'Completed')} style={{ padding: '2px 8px', fontSize: 12 }}>Approve</button><button className="btn btn-secondary" onClick={() => setStatus(en, 'Rejected')} style={{ padding: '2px 8px', fontSize: 12 }}>Reject</button></div>}
                      {en.reviewedBy && <span style={{ fontSize: 11, fontStyle: 'italic' }}>{st === 'Rejected' ? 'Rejected' : 'Approved'} by {en.reviewedBy}</span>}
                    </div></td>
                    <td style={{ fontSize: 13 }}>
                      {en.due && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span>Due {fmtShort(en.due)}</span>{od && <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', background: 'var(--color-accent-2-100)' }}>OVERDUE {Math.round((+parse(todayIso) - +parse(en.due)) / 864e5)}d</span>}</div>}
                      {en.blocker && <div><b>Blocker:</b> {en.blocker}</div>}
                      {en.next && <div><b>Next:</b> {en.next}</div>}
                    </td>
                    <td>{en.link && <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}><button className="btn btn-ghost" data-noprint="1" onClick={() => ctx.openDialog('doc', { docUrl: en.link })} style={{ fontSize: 13, padding: '4px 6px' }}><Icon n="eye" />View</button><a href={en.link} target="_blank" rel="noopener" style={{ fontSize: 13 }}>Open</a></div>}</td>
                    <td data-noprint="1"><div style={{ display: 'flex', gap: 2 }}>
                      {canEdit && <button className="btn btn-ghost" onClick={() => setEdit({ id: en.id, d: { date: en.date, kid: en.kid, activity: en.activity || '', qty: String(en.qty ?? ''), due: en.due || '', blocker: en.blocker || '', next: en.next || '', link: en.link || '' } })} title="Edit entry" style={{ padding: 4 }}><Icon n="pencil-simple" /></button>}
                      {canEdit && <button className="btn btn-ghost" onClick={() => del(en)} title="Delete entry" style={{ padding: 4 }}><Icon n="trash" /></button>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
