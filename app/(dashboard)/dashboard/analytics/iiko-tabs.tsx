'use client';

import { Fragment, useEffect, useState } from 'react';
import { StackTable } from '@/components/stack-table';
import { SortTh, useSort } from '@/components/sortable';

type Dish = { name: string; amount: number; revenue: number };
type Category = { name: string; totalRevenue: number; totalAmount: number; dishes: Dish[] };
type Waiter = { name: string; sales: number; orders: number; refunds: number; avgCheck: number };
type PnL = { revenue: number; cogs: number; expensesSum: number; netProfit: number; margin: number; expensesDetail: { name: string; amount: number }[] };
type ExpenseDetailRow = { date: string; document: string; description: string; amount: number };

function fmt(n: number) {
  return n.toLocaleString('ru-RU');
}

export type IikoTab = 'pl' | 'sales' | 'waiters';

/** Сколько позиций видно в группе до раскрытия. */
const VISIBLE_DISHES = 20;

export function IikoTabs({ from, to, tab }: { from: string; to: string; tab: IikoTab }) {
  const [pl, setPl] = useState<PnL | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  /** Какие группы блюд раскрыты целиком. */
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Отчёт открывают с вопросом «у кого больше», поэтому первый клик по столбцу
  // даёт убывание; по умолчанию — по выручке.
  const waiterSort = useSort<Waiter, 'name' | 'orders' | 'refunds' | 'avgCheck' | 'sales'>(
    waiters, 'sales', (w, key) => (key === 'name' ? w.name : w[key])
  );
  const [error, setError] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, ExpenseDetailRow[] | 'loading' | 'error'>>({});

  async function toggleCategory(name: string) {
    if (expandedCategory === name) {
      setExpandedCategory(null);
      return;
    }
    setExpandedCategory(name);
    if (detailCache[name]) return;
    setDetailCache((c) => ({ ...c, [name]: 'loading' }));
    try {
      const res = await fetch(`/api/iiko/analytics/pl/details?category=${encodeURIComponent(name)}&from=${from}&to=${to}`);
      const json = await res.json();
      if (json.error) {
        setDetailCache((c) => ({ ...c, [name]: 'error' }));
      } else {
        setDetailCache((c) => ({ ...c, [name]: json.data || [] }));
      }
    } catch {
      setDetailCache((c) => ({ ...c, [name]: 'error' }));
    }
  }

  useEffect(() => {
    let cancelled = false;
    setExpandedCategory(null);
    setDetailCache({});
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [plRes, salesRes, waitersRes] = await Promise.all([
          fetch(`/api/iiko/analytics/pl?from=${from}&to=${to}`),
          fetch(`/api/iiko/analytics/top-sales?from=${from}&to=${to}`),
          fetch(`/api/iiko/analytics/waiters?from=${from}&to=${to}`),
        ]);
        const plData = await plRes.json();
        const salesData = await salesRes.json();
        const waitersData = await waitersRes.json();
        if (cancelled) return;
        setPl(plData.data || null);
        setCategories(salesData.data || []);
        setWaiters(waitersData.data || []);
        const err = plData.error || salesData.error || waitersData.error;
        if (err) setError(err);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'fetch failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [from, to]);

  return (
    <div className="grid">
      {!loading && tab === 'pl' && (
        pl ? (
          <div className="grid">
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-card__label">💰 Выручка</div><div className="stat-card__value" style={{ color: 'var(--success)' }}>{fmt(Math.round(pl.revenue))}</div></div>
              <div className="stat-card"><div className="stat-card__label">🛒 Себестоимость</div><div className="stat-card__value">{fmt(Math.round(pl.cogs))}</div></div>
              <div className="stat-card"><div className="stat-card__label">🏦 Операционные расходы</div><div className="stat-card__value">{fmt(Math.round(pl.expensesSum))}</div></div>
              <div className="stat-card" style={{ gridColumn: '1 / -1' }}>
                <div className="stat-card__label">📈 Чистая прибыль · маржа {pl.margin.toFixed(1)}%</div>
                <div className="stat-card__value" style={{ color: pl.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(Math.round(pl.netProfit))}</div>
              </div>
            </div>
            <section className="card">
              <div className="card__title"><span className="card__title-text">📋 Расходы по категориям</span></div>
              {pl.expensesDetail.length === 0 ? (
                <div className="empty-state">Расходов не было</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <tbody>
                    {pl.expensesDetail.map((e) => {
                      const isOpen = expandedCategory === e.name;
                      const detail = detailCache[e.name];
                      return (
                        <Fragment key={e.name}>
                          <tr onClick={() => toggleCategory(e.name)} style={{ cursor: 'pointer', background: isOpen ? 'var(--surface-muted)' : undefined }}>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{isOpen ? '▾' : '▸'} {e.name}</td>
                            <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(Math.round(e.amount))}</td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={2} style={{ padding: 0, borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                                <div style={{ padding: '8px 12px 12px', width: '100%', maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                  {detail === 'loading' && <div className="empty-state" style={{ padding: 8 }}>Загрузка…</div>}
                                  {detail === 'error' && <div className="banner banner--warn">Не удалось загрузить детализацию</div>}
                                  {Array.isArray(detail) && detail.length === 0 && <div className="empty-state" style={{ padding: 8 }}>Записей нет</div>}
                                  {Array.isArray(detail) && detail.length > 0 && (
                                    <table style={{ width: '100%', minWidth: 320, borderCollapse: 'collapse', fontSize: 12 }}>
                                      <thead>
                                        <tr style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>
                                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>Дата</th>
                                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>Документ</th>
                                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>Описание</th>
                                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Сумма</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detail.map((row, idx) => (
                                          <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                                            <td style={{ padding: '6px 8px' }}>{row.date || '—'}</td>
                                            <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{row.document}</td>
                                            <td style={{ padding: '6px 8px' }}>{row.description}</td>
                                            <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(Math.round(row.amount))}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        ) : (
          <div className="card"><div className="empty-state">Данных нет</div></div>
        )
      )}

      {error && <div className="banner banner--warn">iiko: {error}</div>}
      {loading && <div className="card"><div className="empty-state">Загрузка из iiko…</div></div>}

      {!loading && tab === 'sales' && (
        <div className="grid">
          {categories.length === 0 ? (
            <div className="card"><div className="empty-state">Данных нет</div></div>
          ) : (() => {
            const grand = categories.reduce((s, c) => s + c.totalRevenue, 0);
            return categories.map((cat) => {
              const pct = grand > 0 ? (cat.totalRevenue / grand) * 100 : 0;
              return (
                <section key={cat.name} className="card" style={{ padding: 0 }}>
                  <div style={{ padding: '14px 16px', background: 'var(--surface-muted)', borderRadius: 'var(--radius) var(--radius) 0 0', display: 'flex', justifyContent: 'space-between', gap: 12, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'rgba(37, 99, 235, 0.08)', pointerEvents: 'none' }} />
                    <div style={{ position: 'relative' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{cat.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{cat.dishes.length} позиций · {fmt(cat.totalAmount)} шт</div>
                    </div>
                    <div style={{ textAlign: 'right', position: 'relative' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Выручка · {pct.toFixed(1)}%</div>
                      <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(Math.round(cat.totalRevenue))}</div>
                    </div>
                  </div>
              <div style={{ width: '100%', maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', minWidth: 320, borderCollapse: 'collapse', fontSize: 13 }}>
                  <tbody>
                    {(openCats[cat.name] ? cat.dishes : cat.dishes.slice(0, VISIBLE_DISHES)).map((d, i) => (
                      <tr key={d.name + i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 16px', width: 32, color: 'var(--text-faint)', fontSize: 11 }}>{i + 1}</td>
                        <td style={{ padding: '8px 16px' }}>{d.name}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', width: 80 }}>{fmt(d.amount)}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', width: 120, color: 'var(--text-muted)' }}>{fmt(Math.round(d.revenue))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
                  {cat.dishes.length > VISIBLE_DISHES && (
                    /* Раньше здесь висело «… и ещё 56 позиций» без всякой
                       возможности их увидеть — а спрашивают обычно как раз
                       про хвост, а не про топ-20. */
                    <button
                      type="button"
                      className="btn btn--sm"
                      style={{ width: '100%', borderRadius: 0, borderLeft: 0, borderRight: 0, borderBottom: 0 }}
                      onClick={() => setOpenCats((prev) => ({ ...prev, [cat.name]: !prev[cat.name] }))}
                    >
                      {openCats[cat.name]
                        ? '▲ Свернуть'
                        : `▼ Показать ещё ${cat.dishes.length - VISIBLE_DISHES} позиций`}
                    </button>
                  )}
                </section>
              );
            });
          })()}
        </div>
      )}

      {!loading && tab === 'waiters' && (
        <section className="card">
          {waiters.length === 0 ? (
            <div className="empty-state">Данных нет</div>
          ) : (
            <StackTable>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                    <SortTh label="Официант" col="name" sort={waiterSort.sort} onSort={waiterSort.toggle} />
                    <SortTh label="Чеков" col="orders" sort={waiterSort.sort} onSort={waiterSort.toggle} align="right" />
                    <SortTh label="Возврат" col="refunds" sort={waiterSort.sort} onSort={waiterSort.toggle} align="right" />
                    <SortTh label="Ср. чек" col="avgCheck" sort={waiterSort.sort} onSort={waiterSort.toggle} align="right" />
                    <SortTh label="Выручка" col="sales" sort={waiterSort.sort} onSort={waiterSort.toggle} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {waiterSort.sorted.map((w) => (
                    <tr key={w.name}>
                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{w.name}</td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{w.orders}</td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: w.refunds > 0 ? 'var(--danger)' : 'var(--text-faint)' }}>{w.refunds || '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{fmt(w.avgCheck)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(Math.round(w.sales))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </StackTable>
          )}
        </section>
      )}

    </div>
  );
}
