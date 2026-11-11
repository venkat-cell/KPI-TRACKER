import type { Data, Person } from './lib/data';
import type { Engine, MonthPerson } from './lib/engine';

export type View = 'person' | 'overview' | 'brief';
export type DialogName = null | 'team' | 'audit' | 'kpi' | 'doc';

export interface Ctx {
  data: Data;
  eng: Engine;
  me: Person;
  isMgmt: boolean;
  canAll: boolean;          // management or view-all official
  vp: string;               // the official being viewed
  vUser: Person | undefined;
  P: MonthPerson[];          // the viewed official's people row(s) for the month
  hasMonth: boolean;
  members: Person[];
  date: string;
  setDate: (d: string) => void;
  goTo: (mk: string) => void;
  view: View;
  setView: (v: View, pid?: string) => void;
  period: string; setPeriod: (p: string) => void;
  cFrom: string; cTo: string; setCustom: (a: string, b: string) => void;
  openDialog: (d: DialogName, extra?: { docUrl?: string; kpiPid?: string }) => void;
  /** apply a local change straight away, then persist; on failure reload from the server */
  mutate: (local: (d: Data) => Data, remote: () => Promise<unknown>, msg?: string) => Promise<boolean>;
  reload: () => Promise<void>;
  toast: (msg: string, err?: boolean) => void;
  audit: (action: string, detail: string) => void;
  nowTick: number;
}
