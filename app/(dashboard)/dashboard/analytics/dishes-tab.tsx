'use client';

import { useEffect, useMemo, useState } from 'react';
import { StackTable } from '@/components/stack-table';

type AbcClass = 'A' | 'B' | 'C';
type Severity = 'ok' | 'above' | 'critical' | 'urgent';

type Dish = {
  category: string;
  name: string;
  amount: number;
  revenue: number;
  cost: number;
  costPerItem: number;
  fcPercent: number;
  profit: number;
  markupPercent: number;
  revenueShare: number;
  abc: AbcClass;
  abcAmount: AbcClass;
  abcProfit: AbcClass;
  severity: Severity;
  potential: number;
};

type Totals = { revenue: number; cost: number; profit: number; fcPercent: number; dishCount: number };
type Bucket = { severity: Severity; count: number; revenue: number };
type Data = {
  dishes: Dish[];
  totals: Totals;
  targetFc: number;
  totalPotential: number;
  topPotential: Dish[];
  severityBuckets: Bucket[];
};

const SEVERITY_LABEL: Record<Severity, string> = {
  urgent: 'срочно',
  critical: 'критично',
  above: 'выше цели',
  ok: 'в норме',
};

const SEVERITY_COLOR: Record<Severity, string> = {
  urgent: 'var(--danger)',
  critical: 'var(--danger)',
  above: 'var(--warning)',
  ok: 'var(--success)',
};

type SortKey = 'revenue' | 'fcPercent' | 'costPerItem' | 'amount' | 'profit' | 'potential';

