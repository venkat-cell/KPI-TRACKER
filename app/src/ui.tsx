import type { CSSProperties, ReactNode } from 'react';

export const Icon = ({ n, style }: { n: string; style?: CSSProperties }) => <i className={'ph-duotone ph-' + n} style={style} />;
export const Down = ({ size = 15 }: { size?: number }) => <Icon n="arrow-fat-down" style={{ color: 'var(--color-accent-2-700)', fontSize: size }} />;

export function Dialog({ onClose, width, children, z = 200 }: { onClose: () => void; width?: string; children: ReactNode; z?: number }) {
  return (
    <div className="dialog-backdrop" style={{ zIndex: z }} data-noprint="1" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ width: width || 'min(480px,100%)', maxWidth: 'none', maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', color: '#000' }}>
        {children}
      </div>
    </div>
  );
}

export const Stat = ({ v, l, big = 'clamp(36px,5vw,52px)' }: { v: string; l: string; big?: string }) => (
  <div className="col" style={{ gap: 'var(--space-1)' }}>
    <div style={{ fontSize: big, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.01em' }}>{v}</div>
    <div style={{ fontSize: 14, lineHeight: 1.4 }}>{l}</div>
  </div>
);

export const Legend = ({ items }: { items: [string, string][] }) => (
  <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: 13, flexWrap: 'wrap' }}>
    {items.map(([c, l]) => <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: c === 'line' ? 2 : 12, height: 12, background: c === 'line' ? '#000' : c }} />{l}</span>)}
  </div>
);

export function NotesRecs({ notes, recs }: { notes: string[]; recs: string[] }) {
  return (
    <>
      <div className="col" style={{ gap: 'var(--space-2)', maxWidth: '72ch' }}>
        <h3 className="h3">Observations</h3>
        <ul style={{ margin: 0, paddingLeft: '1.2em', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 16, lineHeight: 1.55 }}>
          {notes.map((n, i) => <li key={i} style={{ textWrap: 'pretty' } as CSSProperties}>{n}</li>)}
        </ul>
      </div>
      <div className="col" style={{ gap: 'var(--space-2)', maxWidth: '72ch' }}>
        <h3 className="h3">Recommendations</h3>
        <ol style={{ margin: 0, paddingLeft: '1.4em', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 16, lineHeight: 1.55 }}>
          {recs.map((n, i) => <li key={i} style={{ textWrap: 'pretty' } as CSSProperties}>{n}</li>)}
        </ol>
      </div>
    </>
  );
}

export const PeriodButtons = ({ periods, period, onPick }: { periods: [string, string][]; period: string; onPick: (id: string) => void }) => (
  <>
    {periods.map(([id, label]) => (
      <button key={id} className={id === period ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => onPick(id)} style={{ fontSize: 14, minHeight: 40, padding: '6px 12px' }}>{label}</button>
    ))}
  </>
);
