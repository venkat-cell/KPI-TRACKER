// Shared constants and date helpers (ported from the KPI Portal prototype).
export const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
export const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const FREQS = ['Daily', 'Alternate days', 'Twice a week', 'Weekly', 'Fortnightly', 'Twice a month', 'Monthly', 'Bi-monthly', 'Quarterly', 'Half yearly', 'Yearly', 'One-time'];
export const PERIODS: [string, string][] = [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly'], ['2m', '2 Months'], ['q', 'Quarterly'], ['h', 'Half-yearly'], ['y', 'Yearly'], ['2y', '2 Years'], ['3y', '3 Years'], ['5y', '5 Years'], ['custom', 'From – To']];
export const UOMS = ['Nos', '%', 'MT', 'Kg', 'Days', 'Hrs', 'Rs', 'Rs Lakhs', 'Rs Cr', 'Visits', 'Meetings', 'Posts', 'Events', 'Reports', 'Sessions', 'Contacts', 'Other…'];
export const STATUSES = ['Not started', 'In progress', 'Pending approval', 'Completed', 'On hold', 'Rejected'];
export const OFFICIAL_STATUSES = ['Not started', 'In progress', 'Completed', 'On hold'];
export const OPEN = (st: string) => st !== 'Completed' && st !== 'Rejected';

export const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (t: Date) => t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
export const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const t = parse(s); t.setDate(t.getDate() + n); return iso(t); };
export const shiftMonth = (mk: string, n: number) => { const [y, m] = mk.split('-').map(Number); return iso(new Date(y, m - 1 + n, 1)).slice(0, 7); };
export const dimOf = (mk: string) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const mTitle = (mk: string) => { const [, m] = mk.split('-').map(Number); return MONTHS[m - 1].charAt(0) + MONTHS[m - 1].slice(1).toLowerCase() + ' ' + mk.slice(0, 4); };
export const fmtD = (s: string) => parse(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtShort = (s: string) => parse(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const f1 = (v: unknown) => { const n = +(v as number) || 0; if (n !== 0 && Math.abs(n) < 1) return String(Math.round(n * 100) / 100); return String(Math.round(n * 10) / 10); };
export const today = () => iso(new Date());

export const driveEmbed = (u: string) => {
  if (!u) return ''; let m: RegExpMatchArray | null;
  if ((m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/))) return `https://drive.google.com/file/d/${m[1]}/preview`;
  if ((m = u.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]+)/))) return `https://drive.google.com/file/d/${m[1]}/preview`;
  if ((m = u.match(/docs\.google\.com\/(document|spreadsheets|presentation|forms)\/d\/([\w-]+)/))) return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`;
  if ((m = u.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/))) return `https://drive.google.com/embeddedfolderview?id=${m[1]}#list`;
  return u;
};

// colours used across the sheet, cards and overview
export const C = {
  green: 'oklch(0.9 0.08 150)',
  amber: 'oklch(0.92 0.1 85)',
  red: 'var(--color-accent-2-200)',
  grey: 'var(--color-neutral-100)',
};
