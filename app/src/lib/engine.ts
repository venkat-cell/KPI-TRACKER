// KPI calculation engine — one place for every formula, shared by the sheet, cards,
// performance views, overview and Excel export. Ported rule-for-rule from the prototype.
//
//   Per Day          = monthly target ÷ working days in the month (Sundays/holidays excluded)
//   Target Till Date = per day × working days elapsed (whole units only when per day < 1)
//   ACHVD Till Date  = sum of daily figures on working days up to the report date
//   DIFF             = Target Till Date − ACHVD;  ACHVD % = ACHVD ÷ Target Till Date
//   Overall          = weighted average of eligible KPIs, each capped at 100%
import { addDays, dimOf, pad, parse, MONTHS } from './util';

export type Module = '' | 'meeting' | 'cascade' | 'team';
export interface Kpi {
  id: string; name: string; freq: string; uom: string; monthly: number | string; min: number | string; prorate?: boolean;
  agg?: 'sum' | 'latest'; lower?: boolean; weight?: number | string; na?: boolean; approval?: boolean;
  module?: Module; meetRule?: string; meetKw?: string | null; needMom?: boolean;
  perDayOv?: number | string | null; tillOv?: number | string | null;
}
export interface MonthPerson { id: string; sno: number; name: string; designation: string; kpis: Kpi[] }
export interface Entry {
  id: string; pid: string; by: string | null; date: string; kid: string; activity: string; qty: number | null; link: string;
  status: string; due: string; blocker: string; next: string; goalId?: string | null; todoId?: string | null;
  reviewedBy?: string | null; reviewedAt?: string | null; editedBy?: string | null; editedAt?: string | null;
}
export interface Meeting { id: string; pid: string; date: string; title: string; dept: string; status: string; mom: string; momDue: string; momDone: string; kpi: string; kid?: string }
export interface CGoal { id: string; pid: string; kid: string; month: string; parent: string; name: string; status: string; pct: number; weight: number | string; cert?: boolean; approved?: boolean; verified?: boolean; deleted?: boolean }
export interface Calendar { off: number[]; holidays: { date: string; name: string }[] }
export interface Settings { scoring: 'Weighted' | 'Equal weights'; arrowRule: 'Below min %' | 'Below 100%'; highlightBelowMin: boolean }
export interface Snapshot {
  date: string;
  months: Record<string, { people: MonthPerson[] }>;
  log: Record<string, Record<string, { ach: number | string }>>;
  remarks: Record<string, Record<string, string>>;
  entries: Entry[];
  submissions: Record<string, Record<string, { at: string; by: string | null }>>;
  calendar: Calendar;
  settings: Settings;
  meetings: Meeting[];
  cgoals: CGoal[];
}
export interface Calc { G: number; H: number; I: number; J: number; K: number; notDue?: boolean; noWork?: boolean; noData?: boolean; mc?: { due: number; ok: number }; team?: number; compPct?: number; cg?: unknown }

export const wavg = (l: { na?: boolean; w: number; pct: number }[]) => {
  const e = l.filter(o => !o.na && o.w > 0); const sw = e.reduce((a, o) => a + o.w, 0);
  return sw ? e.reduce((a, o) => a + Math.min(o.pct, 1) * o.w, 0) / sw : null;
};

export const meetState = (m: Meeting, ref: string) => {
  if (m.status === 'Cancelled') return 'Cancelled';
  if (m.status !== 'Held' && m.date >= ref) return 'Upcoming';
  if (m.date > ref) return 'Upcoming';
  if (m.status !== 'Held') return 'Not held';
  if (m.mom !== 'Completed') return m.momDue && m.momDue < ref ? 'MOM overdue' : 'MOM pending';
  if (m.momDue && m.momDone && m.momDone > m.momDue) return 'MOM late';
  return 'Compliant';
};

export class Engine {
  s: Snapshot;
  private memo = new Map<string, unknown>();
  constructor(s: Snapshot) { this.s = s; }
  private cache<T>(key: string, fn: () => T): T { if (!this.memo.has(key)) this.memo.set(key, fn()); return this.memo.get(key) as T; }

