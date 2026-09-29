'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Filial = { id: number; name: string };

export function FilialSwitcher({
  filials,
  current,
  allowAll,
  compact = false,
}: {
  filials: Filial[];
  current: number | 'all';
  allowAll: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();

  if (filials.length <= 1 && !allowAll) return null;

  async function switchTo(value: string) {
    setBusy(true);
    const res = await fetch('/api/current-filial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: value }),
    });
    setBusy(false);
    if (!res.ok) {
      // Молчаливый отказ выглядел как «переключатель не работает»: список
      // возвращался к прежнему значению без единого слова.
      const data = await res.json().catch(() => ({} as { error?: string }));
      alert(data.error || `Не удалось переключить филиал (${res.status})`);
      return;
    }
    start(() => router.refresh());
  }

  if (compact) {
    return (
      <div className="filial-switcher filial-switcher--compact" style={{ display: 'inline-flex', alignItems: 'center' }}>
        <select
          value={String(current)}
          onChange={(e) => switchTo(e.target.value)}
          disabled={busy}
          style={{
            padding: '5px 8px',
            background: 'var(--surface-muted)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {allowAll && filials.length > 1 && <option value="all">Все филиалы</option>}
          {filials.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="filial-switcher" style={{ padding: '0 var(--space-3) var(--space-3)' }}>
      <label style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Филиал</label>
      <select
        value={String(current)}
        onChange={(e) => switchTo(e.target.value)}
        disabled={busy}
        style={{
          marginTop: 6,
          width: '100%',
          padding: '8px 10px',
          background: 'var(--surface-muted)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        {allowAll && filials.length > 1 && <option value="all">Все филиалы</option>}
        {filials.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
    </div>
  );
}
