import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../ui';

interface Dir { id: string; sno: number; name: string; role: string; login_email: string }

export default function Login() {
  const [dir, setDir] = useState<Dir[]>([]);
  const [uid, setUid] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('login_directory').then(({ data, error }) => {
      if (error) setErr('Could not reach the server. Check your connection and reload.');
      else setDir((data as Dir[]) || []);
    });
  }, []);

  const signIn = async () => {
    const u = dir.find(x => x.id === uid);
    if (!u) return setErr('Choose your name.');
    if (!pw) return setErr('Enter your password.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: u.login_email, password: pw });
    setBusy(false);
    if (error) setErr(/invalid/i.test(error.message) ? 'That password is not correct.' : error.message);
  };

  return (
    <div className="page">
      <section style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="col" style={{ width: 'min(420px,100%)', gap: 'var(--space-4)' }}>
          <div className="kicker">Pillars KPI Monitoring</div>
          <h1 style={{ margin: 0, fontSize: 'clamp(36px,7vw,52px)', lineHeight: 1.05 }}>Sign in</h1>
          <div style={{ borderTop: '3px solid #000', borderBottom: '1px solid #000', height: 2 }} />
          <div className="field"><label>Your name</label>
            <select className="input" value={uid} onChange={e => { setUid(e.target.value); setErr(''); }} style={{ minHeight: 44 }}>
              <option value="">Choose your name…</option>
              {dir.map(u => <option key={u.id} value={u.id}>{(u.role === 'management' ? '' : u.sno + '. ') + u.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Password</label>
            <input className="input" type="password" autoComplete="current-password" value={pw} onChange={e => { setPw(e.target.value); setErr(''); }} onKeyDown={e => { if (e.key === 'Enter') signIn(); }} style={{ minHeight: 44 }} />
          </div>
          {err && <div style={{ fontSize: 15, color: 'var(--color-accent-2-700)', fontWeight: 600 }}>{err}</div>}
          <button className="btn btn-primary" onClick={signIn} disabled={busy} style={{ minHeight: 48, fontSize: 17 }}><Icon n="sign-in" />{busy ? 'Signing in…' : 'Sign in'}</button>
          <p style={{ margin: 0, fontSize: 13, fontStyle: 'italic', lineHeight: 1.5 }}>Officials see only their own KPIs. Management sees every official and the team overview. Forgot your password? Ask management to set a new one under Team &amp; logins.</p>
        </div>
      </section>
    </div>
  );
}