  get date() { return this.s.date; }
  mk() { return this.s.date.slice(0, 7); }
  parts() { const [y, m, d] = this.s.date.split('-').map(Number); return { y, m, d, dim: new Date(y, m, 0).getDate() }; }
  dayKey(i: number) { return this.s.date.slice(0, 8) + pad(i); }
  dayVal(i: number, kid: string): number | string { const e = this.s.log[this.dayKey(i)]; return e && e[kid] && e[kid].ach !== undefined && e[kid].ach !== null ? e[kid].ach : ''; }
  dayValAt(ds: string, kid: string): number | string { const e = this.s.log[ds]; return e && e[kid] && e[kid].ach !== undefined && e[kid].ach !== null ? e[kid].ach : ''; }

  // ── calendar ──
  isWork(ds: string) { const c = this.s.calendar || { off: [0], holidays: [] }; return !(c.off || []).includes(parse(ds).getDay()) && !(c.holidays || []).some(x => x.date === ds); }
  workDays(mk: string) { return this.cache('wd' + mk, () => { let n = 0; const dm = dimOf(mk); for (let i = 1; i <= dm; i++) if (this.isWork(mk + '-' + pad(i))) n++; return n || dm; }); }
  workElapsed(mk: string, d: number) { return this.cache('we' + mk + d, () => { let n = 0; for (let i = 1; i <= d; i++) if (this.isWork(mk + '-' + pad(i))) n++; return n; }); }
  wdBetween(a: string, b: string) { if (!a || !b || b < a) return 0; let n = 0, c = a, g = 0; while (c <= b && g++ < 4000) { if (this.isWork(c)) n++; c = addDays(c, 1); } return n; }

  // ── scoring settings ──
  wOf(k: Kpi) { if (this.s.settings.scoring === 'Equal weights') return 1; return k.weight === undefined || k.weight === '' || k.weight === null ? 1 : Math.max(0, +k.weight || 0); }
  thr(minPct: number | string) { return this.s.settings.arrowRule === 'Below 100%' ? 1 : (+minPct || 0) / 100; }
  ovNum(v: unknown) { return v === '' || v === undefined || v === null || isNaN(+(v as number)) ? null : +(v as number); }
  isLevel(k: Kpi) { return k.agg === 'latest' || k.module === 'team' || k.module === 'cascade'; }

  kmapAll() { return this.cache('kmap', () => { const m: Record<string, Kpi & { pid: string; pname: string }> = {}; Object.values(this.s.months).forEach(mo => mo.people.forEach(p => p.kpis.forEach(k => { m[k.id] = { ...k, pid: p.id, pname: p.name }; }))); return m; }); }
  remFor(kid: string) { const r = this.s.remarks[this.mk()]; return (r && r[kid]) || ''; }

