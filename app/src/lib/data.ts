// Data access: loads the shared Supabase data into the engine's snapshot shape and
// writes changes back. Row-level security on the server decides what each user can see and change.
import { supabase } from './supabase';
import type { Calendar, Entry, Kpi, MonthPerson, Settings, Snapshot } from './engine';

export interface Person { id: string; sno: number; name: string; designation: string; role: 'member' | 'management'; viewAll: boolean; reportsTo: string | null; hasLogin: boolean; authUid: string | null; active: boolean }
export type Data = Omit<Snapshot, 'date' | 'meetings' | 'cgoals'> & { people: Person[]; remindAt: string };

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function all(table: string, select = '*', order?: string): Promise<Row[]> {
  const out: Row[] = []; const size = 1000;
  for (let from = 0; ; from += size) {
    let q = supabase.from(table).select(select).range(from, from + size - 1);
    if (order) q = q.order(order);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data as unknown as Row[]));
    if (!data || data.length < size) break;
  }
  return out;
}

export const kpiFromRow = (r: Row): Kpi => ({
  id: r.id as string, name: r.name as string, freq: r.freq as string, uom: r.uom as string, monthly: Number(r.monthly), min: Number(r.min),
  prorate: !!r.prorate, agg: r.agg as 'sum' | 'latest', lower: !!r.lower, weight: Number(r.weight), na: !!r.na, approval: !!r.approval,
  module: (r.module || '') as Kpi['module'], meetRule: (r.meet_rule as string) || '', meetKw: (r.meet_kw as string) ?? undefined, needMom: !!r.need_mom,
  perDayOv: num(r.per_day_ov), tillOv: num(r.till_ov),
});
const KPI_COLS: Record<string, string> = { name: 'name', freq: 'freq', uom: 'uom', monthly: 'monthly', min: 'min', prorate: 'prorate', agg: 'agg', lower: 'lower', weight: 'weight', na: 'na', approval: 'approval', module: 'module', meetRule: 'meet_rule', meetKw: 'meet_kw', needMom: 'need_mom', perDayOv: 'per_day_ov', tillOv: 'till_ov' };
export const kpiToRow = (patch: Partial<Kpi>) => {
  const o: Row = {};
  Object.entries(patch).forEach(([k, v]) => {
    const c = KPI_COLS[k]; if (!c) return;
    if (['monthly', 'min', 'weight'].includes(k)) o[c] = v === '' || v === null || v === undefined || isNaN(+(v as number)) ? 0 : +(v as number);
    else if (k === 'perDayOv' || k === 'tillOv') o[c] = v === '' || v === null || v === undefined || isNaN(+(v as number)) ? null : +(v as number);
    else o[c] = v;
  });
  return o;
};
export const entryFromRow = (r: Row): Entry => ({
  id: r.id as string, pid: r.person_id as string, by: (r.by_person as string) || null, date: r.d as string, kid: r.kid as string,
  activity: (r.activity as string) || '', qty: num(r.qty), link: (r.link as string) || '', status: r.status as string,
  due: (r.due as string) || '', blocker: (r.blocker as string) || '', next: (r.next as string) || '', goalId: r.goal_id as string, todoId: r.todo_id as string,
  reviewedBy: r.reviewed_by as string, reviewedAt: r.reviewed_at as string, editedBy: r.edited_by as string, editedAt: r.edited_at as string,
});

export async function loadAll(): Promise<Data> {
  const [people, months, mp, kpis, log, remarks, entries, subs, settings] = await Promise.all([
    all('people', 'id, sno, name, designation, role, view_all, reports_to, auth_uid, active', 'sno'),
    all('months', 'mk'), all('month_people', '*', 'sno'), all('kpis', '*', 'pos'),
    all('daily_log', 'kpi_id, d, ach'), all('remarks'), all('entries', '*', 'created_at'), all('submissions'), all('settings'),
  ]);
  const M: Record<string, { people: MonthPerson[] }> = {};
  months.forEach(m => { M[m.mk as string] = { people: [] }; });
  mp.forEach(p => { (M[p.mk as string] ||= { people: [] }).people.push({ id: p.person_id as string, sno: p.sno as number, name: p.name as string, designation: p.designation as string, kpis: [] }); });
  kpis.forEach(k => { const pe = M[k.mk as string]?.people.find(p => p.id === k.person_id); if (pe) pe.kpis.push(kpiFromRow(k)); });
  Object.values(M).forEach(mo => mo.people.sort((a, b) => (+a.sno || 0) - (+b.sno || 0)));
  const L: Data['log'] = {};
  log.forEach(r => { (L[r.d as string] ||= {})[r.kpi_id as string] = { ach: r.ach === null ? '' : Number(r.ach) }; });
  const R: Data['remarks'] = {};
  remarks.forEach(r => { (R[r.mk as string] ||= {})[r.kpi_id as string] = r.text as string; });
  const S: Data['submissions'] = {};
  subs.forEach(r => { (S[r.person_id as string] ||= {})[r.d as string] = { at: r.at as string, by: r.by_person as string }; });
  const set: Record<string, unknown> = {}; settings.forEach(r => { set[r.key as string] = r.value; });
  const sc = (set.scoring || {}) as Partial<Settings>;
  return {
    people: people.map(p => ({ id: p.id as string, sno: p.sno as number, name: p.name as string, designation: p.designation as string, role: p.role as Person['role'], viewAll: !!p.view_all, reportsTo: (p.reports_to as string) || null, hasLogin: !!p.auth_uid, authUid: (p.auth_uid as string) || null, active: !!p.active })),
    months: M, log: L, remarks: R, entries: entries.map(entryFromRow).reverse(), submissions: S,
    calendar: (set.calendar as Calendar) || { off: [0], holidays: [] },
    settings: { scoring: sc.scoring || 'Weighted', arrowRule: sc.arrowRule || 'Below min %', highlightBelowMin: sc.highlightBelowMin !== false },
    remindAt: (set.remind_at as string) || '18:00',
  };
}

