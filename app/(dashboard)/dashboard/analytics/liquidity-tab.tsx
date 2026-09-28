'use client';

import { useEffect, useState } from 'react';
import { SegmentBar, StatusBadge } from '@/components/charts';
import { StackTable } from '@/components/stack-table';
import { SortTh, useSort } from '@/components/sortable';

type Status = 'liquid' | 'slow' | 'dead' | 'idle';

type Item = {
  productId: string; name: string; unit: string; category: string; store: string;
  balanceAmount: number; balanceSum: number;
  consumedAmount: number; consumedSum: number;
  turnoverDays: number | null; koz: number; status: Status;
};
type StatusMap = Record<Status, { count: number; sum: number }>;
type StoreGroup = { store: string; items: Item[]; balanceSum: number; consumedSum: number; koz: number; byStatus: StatusMap; freeable: number };
type Data = {
  windowDays: number; normDays: number;
  stores: StoreGroup[]; items: Item[];
  totals: { balanceSum: number; consumedSum: number; koz: number; positions: number; byStatus: StatusMap; freeable: number };
  topFreeable: Item[];
};

const LABEL: Record<Status, string> = { liquid: 'Ликвид', slow: 'Медлен', dead: 'Неликвид', idle: 'Без движ' };
const TONE: Record<Status, 'success' | 'warning' | 'danger' | 'neutral'> = { liquid: 'success', slow: 'warning', dead: 'danger', idle: 'neutral' };
const COLOR: Record<Status, string> = { liquid: 'var(--success)', slow: 'var(--warning)', dead: 'var(--danger)', idle: 'var(--text-faint)' };
const ORDER: Status[] = ['liquid', 'slow', 'dead', 'idle'];

function fmt(n: number) { return Math.round(n).toLocaleString('ru-RU'); }
function qty(n: number) { return (Math.round(n * 100) / 100).toLocaleString('ru-RU'); }

const LIMIT = 300;