  // ── Meeting Hub links (data arrives with the Meeting Hub module) ──
  hubMeets(pid: string) { return this.s.meetings.filter(m => m.pid === pid); }
  meetHeld(m: Meeting, ref: string) { return m.status === 'Held' && m.date <= ref; }
  meetExtra(kid: string, pid: string, from: string, to: string) { if (!pid) return 0; const ref = this.s.date; return this.hubMeets(pid).filter(m => m.kpi === kid && m.date >= from && m.date <= to && this.meetHeld(m, ref) && this.isWork(m.date)).length; }
  goalMeet(g: CGoal) { if (!g.pid) return null; const L = this.hubMeets(g.pid).filter(m => m.kpi === 'g:' + g.id && m.date.slice(0, 7) === (g.month || m.date.slice(0, 7))); if (!L.length) return null; const ref = this.s.date; return { tot: L.length, ok: L.filter(m => this.meetHeld(m, ref)).length }; }
  meetKw(k: Kpi) { return k.meetKw !== undefined && k.meetKw !== null ? k.meetKw : /\bMIS\b/i.test(k.name || '') ? 'MIS' : ''; }
  meetOwners() { return this.cache('mo', () => { const o: Record<string, { pid: string; k: Kpi }> = {}; const mo = this.s.months[this.mk()]; (mo ? mo.people : []).forEach(p => p.kpis.forEach(k => { if (k.module === 'meeting') o[k.id] = { pid: p.id, k }; })); return o; }); }
  cgKidMap() { const o: Record<string, string> = {}; this.s.cgoals.forEach(g => { if (!g.deleted) o[g.id] = g.kid; }); return o; }
  meetsFor(kid: string): Meeting[] {
    return this.cache('mf' + kid, () => {
      const o = this.meetOwners()[kid]; if (!o) return [];
      const kw = this.meetKw(o.k), needMom = o.k.needMom === true, gk = this.cgKidMap();
      return this.hubMeets(o.pid).filter(m => m.kpi === '*' || (m.kpi && m.kpi.startsWith('g:') ? gk[m.kpi.slice(2)] === kid : m.kpi ? m.kpi === kid : (!kw || (m.title + ' ' + m.dept).toLowerCase().includes(kw.toLowerCase()))))
        .map(m => ({ ...m, kid, mom: !needMom && m.status === 'Held' ? 'Completed' : m.mom, momDue: needMom ? m.momDue : '' }));
    });
  }
  meetCalc(kid: string, from: string, to: string, ref: string) {
    let due = 0, ok = 0;
    this.meetsFor(kid).forEach(m => { if (m.date < from || m.date > to) return; const st = meetState(m, ref); if (st === 'Cancelled' || st === 'Upcoming') return; due++; if (st === 'Compliant') ok++; });
    return { due, ok };
  }
  meetIndex(ref: string) {
    return this.cache('mi' + ref, () => {
      const idx: Record<string, Record<string, { due: number; ok: number }>> = {};
      Object.keys(this.meetOwners()).flatMap(kid => this.meetsFor(kid)).forEach(m => {
        const st = meetState(m, ref), kid = m.kid as string; const o = ((idx[kid] = idx[kid] || {})[m.date] = idx[kid][m.date] || { due: 0, ok: 0 });
        if (st !== 'Cancelled' && st !== 'Upcoming') { o.due++; if (st === 'Compliant') o.ok++; }
      });
      return idx;
    });
  }
  meetEarned(k: Kpi, d: number) {
    const G = this.pace(k, d).G, mk = this.mk(), ix = this.meetIndex(this.s.date)[k.id] || {}, out: Record<string, number> = {}; let I = 0, due = 0, ok = 0;
    for (let i = 1; i <= d; i++) { const ds = mk + '-' + pad(i); if (!this.isWork(ds)) continue; const o = ix[ds] || { due: 0, ok: 0 }; const fr = o.due ? o.ok / o.due : 1; out[ds] = fr * G; I += fr * G; due += o.due; ok += o.ok; }
    return { I, days: out, mc: { due, ok } };
  }

