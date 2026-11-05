import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { db, schema } from '@/db/client';
import { and, eq, inArray } from 'drizzle-orm';
import { fmtMoney, fmtDate } from '@/lib/period';
import { Copyable } from '@/components/copy-button';
import { baseRole } from '@/lib/access';

export const metadata = { title: 'Смена' };
export const dynamic = 'force-dynamic';

type EditHistoryEntry = {
  edited_at: string;
  edited_by: string;
  reason?: string | null;
};

type Details = {
  comment?: string;
  surplus?: number;
  shortage?: number;
  difference?: number;
  iiko_cash?: number;
  iiko_revenue?: number;
  iiko_error?: string | null;
  total_sales?: number;
  total_expenses?: number;
  selected_date?: string;
  payments?: Record<string, number>;
  expenses?: { name: string; amount: number }[];
  employee_wages?: { name: string; wage: number; employeeId?: string }[];
  edit_history?: EditHistoryEntry[];
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Наличные',
  humo: 'Humo',
  uzcard: 'Uzcard',
  rahmat: 'Rahmat',
  uzum: 'Uzum',
  yandex: 'Yandex',
  online: 'Онлайн',
  encashment: 'Инкассация',
};

export default async function ShiftPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  const role = session ? baseRole(session.role) : '';
  const canEdit = role === 'admin' || role === 'director';
  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) notFound();

  const [row] = await db
    .select()
    .from(schema.botActions)
    .where(and(
      eq(schema.botActions.id, Number(params.id)),
      eq(schema.botActions.actionType, 'cash'),
      // Чужой филиал по прямой ссылке открываться не должен.
      inArray(schema.botActions.filialId, filialIds)
    ))
    .limit(1);

  if (!row) notFound();

  const d = (row.details || {}) as Details;
  const payments = d.payments || {};
  const expenses = d.expenses || [];
  const wages = (d.employee_wages || []).filter((w) => Number(w.wage) > 0);
  const wagesTotal = wages.reduce((s, w) => s + (Number(w.wage) || 0), 0);
  const expensesTotal = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const diff = Number(d.difference ?? 0);

  return (
    <div className="grid">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Link href="/dashboard/history" className="btn btn--sm">← К истории смен</Link>
          </div>
          <h1 className="page-title">
            Смена {fmtDate(d.selected_date || '')}
          </h1>
          <p className="page-subtitle">
            Кассир: {row.userName} · документ <Copyable value={row.documentNumber || '—'} />
          </p>
        </div>

        {canEdit && (
          <Link
            href={`/dashboard/history/${params.id}/edit`}
            className="btn btn--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, padding: '10px 18px' }}
          >
            ✏️ Изменить кассовую смену
          </Link>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">💰 Выручка по кассе</div>
          <div className="stat-card__value">{fmtMoney(Number(d.total_sales) || 0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">📊 Выручка по iiko</div>
          <div className="stat-card__value">{d.iiko_revenue ? fmtMoney(d.iiko_revenue) : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">🛒 Расходы</div>
          <div className="stat-card__value">{fmtMoney(expensesTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">👥 Зарплаты</div>
          <div className="stat-card__value">{fmtMoney(wagesTotal)}</div>
        </div>
      </div>

      {diff !== 0 && (
        <div className={`banner ${diff > 0 ? 'banner--success' : 'banner--error'}`}>
          {diff > 0
            ? `Излишек ${fmtMoney(diff)} — кассир ввёл больше, чем iiko`
            : `Недостача ${fmtMoney(Math.abs(diff))} — кассир ввёл меньше, чем iiko`}
        </div>
      )}

      {d.iiko_error && (
        <div className="banner banner--warn">⚠️ iiko при закрытии был недоступен: {d.iiko_error}</div>
      )}

      {d.comment && <div className="banner banner--info">💬 {d.comment}</div>}

      <section className="card">
        <h2 className="card__title">💳 Оплаты</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <tbody>
            {Object.entries(payments)
              .filter(([, v]) => Number(v) !== 0)
              .map(([k, v]) => (
                <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 0' }}>{PAYMENT_LABEL[k] || k}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {fmtMoney(Number(v) || 0)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="card__title">🛒 Расходы</h2>
        {expenses.length === 0 ? (
          <div className="empty-state">Расходов нет</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <tbody>
              {expenses.map((e, i) => (
                <tr key={i} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '10px 0' }}>{e.name}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--red)' }}>
                    {fmtMoney(Number(e.amount) || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="totals-row">
          Итого расходов
          <span className="totals-row__value">{fmtMoney(expensesTotal)}</span>
        </div>
      </section>

      <section className="card">
        <div className="card__title"><span className="card__title-text">👥 Зарплаты сотрудников</span></div>
        {wages.length === 0 ? (
          <div className="empty-state">Выплат зарплат нет</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 0', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Сотрудник</th>
                <th style={{ padding: '8px 0', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {wages.map((w, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0' }}>{w.name}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {fmtMoney(Number(w.wage) || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="totals-row">
          Итого зарплат
          <span className="totals-row__value">{fmtMoney(wagesTotal)}</span>
        </div>
      </section>

      {d.edit_history && d.edit_history.length > 0 && (
        <section className="card">
          <h2 className="card__title">✏️ История правок ({d.edit_history.length})</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {d.edit_history.map((e, i) => (
                <tr key={i} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                    {new Date(e.edited_at).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}
                  </td>
                  <td style={{ padding: '8px 0' }}>{e.edited_by}</td>
                  <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>{e.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Link
            href={`/dashboard/history/${params.id}/edit`}
            className="btn btn--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, padding: '10px 18px' }}
          >
            ✏️ Изменить кассовую смену
          </Link>
        </div>
      )}
    </div>
  );
}
