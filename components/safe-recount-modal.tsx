'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SafeRecountButton({ defaultDate, defaultFilialId }: { defaultDate: string; defaultFilialId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/safe-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          amount: Number(amount),
          comment: comment.trim(),
          filialId: defaultFilialId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Ошибка при сохранении пересчёта');
      } else {
        setAmount('');
        setComment('');
        setOpen(false);
        router.refresh();
      }
    } catch {
      setErr('Ошибка сети при отправке данных');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--sm"
        style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
          color: '#fff',
          borderColor: 'transparent',
          fontWeight: 600,
          boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)',
        }}
        onClick={() => setOpen(true)}
      >
        📝 Зафиксировать пересчёт
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  📝 Зафиксировать пересчёт сейфа
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Запись фиксирует посчитанную сумму на выбранную дату для сверки (не влияет на баланс и калькуляции).
                </p>
              </div>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setOpen(false)}
                style={{ padding: '2px 6px', fontSize: 16 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label className="field__label">Дата пересчёта</label>
                <input
                  type="date"
                  required
                  className="input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="field">
                <label className="field__label">Посчитанная сумма (UZS)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  required
                  min="1"
                  className="input input--number"
                  placeholder="Например, 15000000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <span
                  className="field__hint"
                  style={{
                    textAlign: 'right',
                    visibility: (parseFloat(amount) || 0) > 0 ? 'visible' : 'hidden',
                    fontWeight: 600,
                    color: 'var(--accent)',
                  }}
                >
                  = {(parseFloat(amount) || 0).toLocaleString('ru-RU')} сум
                </span>
              </div>

              <div className="field">
                <label className="field__label">Примечание (необязательно)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Например, Купюры 100k/200k, сошлось"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>

              {err && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    fontSize: 12,
                  }}
                >
                  {err}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                    borderColor: 'transparent',
                  }}
                  disabled={busy || !amount || Number(amount) <= 0}
                >
                  {busy ? 'Сохранение…' : 'Зафиксировать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export function DeleteSafeAuditButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!confirm('Удалить эту запись пересчёта?')) return;
    setBusy(true);
    try {
      await fetch(`/api/safe-audit?id=${id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn--danger btn--icon"
      onClick={del}
      disabled={busy}
      title="Удалить запись"
      style={{ padding: '2px 8px', fontSize: 13 }}
    >
      ×
    </button>
  );
}