  // ── Goals cascade (data arrives with the Goals module) ──
  cgFor(kid: string, mk: string) { return this.s.cgoals.filter(g => !g.deleted && g.kid === kid && g.month === mk); }
  cgEval(list: CGoal[]) {
    const kids: Record<string, CGoal[]> = {}; list.forEach(g => { const p = g.parent || ''; (kids[p] = kids[p] || []).push(g); });
    type R = { work: number | null; credit: number | null; W?: number; allDone?: boolean; anyHold?: boolean; leaf?: boolean; hold?: boolean };
    const memo: Record<string, R> = {}, wt = (g: CGoal) => (+g.weight > 0 ? +g.weight : (g.weight === '' || g.weight === undefined ? 1 : 0));
    const agg = (ch: CGoal[]): R => {
      const rs = ch.filter(c => c.status !== 'Cancelled').map(c => [c, ev(c)] as [CGoal, R]).filter(([, x]) => x.work !== null);
      const W = rs.reduce((a, [c]) => a + wt(c), 0);
      return W ? { work: rs.reduce((a, [c, x]) => a + wt(c) * (x.work as number), 0) / W, credit: rs.reduce((a, [c, x]) => a + wt(c) * (x.credit as number), 0) / W, W, allDone: rs.every(([, x]) => (x.credit as number) >= 0.9999), anyHold: rs.some(([, x]) => x.hold) } : { work: null, credit: null, W: 0 };
    };
    const ev = (g: CGoal): R => {
      if (memo[g.id]) return memo[g.id];
      const ch = kids[g.id] || []; let r: R;
      if (!ch.length) {
        const gm = this.goalMeet(g), mdone = !!gm && gm.ok >= gm.tot, done = g.status === 'Completed' || mdone;
        const w = done ? 1 : Math.max(Math.max(0, Math.min(100, +g.pct || 0)) / 100, gm ? gm.ok / gm.tot : 0);
        r = { work: w, credit: g.cert ? (g.approved && g.verified ? 1 : 0) : (done ? 1 : 0), leaf: true, hold: g.status === 'On hold' };
      } else { const a = agg(ch); r = { ...a, leaf: false, hold: !!a.anyHold }; }
      memo[g.id] = r; return r;
    };
    list.forEach(ev);
    return { memo, kids, top: agg(kids[''] || []), wt };
  }
  cgTag(kid: string) { const ev = this.cgEval(this.cgFor(kid, this.mk())); return ev.top.work === null ? 'from Goals · not configured' : 'from Goals · work ' + Math.round(ev.top.work * 100) + '%'; }

