'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';

export default function LoginPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [pkLoading, setPkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  function triggerError(msg: string) {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([80, 40, 80]); } catch {}
    }
    inputRef.current?.select();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      triggerError('Введите пароль');
      return;
    }
    if (trimmed.length < 4) {
      triggerError('Пароль должен содержать от 4 символов');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/access-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerError(data.error || 'Неверный пароль');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch {
      triggerError('Ошибка сети. Проверьте подключение');
    } finally {
      setLoading(false);
    }
  }

  async function loginPasskey() {
    setPkLoading(true);
    setError(null);
    try {
      const optionsRes = await fetch('/api/auth/passkey/login/options', { method: 'POST' });
      if (!optionsRes.ok) throw new Error('Не удалось получить опции');
      const options = await optionsRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyRes = await fetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assertion),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok || !data.verified) throw new Error(data.error || 'Не удалось войти');
      router.push('/dashboard');
      router.refresh();
    } catch (e) {
      triggerError(e instanceof Error ? e.message : 'Ошибка входа по Face ID / Touch ID');
    } finally {
      setPkLoading(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg)' }}>
      <div className={`card ${shake ? 'login-card--shake' : ''}`} style={{ width: 360, maxWidth: '100%', transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Lokmaco</h1>
        <p className="page-subtitle" style={{ marginBottom: 20 }}>Войди в систему</p>

        <button type="button" className="btn" onClick={loginPasskey} disabled={pkLoading || loading} style={{ width: '100%', marginBottom: 16, padding: '12px' }}>
          🔐 {pkLoading ? 'Подтвердите на устройстве…' : 'Войти через Face ID / Touch ID'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 16px', color: 'var(--text-faint)', fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span>или пароль</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <input
              ref={inputRef}
              autoFocus
              type="password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="пароль"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              className="input"
              style={{
                fontSize: 18,
                padding: '14px 16px',
                textAlign: 'center',
                letterSpacing: 4,
                borderColor: error ? 'var(--danger)' : undefined,
                boxShadow: error ? '0 0 0 3px rgba(255, 59, 48, 0.18)' : undefined,
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
            />
          </div>
          {error && (
            <div className="banner banner--error" style={{ marginTop: 14, fontWeight: 500, fontSize: 13 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} className="btn btn--primary" style={{ width: '100%', marginTop: 16 }}>
            {loading ? 'Проверка…' : 'Войти'}
          </button>
        </form>
      </div>
    </main>
  );
}
