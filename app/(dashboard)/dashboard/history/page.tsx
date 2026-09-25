import Link from 'next/link';
import { getSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { db, schema } from '@/db/client';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { toURLSearchParams } from '@/lib/search-params';
import { parsePeriod, fmtMoney, fmtDate, todayTashkent } from '@/lib/period';
import { PeriodPicker } from '@/components/period-picker';
import { Copyable } from '@/components/copy-button';
import { InlineSearch } from '@/components/inline-search';
import { StackTable } from '@/components/stack-table';
import { requireAccess } from '@/lib/access';

export const metadata = { title: 'История' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function HistoryPage({ searchParams }: { searchParams: { [k: string]: string | string[] | undefined } }) {
  const session = await getSession();
  requireAccess(session?.role, 'history', '/dashboard');
  const filialIds = await getCurrentFilialIds();
  const sp = toURLSearchParams(searchParams);
  const period = parsePeriod(sp);
  const today = todayTashkent();
  const page = Math.max(1, Number(sp.get('page') || 1));
  const offset = (page - 1) * PAGE_SIZE;
  const q = (sp.get('q') || '').trim();

  const dateExpr = sql<string>`coalesce(${schema.botActions.details}->>'selected_date', to_char(${schema.botActions.createdAt} at time zone 'Asia/Tashkent', 'YYYY-MM-DD'))`;

  const where = and(
    inArray(schema.botActions.filialId, filialIds),
    eq(schema.botActions.actionType, 'cash'),
    sql`${dateExpr} between ${period.from} and ${period.to}`,
    q ? sql`(${schema.botActions.documentNumber} ilike ${'%' + q + '%'} or ${schema.botActions.userName} ilike ${'%' + q + '%'})` : sql`true`
  );

  const [rows, [countRow]] = filialIds.length === 0
    ? [[], [{ c: 0 }]]
    : await Promise.all([
        db
          .select({
            id: schema.botActions.id,
            documentNumber: schema.botActions.documentNumber,
            userName: schema.botActions.userName,
            date: dateExpr,
            cash: sql<string>`(${schema.botActions.details}->'payments'->>'cash')`,
            totalSales: sql<string>`(${schema.botActions.details}->>'total_sales')`,
            totalExpenses: sql<string>`(${schema.botActions.details}->>'total_expenses')`,
            iikoRevenue: sql<string>`(${schema.botActions.details}->>'iiko_revenue')`,
            wageCount: sql<number>`jsonb_array_length(coalesce(${schema.botActions.details}->'employee_wages','[]'::jsonb))`,
          })
          .from(schema.botActions)
          .where(where)
          .orderBy(desc(dateExpr), desc(schema.botActions.id))
          .limit(PAGE_SIZE)
          .offset(offset),
        db.select({ c: sql<number>`count(*)::int` }).from(schema.botActions).where(where),
      ]);

  const total = Number(countRow?.c || 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageUrl(p: number) {
    const next = new URLSearchParams(sp);
    next.set('page', String(p));
    return `?${next.toString()}`;
  }

  return (
    <div className="grid">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">История смен</h1>
          <p className="page-subtitle">{total} смен за период · стр. {page} из {totalPages}</p>
        </div>
        {total > 0 && (
          <a href={`/api/history/export?from=${period.from}&to=${period.to}`} className="btn btn--sm">
            ⬇ Экспорт CSV
          </a>
        )}
      </div>

      <PeriodPicker from={period.from} to={period.to} activePreset={sp.get('preset') || 'this_month'} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <InlineSearch placeholder="Поиск по номеру документа или имени кассира" />
      </div>

      <form className="card" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {Array.from(sp.entries()).filter(([k]) => k !== 'q' && k !== 'page').map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input name="q" defaultValue={q} className="input" placeholder="Поиск по номеру документа или имени кассира…" />
        <button type="submit" className="btn btn--primary btn--sm">Найти</button>
        {q && <a href={`?${Array.from(sp.entries()).filter(([k]) => k !== 'q' && k !== 'page').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`} className="btn btn--sm">✕</a>}
      </form>

      <section className="card">
        {rows.length === 0 ? (
          <div className="empty-state">Смен нет</div>
        ) : (
          <StackTable>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Дата</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Документ</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Кассир</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Нал</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Выручка</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Расходы</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>ЗП (чел)</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>iiko</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Разница</th>
                  <th style={{ borderBottom: '1px solid var(--border)' }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-today={r.date === today || undefined} className="row-link">
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                      {/* Ссылка внутри ячейки, а не onClick на строке: работает
                          средняя кнопка, «открыть в новой вкладке» и клавиатура. */}
                      <Link href={`/dashboard/history/${r.id}`} className="row-link__target">{fmtDate(r.date)}</Link>
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'monospace' }}><Copyable value={r.documentNumber || ''} /></td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{r.userName}</td>
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Number(r.cash) || 0)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Number(r.totalSales) || 0)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Number(r.totalExpenses) || 0)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{r.wageCount}</td>
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                      {r.iikoRevenue ? fmtMoney(Number(r.iikoRevenue)) : '—'}
                    </td>
                    {(() => {
                      const iiko = Number(r.iikoRevenue) || 0;
                      const sales = Number(r.totalSales) || 0;
                      const diff = iiko ? sales - iiko : 0;
                      return (
                        <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: !iiko ? 'var(--text-muted)' : diff === 0 ? 'var(--green)' : 'var(--red)', fontWeight: diff !== 0 && iiko ? 600 : 400 }}>
                          {!iiko ? '—' : diff === 0 ? '0 ✓' : fmtMoney(diff)}
                        </td>
                      );
                    })()}
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', color: 'var(--text-faint)' }} aria-hidden="true">→</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </StackTable>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 4px 0', borderTop: '1px solid var(--border)', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {page > 2 && <Link href={pageUrl(1)} className="btn btn--sm" title="Первая страница">«</Link>}
              {page > 1
                ? <Link href={pageUrl(page - 1)} className="btn btn--sm">← Назад</Link>
                : <span />}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} из {total} · стр. {page}/{totalPages}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {page < totalPages
                ? <Link href={pageUrl(page + 1)} className="btn btn--sm">Дальше →</Link>
                : <span />}
              {page < totalPages - 1 && <Link href={pageUrl(totalPages)} className="btn btn--sm" title="Последняя страница">»</Link>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