  // ── core sheet maths ──
  achFor(kid: string) {
    const d = this.parts().d; let t = 0;
    for (let i = 1; i <= d; i++) if (this.isWork(this.dayKey(i))) t += +this.dayVal(i, kid) || 0;
    const k = this.kmapAll()[kid]; if (k && k.module !== 'meeting' && k.module !== 'cascade') t += this.meetExtra(kid, k.pid, this.mk() + '-01', this.dayKey(d));
    return t;
  }
  pace(k: Kpi, d: number) {
    const F = +k.monthly || 0, wd = this.workDays(this.mk()), el = this.workElapsed(this.mk(), d);
    const pd = this.ovNum(k.perDayOv), td = this.ovNum(k.tillOv), G = pd !== null ? pd : F / wd;
    return { G, H: td !== null ? td : G >= 1 || this.isLevel(k) ? G * el : Math.floor(G * el + 1e-9) };
  }
  perLabel(k: Kpi, G: number) {
    const F = +k.monthly || 0, n = (v: number) => String(Math.round(v * 10) / 10);
    if (this.isLevel(k) || G >= 1) return { v: n(G), u: '/ day' };
    if (this.ovNum(k.perDayOv) !== null) return { v: String(Math.round(G * 100) / 100), u: '/ day' };
    if (F >= 4 && Number.isInteger(F / 4)) return { v: n(F / 4), u: '/ week' };
    if (F >= 2 && Number.isInteger(F / 2)) return { v: n(F / 2), u: '/ fortnight' };
    return { v: n(F), u: '/ month' };
  }
  calc(k: Kpi, d: number): Calc {
    return this.cache('c' + k.id + ':' + d, () => {
      const c = this._calc(k, d);
      if (this.isLevel(k)) {
        const pd = this.ovNum(k.perDayOv), td = this.ovNum(k.tillOv); c.G = pd !== null ? pd : (+k.monthly || (k.module === 'team' || k.module === 'cascade' ? 100 : 0));
        if (td !== null && !c.notDue) { c.H = td; c.J = td - c.I; c.K = td ? c.I / td : 0; }
      }
      return c;
    });
  }
  private _calc(k: Kpi, d: number): Calc {
    const mk = this.mk();
    if (this.workElapsed(mk, d) === 0) { const F = +k.monthly || 0, G = F / this.workDays(mk); return { G, H: 0, I: 0, J: 0, K: 0, notDue: true, noWork: true, mc: { due: 0, ok: 0 }, team: 0 }; }
    if (k.module === 'team') {
      const mo = this.s.months[mk], owner = mo && mo.people.find(p => p.kpis.some(x => x.id === k.id));
      const v = (mo ? mo.people : []).filter(p => !owner || p.id !== owner.id).map(p => this.personScore(p.id)).filter(Boolean) as { ov: number }[];
      const F = +k.monthly || 100, G = F / this.workDays(mk);
      if (!v.length) return { G, H: F, I: 0, J: F, K: 0, notDue: true, team: 0 };
      const I = v.reduce((a, x) => a + Math.min(x.ov, 1), 0) / v.length * 100;
      return { G, H: F, I, J: F - I, K: F ? I / F : 0, team: v.length };
    }
    if (k.module === 'cascade') {
      const ev = this.cgEval(this.cgFor(k.id, mk)), F = +k.monthly || 100, G = F / this.workDays(mk);
      if (ev.top.credit === null) return { G, H: F, I: 0, J: F, K: 0, notDue: true, cg: ev };
      const I = ev.top.credit * 100; return { G, H: F, I, J: F - I, K: F ? I / F : 0, cg: ev };
    }
    if (k.module === 'meeting') {
      const F = +k.monthly || 0, ref = this.s.date, mc = this.meetCalc(k.id, mk + '-01', ref, ref);
      if (k.meetRule === 'compliance') { const sc = F ? F / 100 : 1; return { G: mc.due / Math.max(this.workElapsed(mk, d), 1), H: mc.due, I: mc.ok, J: mc.due - mc.ok, K: mc.due ? mc.ok / mc.due / sc : 0, notDue: !mc.due, mc, compPct: mc.due ? mc.ok / mc.due * 100 : 0 }; }
      const P = this.pace(k, d); return { G: P.G, H: P.H, I: mc.ok, J: P.H - mc.ok, K: P.H ? mc.ok / P.H : 0, mc };
    }
    if (k.agg === 'latest' || k.lower) {
      const F = +k.monthly || 0, G = F / this.workDays(mk), H = k.agg === 'latest' ? F : this.pace(k, d).H;
      let I: number | null = null;
      if (k.agg === 'latest') { for (let i = d; i >= 1; i--) { if (!this.isWork(this.dayKey(i))) continue; const v = this.dayVal(i, k.id); if (v !== '' && v !== undefined && v !== null) { I = +v || 0; break; } } }
      else { let any = false, t = 0; for (let i = 1; i <= d; i++) { if (!this.isWork(this.dayKey(i))) continue; const v = this.dayVal(i, k.id); if (v !== '' && v !== undefined && v !== null) { any = true; t += +v || 0; } } I = any ? t : null; }
      if (I === null) return { G, H, I: 0, J: 0, K: 0, notDue: true, noData: true };
      if (k.agg !== 'latest' && !H) return { G: this.pace(k, d).G, H, I, J: 0, K: 0, notDue: true };
      if (k.agg !== 'latest') return { G: this.pace(k, d).G, H, I, J: k.lower ? I - H : H - I, K: k.lower ? (I > 0 ? H / I : 1) : (H ? I / H : 0) };
      return { G, H, I, J: k.lower ? I - H : H - I, K: k.lower ? (I > 0 ? H / I : 1) : (H ? I / H : 0) };
    }
    const I = +this.achFor(k.id) || 0, { G, H } = this.pace(k, d);
    if (!H) return { G, H, I, J: 0, K: 0, notDue: true };
    return { G, H, I, J: H - I, K: H ? I / H : 0 };
  }

  personScore(pid: string) {
    return this.cache('ps' + pid, () => {
      const mo = this.s.months[this.mk()], pe = mo && mo.people.find(p => p.id === pid); if (!pe) return null;
      const { d } = this.parts();
      const lst = pe.kpis.filter(k => +k.monthly && !k.na).map(k => { const c = this.calc(k, d); return c.notDue ? null : { pct: c.K, w: this.wOf(k), th: this.thr(k.min) }; }).filter(Boolean) as { pct: number; w: number; th: number }[];
      const ov = wavg(lst); return ov === null ? null : { ov, th: lst.reduce((a, o) => a + o.th, 0) / lst.length, n: lst.length };
    });
  }

