// Small immutable helpers that apply a change to the in-memory data straight away
// (the matching server write follows through ctx.mutate).
import type { Data } from './data';
import type { Entry, Kpi, MonthPerson } from './engine';

export const setDayLocal = (date: string, kid: string, val: string) => (d: Data): Data => {
  const day = { ...(d.log[date] || {}) };
  if (val === '') delete day[kid]; else day[kid] = { ach: +val };
  return { ...d, log: { ...d.log, [date]: day } };
};
export const bumpLocal = (d: Data, date: string, kid: string, delta: number): Data => {
  if (kid === '__other' || !delta) return d;
  const day = { ...(d.log[date] || {}) }, v = +((day[kid] && day[kid].ach) || 0) + delta;
  day[kid] = { ach: Math.round(v * 1000) / 1000 };
  return { ...d, log: { ...d.log, [date]: day } };
};
export const peopleLocal = (mk: string, fn: (ps: MonthPerson[]) => MonthPerson[]) => (d: Data): Data => {
  const mo = d.months[mk]; if (!mo) return d;
  return { ...d, months: { ...d.months, [mk]: { ...mo, people: fn(mo.people) } } };
};
export const updKpiLocal = (mk: string, pid: string, kid: string, patch: Partial<Kpi>) =>
  peopleLocal(mk, ps => ps.map(p => p.id !== pid ? p : { ...p, kpis: p.kpis.map(k => k.id === kid ? { ...k, ...patch } : k) }));
export const entriesLocal = (fn: (es: Entry[]) => Entry[]) => (d: Data): Data => ({ ...d, entries: fn(d.entries) });
export const uid = () => Math.random().toString(36).slice(2, 9);