function fmt(n: number) {
  return Math.round(n).toLocaleString('ru-RU');
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

function fcColor(fc: number, target: number): string {
  const over = fc - target;
  if (over > 5) return 'var(--danger)';
  if (over > 0) return 'var(--warning)';
  return 'var(--success)';
}

const ABC_COLOR: Record<AbcClass, string> = {
  A: 'var(--success)',
  B: 'var(--warning)',
  C: 'var(--text-faint)',
};

const ABC_HINT: Record<AbcClass, string> = {
  A: 'Топ-позиции: дают 80% выручки',
  B: 'Средние: следующие 15% выручки',
  C: 'Хвост: последние 5% выручки',
};

export function DishesTab({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('revenue');
  const [abcFilter, setAbcFilter] = useState<AbcClass | 'all'>('all');
  const [query, setQuery] = useState('');
  const [targetFc, setTargetFc] = useState(25);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/iiko/analytics/menu?from=${from}&to=${to}&targetFc=${targetFc}`);
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
  }, [from, to, targetFc]);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const rows = data.dishes.filter(
      (d) => (abcFilter === 'all' || d.abc === abcFilter) && (!q || d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q))
    );
    return [...rows].sort((a, b) => b[sort] - a[sort]);
  }, [data, sort, abcFilter, query]);

  if (loading) return <div className="card"><div className="empty-state">Загрузка из iiko…</div></div>;
  if (!data) return <div className="banner banner--error">{error || 'Нет данных'}</div>;

  const t = data.totals;
  const overTarget = data.dishes.filter((d) => d.potential > 0).length;

  return (
    <div className="grid">
      {error && <div className="banner banner--warn">{error}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">💰 Выручка</div>
          <div className="stat-card__value" style={{ color: 'var(--success)' }}>{fmt(t.revenue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">🧾 Себестоимость</div>
          <div className="stat-card__value">{fmt(t.cost)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">📈 Валовая прибыль</div>
          <div className="stat-card__value">{fmt(t.profit)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">🍳 Food cost</div>
          <div className="stat-card__value" style={{ color: fcColor(t.fcPercent, data.targetFc) }}>{pct(t.fcPercent)}</div>
        </div>
      </div>

      {data.totalPotential > 0 && (
        <section className="insight">
          <div className="insight__body">
            <div className="insight__title">📈 Потенциальный эффект: снизить food cost</div>
            <div className="insight__desc">
              У {overTarget} {overTarget === 1 ? 'позиции' : 'позиций'} food cost выше целевых {data.targetFc}%. Вот сколько вернётся, если довести их до цели —
              через цену, порцию или замену поставщика.
            </div>
            <div className="insight__chips">
              {data.topPotential.map((d) => (
                <span key={d.name} className="insight__chip">{d.name} <b>+{fmt(d.potential)}</b></span>
              ))}
            </div>
          </div>
          <div className="insight__total">
            <div className="insight__amount">+{fmt(data.totalPotential)}</div>
            <div className="insight__caption">за период</div>
          </div>
        </section>
      )}

      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Целевой food cost:</span>
        {[20, 25, 30, 35].map((v) => (
          <button key={v} type="button" className={`btn btn--sm ${targetFc === v ? 'btn--soft' : ''}`} onClick={() => setTargetFc(v)}>{v}%</button>
        ))}
        <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {data.severityBuckets.filter((b) => b.count > 0).map((b) => (
            <span key={b.severity} style={{ fontSize: 12 }}>
              <b style={{ color: SEVERITY_COLOR[b.severity] }}>{SEVERITY_LABEL[b.severity]}</b>
              <span style={{ color: 'var(--text-muted)' }}> — {b.count} · {fmt(b.revenue)}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <input
            className="input input--inline"
            placeholder="Поиск блюда…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minWidth: 140, flex: '1 1 140px' }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'A', 'B', 'C'] as const).map((c) => (
              <button
                key={c}
                type="button"
                className={`btn btn--sm ${abcFilter === c ? 'btn--soft' : ''}`}
                onClick={() => setAbcFilter(c)}
                title={c === 'all' ? 'Все блюда' : ABC_HINT[c]}
              >
                {c === 'all' ? 'Все' : c}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Сортировка:</span>
            {([
              ['revenue', 'Выручка'],
              ['fcPercent', 'Food cost'],
              ['costPerItem', 'Себест. порции'],
              ['profit', 'Прибыль'],
              ['potential', 'Потенциал'],
              ['amount', 'Кол-во'],
            ] as [SortKey, string][]).map(([k, label]) => (
              <button key={k} type="button" className={`btn btn--sm ${sort === k ? 'btn--soft' : ''}`} onClick={() => setSort(k)}>
                {label}
              </button>
            ))}
            <a className="btn btn--sm" href={`/api/iiko/analytics/menu/export?from=${from}&to=${to}`}>⬇️ Excel</a>
          </div>
        </div>

        <StackTable>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Блюдо</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid var(--border)' }} title="ABC по количеству / выручке / прибыли">ABC<div style={{ fontSize: 9, fontWeight: 400, textTransform: 'none' }}>шт·₽·приб</div></th>
                <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Кол-во</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Выручка</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Себест. порции</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Food cost</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Наценка</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Прибыль</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Потенциал</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d, i) => (
                <tr key={`${d.category}/${d.name}/${i}`}>
                  <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.category} · {d.revenueShare.toFixed(1)}% выручки</div>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    <span title={`По количеству: ${ABC_HINT[d.abcAmount]}`} style={{ fontWeight: 700, color: ABC_COLOR[d.abcAmount] }}>{d.abcAmount}</span>
                    <span style={{ color: 'var(--text-faint)' }}>·</span>
                    <span title={`По выручке: ${ABC_HINT[d.abc]}`} style={{ fontWeight: 700, color: ABC_COLOR[d.abc] }}>{d.abc}</span>
                    <span style={{ color: 'var(--text-faint)' }}>·</span>
                    <span title={`По прибыли: ${ABC_HINT[d.abcProfit]}`} style={{ fontWeight: 700, color: ABC_COLOR[d.abcProfit] }}>{d.abcProfit}</span>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.amount)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.revenue)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.costPerItem)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: fcColor(d.fcPercent, data.targetFc) }} title={SEVERITY_LABEL[d.severity]}>{pct(d.fcPercent)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{pct(d.markupPercent)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.profit)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: d.potential > 0 ? 'var(--success)' : 'var(--text-faint)' }}>
                    {d.potential > 0 ? `+${fmt(d.potential)}` : '—'}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={9}><div className="empty-state">Ничего не найдено</div></td></tr>
              )}
            </tbody>
          </table>
        </StackTable>
      </div>
    </div>
  );
}