  // ── period performance ──
  range(period: string, cFrom: string, cTo: string): [string, string] {
    const date = this.s.date, y = +date.slice(0, 4), m = +date.slice(5, 7), mk = date.slice(0, 7);
    const yrs = (n: number) => addDays(`${y - n}-${date.slice(5)}`, 1);
    switch (period) {
      case 'day': return [date, date];
      case 'week': return [addDays(date, -6), date];
      case 'month': return [mk + '-01', date];
      case '2m': { const [py, pm] = [m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1]; return [`${py}-${pad(pm)}-01`, date]; }
      case 'q': return [`${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`, date];
      case 'h': return [`${y}-${m <= 6 ? '01' : '07'}-01`, date];
      case 'y': return [`${y}-01-01`, date];
      case '2y': return [yrs(2), date];
      case '3y': return [yrs(3), date];
      case '5y': return [yrs(5), date];
      default: { let a = cFrom || mk + '-01', b = cTo || date; if (a > b) [a, b] = [b, a]; return [a, b]; }
    }
  }
  perf(from: string, to: string, pid: string | null) {
    const { months, log } = this.s, acc: Record<string, { id: string; name: string; uom: string; min: number; t: number; a: number; w?: number; na?: boolean }> = {}, daily: { date: string; k: Record<string, [number, number]> }[] = [], mIdx = this.meetIndex(this.s.date);
    let cur = from, guard = 0;
    while (cur <= to && guard++ < 4000) {
      const mk = cur.slice(0, 7), defs = months[mk] && months[mk].people.filter(p => !pid || p.id === pid);
      if (defs) {
        const wdm = this.workDays(mk), isW = this.isWork(cur), dl = log[cur] || {}, row = { date: cur, k: {} as Record<string, [number, number]> };
        defs.forEach(p => p.kpis.forEach(k => {
          const ms = k.module === 'meeting' ? ((mIdx[k.id] || {})[cur] || { due: 0, ok: 0 }) : null;
          const comp = ms && k.meetRule === 'compliance';
          const t = comp ? (cur <= this.s.date ? ms!.due * ((+k.monthly || 100) / 100) : 0) : isW ? (+k.monthly || 0) / wdm : 0;
          const a = comp ? (cur <= this.s.date ? ms!.ok : 0) : ms ? (cur <= this.s.date ? ms.ok : 0) : (isW ? (+((dl[k.id] || {} as { ach?: number }).ach as number) || 0) + (k.module !== 'cascade' ? this.meetExtra(k.id, p.id, cur, cur) : 0) : 0);
          const o = acc[k.id] || (acc[k.id] = { id: k.id, name: k.name, uom: k.uom, min: +k.min || 0, t: 0, a: 0 });
          o.t += t; o.a += a; o.name = k.name; o.min = +k.min || 0; o.w = this.wOf(k); o.na = !!k.na; if (!k.na) row.k[k.id] = [t, a];
        }));
        daily.push(row);
      }
      cur = addDays(cur, 1);
    }
    const list = Object.values(acc).filter(o => o.t > 0 && !o.na).map(o => ({ ...o, w: o.w as number, pct: o.a / o.t }));
    return { list, daily, overall: wavg(list) };
  }

  // ── rows for the sheet / cards / export ──
  sheetRows(people: MonthPerson[]) {
    const { d } = this.parts();
    return people.flatMap(p => p.kpis.map((k, i) => {
      const c = this.calc(k, d), th = this.thr(k.min);
      return { p, k, i, c, th, w: this.wOf(k), down: !k.na && !c.notDue && c.K < th };
    }));
  }
  tableList(people: MonthPerson[]) {
    return this.sheetRows(people).map(({ k, c, th, w }) => ({ id: k.id, name: k.name, uom: k.uom, min: +k.min || 0, t: c.H, a: c.I, pct: c.K, th, gap: c.J, w, na: !!k.na || !!c.notDue }));
  }

  monthName() { return MONTHS[this.parts().m - 1]; }
}
