import Link from 'next/link';
import { db, schema } from '@/db/client';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth-session';
import { canAccess, sectionForHref } from '@/lib/access';
import { getCurrentFilialIds, getUserFilialIds } from '@/lib/current-filial';
import { fmtMoney, todayTashkent, yesterdayTashkent } from '@/lib/period';
import { RevenueSparkline, type SparkPoint } from '@/components/revenue-sparkline';

export const metadata = { title: 'Главная' };
export const dynamic = 'force-dynamic';

export default async function DashboardHome() {
  const session = await getSession();
  const filialIds = await getCurrentFilialIds();
  const sessionFilialIds = await getUserFilialIds();
  const today = todayTashkent();
  const yesterday = yesterdayTashkent();

  const todayRowsP = filialIds.length === 0
    ? Promise.resolve({ rows: [{ revenue: '0', cash: '0', expenses: '0', wages: '0' }] })
    : db.execute(sql`
        select
          coalesce(sum((details->>'total_sales')::numeric), 0)::bigint as revenue,
          coalesce(sum((details->'payments'->>'cash')::numeric), 0)::bigint as cash,
          coalesce(sum((details->>'total_expenses')::numeric), 0)::bigint as expenses,
          coalesce(sum((
            select coalesce(sum((w->>'wage')::numeric),0)
            from jsonb_array_elements(coalesce(details->'employee_wages','[]'::jsonb)) as w
          )), 0)::bigint as wages
        from bot_actions
        where action_type='cash'
          and filial_id in (${sql.join(filialIds.map((id) => sql`${id}`), sql`, `)})
          and coalesce(details->>'selected_date', to_char(created_at at time zone 'Asia/Tashkent', 'YYYY-MM-DD')) = ${yesterday}
      `) as Promise<{ rows: { revenue: string; cash: string; expenses: string; wages: string }[] }>;

  const weekRowsP = filialIds.length === 0
    ? Promise.resolve({ rows: [] as { d: string; revenue: string }[] })
    : db.execute(sql`
        select
          coalesce(details->>'selected_date', to_char(created_at at time zone 'Asia/Tashkent', 'YYYY-MM-DD')) as d,
          coalesce(sum((details->>'total_sales')::numeric), 0)::bigint as revenue
        from bot_actions
        where action_type='cash'
          and filial_id in (${sql.join(filialIds.map((id) => sql`${id}`), sql`, `)})
          and coalesce(details->>'selected_date', to_char(created_at at time zone 'Asia/Tashkent', 'YYYY-MM-DD'))
              >= to_char((now() at time zone 'Asia/Tashkent')::date - interval '6 day', 'YYYY-MM-DD')
        group by 1
        order by 1
      `) as Promise<{ rows: { d: string; revenue: string }[] }>;

  const [filialList, todayData, weekData] = await Promise.all([
    sessionFilialIds.length > 0
      ? db.select({ name: schema.filials.name }).from(schema.filials).where(inArray(schema.filials.id, sessionFilialIds))
      : Promise.resolve([]),
    todayRowsP,
    weekRowsP,
  ]);

  // Build dense 7-day series (fill gaps with 0)
  const byDay = new Map<string, number>();
  for (const r of weekData.rows) byDay.set(r.d, Number(r.revenue));
  const series: SparkPoint[] = [];
  const base = new Date(today + 'T00:00:00Z');
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, value: byDay.get(key) ?? 0 });
  }

  const filialNames = filialList.map((f) => f.name).join(', ') || '—';
  const td = todayData.rows[0] || { revenue: '0', cash: '0', expenses: '0', wages: '0' };

  const canSeeFinancials = canAccess(session?.role, 'cashier') || canAccess(session?.role, 'safe') || canAccess(session?.role, 'analytics');

  return (
    <div>
      <h1 className="page-title">Добро пожаловать, {session?.name}</h1>
      <p className="page-subtitle">
        Роль: <code>{session?.role}</code> · Филиалы: <b>{filialNames}</b>
      </p>

      {canSeeFinancials && (
        <>
          <h2 style={{ marginTop: 24, marginBottom: 12, fontSize: 14, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Вчера · {yesterday}</h2>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card__label">💰 Выручка</div>
              <div className="stat-card__value" style={{ color: 'var(--success)' }}>{fmtMoney(Number(td.revenue))}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">💵 Наличные</div>
              <div className="stat-card__value">{fmtMoney(Number(td.cash))}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">🛒 Расходы кассира</div>
              <div className="stat-card__value">{fmtMoney(Number(td.expenses))}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">👥 ЗП</div>
              <div className="stat-card__value">{fmtMoney(Number(td.wages))}</div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <RevenueSparkline points={series} />
          </div>
        </>
      )}

      <h2 style={{ marginTop: 24, marginBottom: 12, fontSize: 14, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Быстрые действия</h2>
      {/* Кнопки фильтруются той же матрицей, что и меню: кассиру предлагалось
          «Перемещение», куда его всё равно не пускают. */}
      <div className="quick-actions">
        {[
          { href: '/dashboard/cashier', label: '🧾 Закрыть смену', primary: true },
          { href: '/dashboard/inbox', label: '📨 Подтверждения', primary: true },
          { href: '/dashboard/safe', label: '💰 Сейф' },
          { href: '/dashboard/balances', label: '📦 Остатки' },
          { href: '/dashboard/transfer', label: '🔄 Перемещение' },
          { href: '/dashboard/invoice', label: '🚚 Приход накладной' },
          { href: '/dashboard/history', label: '🗂️ История' },
        ]
          .filter((a) => {
            const section = sectionForHref(a.href);
            return !section || canAccess(session?.role, section);
          })
          .map((a) => (
            <Link key={a.href} href={a.href} className={`btn${a.primary ? ' btn--primary' : ''}`}>{a.label}</Link>
          ))}
      </div>
    </div>
  );
}
