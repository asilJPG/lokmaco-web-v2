'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BazaarWindow } from '@/lib/bazaar';

type Mark = { id: number; date: string; leftover: number; repaid: number; comment: string; by: string };
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

  const [date, setDate] = useState(() => {
    const now = new Date(Date.now() + 5 * 3600_000);
    return now.toISOString().slice(0, 10);
  });
  const [leftover, setLeftover] = useState('');
  const [repaid, setRepaid] = useState('');
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
        body: JSON.stringify({ date, leftover: Number(leftover), repaid: Number(repaid) || 0, comment }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSaveMsg(json.updated ? 'Отметка обновлена' : 'Отметка сохранена');
      const now = new Date(Date.now() + 5 * 3600_000);
      setDate(now.toISOString().slice(0, 10));
      setLeftover('');
      setRepaid('');
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
    over: 'Привёз в долг',
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
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            Погасил долг (сум)
            <input type="number" min="0" step="1" value={repaid}
              onChange={e => setRepaid(e.target.value)}
              className="input" style={{ width: 160 }} placeholder="0"
              title="Сколько налички ушло на погашение старого долга снабженца в этот день" />
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
              <div style={{ fontWeight: 700, fontSize: 18 }}>
                {fmtDate(w.to)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                период с {fmtDate(w.from)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                Потрачено {fmtMoney(w.spent)} · Накладных {fmtMoney(w.entered)} ({w.invoiceCount} шт.)
              </div>
              {(w.inDebt > 0 || w.repaid > 0 || w.debtAfter !== 0) && (
                <div style={{ fontSize: 12, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {w.inDebt > 0 && (
                    <span style={{ color: 'var(--orange, #e67e22)' }}>в долг +{fmtMoney(w.inDebt)}</span>
                  )}
                  {w.repaid > 0 && (
                    <span style={{ color: 'var(--green)' }}>погашено −{fmtMoney(w.repaid)}</span>
                  )}
                  <span style={{ color: 'var(--text-muted)' }}>
                    долг снабженца: <b style={{ color: w.debtAfter > 0 ? 'var(--orange, #e67e22)' : 'var(--text)' }}>{fmtMoney(w.debtAfter)}</b>
                  </span>
                </div>
              )}
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
                    ({fmtMoney(w.status === 'over' ? w.inDebt : w.shortfall)})
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
                  <div className="stat-card__label" style={{ fontSize: 11 }}>Остаток на {fmtDate(w.from)}</div>
                  <div className="stat-card__value" style={{ fontSize: 16 }}>{fmtMoney(w.openingLeftover)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>было у снабженца</div>
                </div>
                <div className="stat-card" style={{ padding: 12 }}>
                  <div className="stat-card__label" style={{ fontSize: 11 }}>Выдали на базар</div>
                  <div className="stat-card__value" style={{ fontSize: 16 }}>+{fmtMoney(w.givenSum)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>выдано кассиром накануне</div>
                </div>
                <div className="stat-card" style={{ padding: 12 }}>
                  <div className="stat-card__label" style={{ fontSize: 11 }}>Остаток на {fmtDate(w.to)}</div>
                  <div className="stat-card__value" style={{ fontSize: 16 }}>−{fmtMoney(w.leftover)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>осталось у снабженца</div>
                </div>
                <div className="stat-card" style={{ padding: 12, background: 'var(--surface-2, rgba(0,0,0,0.03))' }}>
                  <div className="stat-card__label" style={{ fontSize: 11 }}>Потрачено на закуп</div>
                  <div className="stat-card__value" style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoney(w.spent)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>было + выдали − осталось</div>
                </div>
                {w.repaid > 0 && (
                  <div className="stat-card" style={{ padding: 12 }}>
                    <div className="stat-card__label" style={{ fontSize: 11 }}>Погашено долга</div>
                    <div className="stat-card__value" style={{ fontSize: 16, color: 'var(--green)' }}>{fmtMoney(w.repaid)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>деньгами в этот период</div>
                  </div>
                )}
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                padding: '10px 12px', marginBottom: 12, borderRadius: 8,
                background: 'var(--surface-2, rgba(0,0,0,0.03))',
              }}>
                <div style={{ fontSize: 13 }}>
                  {w.inDebt > 0 && <span style={{ color: 'var(--orange, #e67e22)' }}>Привёз в долг на {fmtMoney(w.inDebt)}. </span>}
                  {w.shortfall > 0 && <span style={{ color: 'var(--red)' }}>Не хватает накладных на {fmtMoney(w.shortfall)}. </span>}
                  {w.inDebt === 0 && w.shortfall === 0 && <span style={{ color: 'var(--green)' }}>Накладные сошлись с потраченным. </span>}
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                  Долг снабженца:{' '}
                  <b style={{ color: w.debtAfter > 0 ? 'var(--orange, #e67e22)' : w.debtAfter < 0 ? 'var(--green)' : 'var(--text)' }}>
                    {fmtMoney(w.debtAfter)}
                  </b>
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

              {isAdmin && w.invoices && w.invoices.length > 0 && (
                <>
                  <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Накладные ({w.invoices.length})</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
                    <thead>
                      <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                        <th style={{ padding: '4px 0', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Дата</th>
                        <th style={{ padding: '4px 0', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Документ</th>
                        <th style={{ padding: '4px 0', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {w.invoices.map((inv, ii) => (
                        <tr key={ii} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 0' }}>{fmtDate(inv.date)}</td>
                          <td style={{ padding: '6px 0', color: 'var(--text-muted)' }}>{inv.document || '—'}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtMoney(inv.total)}
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
                <th style={{ padding: '8px 0', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Погашено</th>
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
                  <td style={{ padding: '8px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.repaid ? 'var(--green)' : 'var(--text-muted)' }}>
                    {m.repaid ? fmtMoney(m.repaid) : '—'}
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
