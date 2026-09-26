import { requireAccess } from '@/lib/access';
import { getSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { toURLSearchParams } from '@/lib/search-params';
import { parsePeriod, fmtMoney, fmtDate, todayTashkent } from '@/lib/period';
import { getSafeStats } from '@/lib/safe';
import { listAdminExpenses } from '@/lib/admin-expense';
import { listSafeAudits } from '@/lib/safe-audit';
import { PeriodPicker } from '@/components/period-picker';
import { AdminExpenseForm, DeleteExpenseButton } from '@/components/admin-expense-form';
import { SafeRecountButton, DeleteSafeAuditButton } from '@/components/safe-recount-modal';
import { StackTable } from '@/components/stack-table';

export const metadata = { title: 'Сейф' };
export const dynamic = 'force-dynamic';

export default async function SafePage({ searchParams }: { searchParams: { [k: string]: string | string[] | undefined } }) {
  requireAccess((await getSession())?.role, 'safe', '/dashboard');
  const session = await getSession();
  const filialIds = await getCurrentFilialIds();
  const sp = toURLSearchParams(searchParams);
  const period = parsePeriod(sp);
  const today = todayTashkent();
  const [stats, expenses, safeAudits] = await Promise.all([
    getSafeStats(filialIds, period.from, period.to),
    listAdminExpenses(filialIds, period.from, period.to),
    listSafeAudits(filialIds, period.from, period.to),
  ]);
  const canEdit = ['admin', 'director'].includes((session?.role || '').split(':')[0]);
  const primaryFilial = filialIds[0] || 0;

  return (
    <div className="grid">
      <div>
        <h1 className="page-title">Сейф</h1>
        <p className="page-subtitle">Все наличные минус административные расходы. Зелёная карточка — на конец выбранного периода.</p>
      </div>

      <PeriodPicker from={period.from} to={period.to} activePreset={sp.get('preset') || 'this_month'} />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">💰 Остаток сейфа на {period.to}</div>
          <div className="stat-card__value" style={{ color: 'var(--success)' }}>{fmtMoney(stats.allTimeBalance)} сум</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">💵 Сдано налом за период</div>
          <div className="stat-card__value">{fmtMoney(stats.periodCashIn)} сум</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">💸 Расходы из сейфа за период</div>
          <div className="stat-card__value" style={{ color: 'var(--danger)' }}>{fmtMoney(stats.periodAdminExpenses)} сум</div>
        </div>
      </div>

      {canEdit && primaryFilial > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <SafeRecountButton defaultDate={today} defaultFilialId={primaryFilial} />
          <AdminExpenseForm defaultDate={today} defaultFilialId={primaryFilial} />
        </div>
      )}

      <section className="card">
        <div className="card__title"><span className="card__title-text">🏦 Расходы из сейфа за период</span></div>
        {expenses.length === 0 ? (
          <div className="empty-state">За период расходов нет</div>
        ) : (
          <StackTable>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Дата</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Название</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Кто</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Сумма</th>
                  {canEdit && <th style={{ padding: '10px 8px', width: 40, borderBottom: '1px solid var(--border)' }}></th>}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{fmtDate(e.date)}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{e.name}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{e.userName || '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: 'var(--danger)', fontWeight: 600 }}>{fmtMoney(e.amount)}</td>
                    {canEdit && <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}><DeleteExpenseButton id={e.id} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </StackTable>
        )}
      </section>

      <section className="card">
        <div className="card__title"><span className="card__title-text">📊 Движение по дням</span></div>
        {stats.daily.length === 0 ? (
          <div className="empty-state">За выбранный период данных нет</div>
        ) : (
          <StackTable>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Дата</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Сдано налом</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Расход из сейфа</th>
                </tr>
              </thead>
              <tbody>
                {stats.daily.map((d) => (
                  <tr key={d.date} data-today={d.date === today || undefined}>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{fmtDate(d.date)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(d.cashIn)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', color: d.expense > 0 ? 'var(--danger)' : 'var(--text-faint)' }}>{d.expense > 0 ? fmtMoney(d.expense) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </StackTable>
        )}
      </section>

      {/* Журнал фактических пересчётов сейфа */}
      <section className="card">
        <div className="card__title">
          <span className="card__title-text">📋 Журнал фактических пересчётов сейфа</span>
          {canEdit && primaryFilial > 0 && (
            <SafeRecountButton defaultDate={today} defaultFilialId={primaryFilial} />
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Зафиксированные суммы при ручном пересчёте наличных (для справки и сверки). Записи пересчёта носят исключительно справочный характер и никак не влияют на баланс, кассовые остатки или расходы.
        </div>
        {safeAudits.length === 0 ? (
          <div className="empty-state">За выбранный период пересчётов не зафиксировано</div>
        ) : (
          <StackTable>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Дата пересчёта</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Посчитанная сумма (Факт)</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Кто пересчитал</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Примечание</th>
                  {canEdit && <th style={{ padding: '10px 8px', width: 40, borderBottom: '1px solid var(--border)' }}></th>}
                </tr>
              </thead>
              <tbody>
                {safeAudits.map((audit) => (
                  <tr key={audit.id}>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                      📅 {fmtDate(audit.date)}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#4f46e5', fontSize: 14 }}>
                      {fmtMoney(audit.amount)} сум
                    </td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                      👤 {audit.userName || '—'}
                    </td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', color: audit.comment ? 'var(--text)' : 'var(--text-muted)', fontStyle: audit.comment ? 'normal' : 'italic' }}>
                      {audit.comment || '—'}
                    </td>
                    {canEdit && (
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                        <DeleteSafeAuditButton id={audit.id} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </StackTable>
        )}
      </section>
    </div>
  );
}