const ok = <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };

export const api = {
  audit: (action: string, detail: string) => supabase.rpc('log_audit', { p_action: action, p_detail: detail }).then(ok),
  setDay: async (pid: string, kid: string, d: string, val: string) => {
    if (val === '' || val === null) return ok(await supabase.from('daily_log').delete().eq('kpi_id', kid).eq('d', d));
    return ok(await supabase.from('daily_log').upsert({ kpi_id: kid, d, person_id: pid, ach: +val }));
  },
  setRemark: async (mk: string, kid: string, pid: string, text: string) => ok(await supabase.from('remarks').upsert({ mk, kpi_id: kid, person_id: pid, text })),
  updKpi: async (mk: string, id: string, patch: Partial<Kpi>) => ok(await supabase.from('kpis').update(kpiToRow(patch)).eq('mk', mk).eq('id', id)),
  addKpi: async (mk: string, pid: string, pos: number, k: Kpi) => ok(await supabase.from('kpis').insert({ mk, id: k.id, person_id: pid, pos, ...kpiToRow(k) })),
  delKpi: async (mk: string, id: string) => ok(await supabase.from('kpis').delete().eq('mk', mk).eq('id', id)),
  updMonthPerson: async (mk: string, pid: string, patch: { sno?: number; name?: string; designation?: string }) => ok(await supabase.from('month_people').update(patch).eq('mk', mk).eq('person_id', pid)),
  addMonthPerson: async (mk: string, p: { person_id: string; sno: number; name: string; designation: string }) => ok(await supabase.from('month_people').insert({ mk, ...p })),
  delMonthPerson: async (mk: string, pid: string) => ok(await supabase.from('month_people').delete().eq('mk', mk).eq('person_id', pid)),
  createMonth: async (target: string, src: string | null) => ok(await supabase.rpc('create_month', { p_target: target, p_src: src || '' })),
  addEntry: async (e: Record<string, unknown>) => entryFromRow(ok(await supabase.rpc('add_entry', { p: e })) as Row),
  setEntryStatus: async (id: string, status: string) => entryFromRow(ok(await supabase.rpc('set_entry_status', { p_id: id, p_status: status })) as Row),
  updateEntry: async (id: string, p: Record<string, unknown>) => entryFromRow(ok(await supabase.rpc('update_entry', { p_id: id, p })) as Row),
  deleteEntry: async (id: string) => ok(await supabase.rpc('delete_entry', { p_id: id })),
  setSub: async (pid: string, d: string, by: string, on: boolean) => on
    ? ok(await supabase.from('submissions').upsert({ person_id: pid, d, at: new Date().toISOString(), by_person: by }))
    : ok(await supabase.from('submissions').delete().eq('person_id', pid).eq('d', d)),
  setSetting: async (key: string, value: unknown) => ok(await supabase.from('settings').upsert({ key, value })),
  updPerson: async (id: string, patch: Partial<{ sno: number; name: string; designation: string; role: string; view_all: boolean; reports_to: string | null; active: boolean }>) => ok(await supabase.from('people').update(patch).eq('id', id)),
  addPerson: async (p: { id: string; sno: number; name: string; designation: string; role: string }) => ok(await supabase.from('people').insert(p)),
  importBackup: async (b: unknown) => ok(await supabase.rpc('import_backup', { b })),
  auditLog: async () => ok(await supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(300)) as Row[],
  auditCount: async () => (await supabase.from('audit_log').select('id', { count: 'exact', head: true })).count || 0,
  adminUsers: async (body: Record<string, string>) => {
    const { data, error } = await supabase.functions.invoke('admin-users', { body });
    if (error) {
      let msg = error.message;
      try { const j = await (error as unknown as { context: Response }).context.json(); if (j?.error) msg = j.error; } catch { /* keep message */ }
      throw new Error(msg);
    }
    return data;
  },
};