export function LiquidityTab() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [query, setQuery] = useState('');
  const [windowDays, setWindowDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/iiko/analytics/liquidity?window=${windowDays}&norm=30`);
        const json = await res.json();
        if (cancelled) return;
        setData(json.data || null);
        if (json.error) setError(json.error);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'fetch failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [windowDays]);

  if (loading) return <div className="card"><div className="empty-state">Считаю оборачиваемость…</div></div>;
  if (!data) return <div className="banner banner--error">{error || 'Нет данных'}</div>;

  const q = query.trim().toLowerCase();
  const visible = data.items.filter(
    (i) => (filter === 'all' || i.status === filter) && (!q || i.name.toLowerCase().includes(q) || i.store.toLowerCase().includes(q))
  );

  // Строк бывает под тысячу — рисуем часть, но теперь порядок выбирает человек.
  const sorter = useSort<typeof visible[number], 'name' | 'store' | 'balanceSum' | 'consumedSum' | 'turnoverDays' | 'koz'>(
    visible, 'balanceSum', (it, key) => (key === 'name' || key === 'store' ? String(it[key] ?? '') : (it[key] as number | null) ?? -1)
  );

  return (
    <div className="grid">
      {error && <div className="banner banner--warn">{error}</div>}

      <div className="card" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
        {ORDER.map((s) => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="legend-pill__dot" style={{ background: COLOR[s] }} />
            <b>{LABEL[s]}</b>
          </span>
        ))}
        <span style={{ color: 'var(--text-muted)' }}><b>Оборачиваемость</b> — дней хватит остатка</span>
        <span style={{ color: 'var(--text-muted)' }}><b>КОЗ</b> — сколько раз обернули запас за окно</span>
      </div>

      <div className="stat-grid">
        {ORDER.map((s) => (
          <div className="stat-card" key={s} style={{ borderLeft: `3px solid ${COLOR[s]}` }}>
            <div className="stat-card__label" style={{ color: COLOR[s], fontWeight: 600 }}>{LABEL[s]}</div>
            <div className="stat-card__value">{data.totals.byStatus[s].count} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', fontFamily: 'inherit' }}>позиций</span></div>
            <div className="stat-card__delta">
              <span style={{ fontFamily: 'var(--font-num)' }}>{fmt(data.totals.byStatus[s].sum)}</span>
              <span style={{ color: 'var(--text-faint)' }}>
                {data.totals.balanceSum > 0 ? `${Math.round((data.totals.byStatus[s].sum / data.totals.balanceSum) * 100)}%` : ''}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <b style={{ fontSize: 14 }}>КОЗ {data.totals.koz.toFixed(2)}</b>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          по {data.totals.positions} позициям за окно {data.windowDays} дн. · средний запас ≈ текущему (снимок начала окна недоступен)
        </span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center', marginRight: 4 }}>Окно:</span>
          {[14, 30, 60, 90].map((w) => (
            <button key={w} type="button" className={`btn btn--sm ${windowDays === w ? 'btn--soft' : ''}`} onClick={() => setWindowDays(w)}>{w} дн.</button>
          ))}
        </div>
      </div>

      {data.totals.freeable > 0 && (
        <section className="insight">
          <div className="insight__body">
            <div className="insight__title">📦 Потенциальный эффект: разбор неликвида</div>
            <div className="insight__desc">
              В {data.totals.byStatus.dead.count + data.totals.byStatus.idle.count} позициях без движения и с избыточным запасом заморожены деньги.
              Распродажа, спецпредложения или возврат поставщику высвободят их в оборот.
            </div>
            <div className="insight__chips">
              {data.topFreeable.map((i) => (
                <span key={i.productId + i.store} className="insight__chip">{i.name} <b>{fmt(i.balanceSum)}</b></span>
              ))}
            </div>
          </div>
          <div className="insight__total">
            <div className="insight__amount">{fmt(data.totals.freeable)}</div>
            <div className="insight__caption">можно высвободить</div>
          </div>
        </section>
      )}

      <div className="grid grid--2">
        {data.stores.map((g) => (
          <section className="card" key={g.store}>
            <div className="card__title">
              <span className="card__title-text">🏬 {g.store}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Норма: {data.normDays} дн.</span>
            </div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              {g.items.length} позиций · остаток <b style={{ fontFamily: 'var(--font-num)' }}>{fmt(g.balanceSum)}</b>
            </div>
            <SegmentBar segments={ORDER.map((s) => ({ value: g.byStatus[s].sum, color: COLOR[s], label: LABEL[s] }))} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(80px, 100%), 1fr))', gap: 8, marginTop: 12, fontSize: 12 }}>
              {ORDER.map((s) => (
                <div key={s}>
                  <div style={{ color: COLOR[s], fontWeight: 600 }}>{LABEL[s]}</div>
                  <div style={{ fontFamily: 'var(--font-num)' }}>{fmt(g.byStatus[s].sum)}</div>
                  <div style={{ color: 'var(--text-faint)' }}>{g.byStatus[s].count} шт</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 13 }}>
              <span>КОЗ <b style={{ fontFamily: 'var(--font-num)' }}>{g.koz.toFixed(2)}</b></span>
              <span style={{ color: 'var(--text-muted)' }}>
                Высвободить <b style={{ color: 'var(--danger)', fontFamily: 'var(--font-num)' }}>{fmt(g.freeable)}</b>
              </span>
            </div>
          </section>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <input className="input input--inline" placeholder="Поиск товара…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 140, flex: '1 1 140px' }} />
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className={`btn btn--sm ${filter === 'all' ? 'btn--soft' : ''}`} onClick={() => setFilter('all')}>Все</button>
            {ORDER.map((s) => (
              <button key={s} type="button" className={`btn btn--sm ${filter === s ? 'btn--soft' : ''}`} onClick={() => setFilter(s)}>{LABEL[s]}</button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{visible.length} позиций</span>
        </div>
        <StackTable>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <SortTh label="Продукт" col="name" sort={sorter.sort} onSort={sorter.toggle} />
                <SortTh label="Склад" col="store" sort={sorter.sort} onSort={sorter.toggle} />
                <th style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Статус</th>
                <SortTh label="Остаток" col="balanceSum" sort={sorter.sort} onSort={sorter.toggle} align="right" />
                <SortTh label="Расход" col="consumedSum" sort={sorter.sort} onSort={sorter.toggle} align="right" />
                <SortTh label="Оборачиваемость" col="turnoverDays" sort={sorter.sort} onSort={sorter.toggle} align="right" />
                <SortTh label="КОЗ" col="koz" sort={sorter.sort} onSort={sorter.toggle} align="right" />
              </tr>
            </thead>
            <tbody>
              {sorter.sorted.slice(0, LIMIT).map((i) => (
                <tr key={i.productId + i.store}>
                  <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600 }}>{i.name}</div>
                    {i.category && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{i.category}</div>}
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{i.store}</td>
                  <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                    <StatusBadge tone={TONE[i.status]}>{LABEL[i.status]}</StatusBadge>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-num)' }}>
                    {fmt(i.balanceSum)}
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{qty(i.balanceAmount)} {i.unit}</div>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-num)' }}>
                    {fmt(i.consumedSum)}
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{qty(i.consumedAmount)} {i.unit}</div>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-num)', color: COLOR[i.status], fontWeight: 600 }}>
                    {i.turnoverDays == null ? '—' : `${i.turnoverDays.toFixed(i.turnoverDays < 10 ? 1 : 0)} дн.`}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-num)' }}>{i.koz.toFixed(2)}</td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={7}><div className="empty-state">Ничего не найдено</div></td></tr>}
              {visible.length > LIMIT && (
                /* Отсечка была немой: показывалось 300 строк из тысячи, и об
                   этом человек не узнавал никак. Теперь хотя бы сказано, и
                   сортировка позволяет вытащить наверх нужное. */
                <tr><td colSpan={7} style={{ padding: '8px', fontSize: 11, color: 'var(--text-faint)', textAlign: 'center' }}>
                  Показаны первые {LIMIT} из {visible.length} — отсортируйте или сузьте фильтр
                </td></tr>
              )}
            </tbody>
          </table>
        </StackTable>
      </div>
    </div>
  );
}
