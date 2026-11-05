'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BazaarWindow } from '@/lib/bazaar';

type Mark = { id: number; date: string; leftover: number; comment: string; by: string };
type Data = { windows: BazaarWindow[]; marks: Mark[] };

function fmtMoney(n: number): string {
  return n.toLocaleString('ru-RU');
}
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export default function BazaarClient({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const [date, setDate] = useState('');
  const [leftover, setLeftover] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/bazaar', { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/bazaar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, leftover: Number(leftover), comment }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSaveMsg(json.updated ? 'Отметка обновлена' : 'Отметка сохранена');
      setDate('');
      setLeftover('');
      setComment('');
      load();
    } catch (e: any) {
      setSaveMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить эту отметку?')) return;
    try {
      const res = await fetch(`/api/bazaar/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || 'Ошибка');
        return;
      }
      load();
    } catch {
      alert('Ошибка сети');
    }
  }

  const statusLabel: Record<string, string> = {
    ok: 'Сошлось',
    missing: 'Не хватает накладных',
    over: 'Накладных больше',
  };
  const statusColor: Record<string, string> = {
    ok: 'var(--green)',
    missing: 'var(--red)',
    over: 'var(--orange, #e67e22)',
  };

  return (
    <>
      <section className="card">
        <h2 className="card__title">Внести остаток у снабженца</h2>
        <form onSubmit={handleSave} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            Дата
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              required className="input" style={{ width: 160 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            Остаток (сум)
            <input type="number" min="0" step="1" value={leftover}
              onChange={e => setLeftover(e.target.value)}
              required className="input" style={{ width: 160 }} placeholder="0" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, flex: 1, minWidth: 140 }}>
            Комментарий
            <input type="text" value={comment} onChange={e => setComment(e.target.value)}
              className="input" placeholder="необязательно" />
          </label>
          <button type="submit" className="btn btn--primary" disabled={saving}
            style={{ padding: '10px 20px', fontWeight: 600 }}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </form>
        {saveMsg && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>{saveMsg}</div>}
      </section>

      {loading && <div className="empty-state">Загрузка…</div>}
      {error && <div className="banner banner--error">{error}</div>}

      {data && data.windows.length === 0 && !loading && (
        <div className="banner banner--info">
          {data.marks.length < 2
            ? 'Нужно минимум 2 отметки остатка для начала сверки.'
            : 'Нет окон для сверки.'}
        </div>
      )}

      {data && data.windows.map((w, i) => (
        <section key={i} className="card" style={{ cursor: 'pointer' }}
          onClick={() => setExpanded(expanded === i ? null : i)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {fmtDate(w.from)} → {fmtDate(w.to)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                Потрачено {fmtMoney(w.spent)} · Накладных {fmtMoney(w.entered)} ({w.invoiceCount} шт.)
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontWeight: 700,
                fontSize: 14,
                color: statusColor[w.status] || 'var(--text)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {w.status === 'ok' && '✓ '}
                {w.status === 'missing' && '⚠ '}
                {w.status === 'over' && '↑ '}
                {statusLabel[w.status]}
                {w.status !== 'ok' && (
                  <span style={{ fontWeight: 400, fontSize: 13 }}>
                    ({fmtMoney(Math.abs(w.diff))})
                  </span>
                )}
              </div>
              {w.suspicious && (
                <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 2 }}>
                  ⚠ Остаток больше, чем было денег
                </div>
              )}
            </div>
          </div>

          {expanded === i && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 12 }}>
                <div className="stat-card" style={{ padding: 12 }}>
                  <div className="stat-card__label" style={{ fontSize: 11 }}>Было у снабженца</div>
                  <div className="stat-card__value" style={{ fontSize: 16 }}>{fmtMoney(w.openingLeftover)}</div>
                </div>
                <div className="stat-card" style={{ padding: 12 }}>
                  <div className="stat-card__label" style={{ fontSize: 11 }}>Выдал кассир</div>
                  <div className="stat-card__value" style={{ fontSize: 16 }}>{fmtMoney(w.givenSum)}</div>
                </div>
                <div className="stat-card" style={{ padding: 12 }}>
                  <div className="stat-card__label" style={{ fontSize: 11 }}>Остаток вернулся</div>
                  <div className="stat-card__value" style={{ fontSize: 16 }}>{fmtMoney(w.leftover)}</div>
                </div>
                <div className="stat-card" style={{ padding: 12 }}>
                  <div className="stat-card__label" style={{ fontSize: 11 }}>Потрачено</div>
                  <div className="stat-card__value" style={{ fontSize: 16 }}>{fmtMoney(w.spent)}</div>
                </div>
              </div>

              {w.given.length > 0 && (
                <>
                  <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Выдачи по сменам</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
                    <tbody>
                      {w.given.map((g, gi) => (
                        <tr key={gi} style={{ borderTop: gi ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '6px 0' }}>{fmtDate(g.date)}</td>
                          <td style={{ padding: '6px 0', color: 'var(--text-muted)' }}>{g.name}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtMoney(g.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Допуск: {fmtMoney(Math.round(w.tolerance))} · Разница: {fmtMoney(w.diff)}
              </div>
            </div>
          )}
        </section>
      ))}

      {data && data.marks.length > 0 && (
        <section className="card">
          <h2 className="card__title">Отметки остатка ({data.marks.length})</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 0', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Дата</th>
                <th style={{ padding: '8px 0', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Остаток</th>
                <th style={{ padding: '8px 0', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Кто</th>
                <th style={{ padding: '8px 0', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Комментарий</th>
                {isAdmin && (
                  <th style={{ padding: '8px 0', textAlign: 'right', borderBottom: '1px solid var(--border)' }}></th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.marks.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0' }}>{fmtDate(m.date)}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {fmtMoney(m.leftover)}
                  </td>
                  <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>{m.by}</td>
                  <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>{m.comment || '—'}</td>
                  {isAdmin && (
                    <td style={{ padding: '8px 0', textAlign: 'right' }}>
                      <button onClick={() => handleDelete(m.id)}
                        className="btn btn--sm" style={{ color: 'var(--red)', fontSize: 12 }}>
                        Удалить
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
