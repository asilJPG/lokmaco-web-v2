'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';

const PRESETS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'yesterday', label: 'Вчера' },
  { id: '7d', label: '7 дн.' },
  { id: '30d', label: '30 дн.' },
  { id: 'this_month', label: 'Этот месяц' },
  { id: 'last_month', label: 'Прошлый месяц' },
];

export function PeriodPicker({ from, to, activePreset }: { from: string; to: string; activePreset?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  function go(params: Record<string, string>) {
    const next = new URLSearchParams(sp?.toString() || '');
    for (const [k, v] of Object.entries(params)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    start(() => router.push(`${path}?${next.toString()}`));
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => go({ preset: p.id, from: '', to: '' })}
            className={`btn btn--sm ${activePreset === p.id ? 'btn--soft' : ''}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
        <input
          type="date"
          className="input input--inline"
          style={{ width: 'auto', minWidth: 125, maxWidth: '100%' }}
          value={from}
          onChange={(e) => go({ from: e.target.value, to, preset: '' })}
        />
        <span style={{ color: 'var(--text-faint)' }}>—</span>
        <input
          type="date"
          className="input input--inline"
          style={{ width: 'auto', minWidth: 125, maxWidth: '100%' }}
          value={to}
          onChange={(e) => go({ from, to: e.target.value, preset: '' })}
        />
        {pending && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>обновление…</span>}
        {(() => {
          const f = new Date(from); const t = new Date(to);
          if (isNaN(f.getTime()) || isNaN(t.getTime())) return null;
          const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
          return <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{days} {days % 10 === 1 && days % 100 !== 11 ? 'день' : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20) ? 'дня' : 'дней'}</span>;
        })()}
      </div>
    </div>
  );
}
