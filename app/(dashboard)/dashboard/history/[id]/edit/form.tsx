'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const PAYMENT_FIELDS = [
  { key: 'cash', label: 'Наличные' },
  { key: 'encashment', label: 'Наличные-' },
  { key: 'uzcard', label: 'Uzcard' },
  { key: 'humo', label: 'Humo' },
  { key: 'online', label: 'Click / Payme' },
  { key: 'rahmat', label: 'Rahmat' },
  { key: 'uzum', label: 'Uzum' },
  { key: 'yandex', label: 'Яндекс Еда' },
] as const;

type PaymentKey = (typeof PAYMENT_FIELDS)[number]['key'];

function fmt(n: number) { return n.toLocaleString('ru-RU'); }

type Props = {
  shiftId: number;
  details: Record<string, unknown>;
};

export default function ShiftEditForm({ shiftId, details }: Props) {
  const router = useRouter();
  const pay = (details.payments || {}) as Record<string, number>;
  const exps = (details.expenses || []) as { name: string; amount: number }[];

  const [payments, setPayments] = useState<Record<PaymentKey, string>>(
    Object.fromEntries(PAYMENT_FIELDS.map((f) => [f.key, pay[f.key] ? String(pay[f.key]) : ''])) as Record<PaymentKey, string>
  );
  const [expenses, setExpenses] = useState(exps.map((e) => ({ name: e.name, amount: e.amount ? String(e.amount) : '' })));
  const [surplus, setSurplus] = useState(details.surplus ? String(details.surplus) : '');
  const [shortage, setShortage] = useState(details.shortage ? String(details.shortage) : '');
  const [comment, setComment] = useState((details.comment as string) || '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const totalSales = useMemo(
    () => PAYMENT_FIELDS.reduce((s, f) => s + (parseFloat(payments[f.key]) || 0), 0),
    [payments]
  );
  const totalExp = useMemo(
    () => expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
    [expenses]
  );

  async function save() {
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cashier/${shiftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: Object.fromEntries(PAYMENT_FIELDS.map((f) => [f.key, parseFloat(payments[f.key]) || 0])),
          expenses: expenses.filter((e) => parseFloat(e.amount) > 0).map((e) => ({ name: e.name || 'Расход', amount: parseFloat(e.amount) || 0 })),
          surplus: parseFloat(surplus) || 0,
          shortage: parseFloat(shortage) || 0,
          comment,
          edit_reason: reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || 'Ошибка' });
      } else if (data.unchanged) {
        setMsg({ ok: true, text: 'Изменений нет' });
      } else {
        setMsg({ ok: true, text: `Сохранено (${data.changed} изменений)` });
        setTimeout(() => router.push(`/dashboard/history/${shiftId}`), 1200);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="grid grid--2">
        <section className="card">
          <div className="card__title"><span className="card__title-text">⚖️ Расхождение</span></div>
          <div className="grid grid--2">
            <div className="field">
              <label className="field__label">Излишек</label>
              <input type="number" inputMode="numeric" value={surplus} onChange={(e) => setSurplus(e.target.value)} className="input input--number" placeholder="0" />
            </div>
            <div className="field">
              <label className="field__label">Недостача</label>
              <input type="number" inputMode="numeric" value={shortage} onChange={(e) => setShortage(e.target.value)} className="input input--number" placeholder="0" />
            </div>
          </div>
        </section>
        <section className="card">
          <div className="card__title"><span className="card__title-text">📝 Причина редактирования</span></div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="textarea" placeholder="Почему меняете данные…" />
        </section>
      </div>

      <section className="card">
        <div className="card__title"><span className="card__title-text">💳 Оплаты по смене</span></div>
        <div className="grid grid--auto">
          {PAYMENT_FIELDS.map((f) => {
            const n = parseFloat(payments[f.key]) || 0;
            return (
              <div className="field" key={f.key}>
                <label className="field__label">{f.label}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={payments[f.key]}
                  onChange={(e) => setPayments({ ...payments, [f.key]: e.target.value })}
                  className="input input--number"
                  placeholder="0"
                />
                <span className="field__hint" style={{ textAlign: 'right', visibility: n >= 1000 ? 'visible' : 'hidden' }}>
                  = {fmt(n)} сум
                </span>
              </div>
            );
          })}
        </div>
        <div className="totals-row">
          <span>Итого выручка</span>
          <span className="totals-row__value">{fmt(totalSales)} сум</span>
        </div>
      </section>

      <section className="card">
        <div className="card__title">
          <span className="card__title-text">💸 Расходы</span>
          <button type="button" className="btn btn--sm" onClick={() => setExpenses((a) => [...a, { name: '', amount: '' }])}>
            + Добавить
          </button>
        </div>
        {expenses.length === 0 ? (
          <div className="empty-state">Расходов нет</div>
        ) : (
          <div className="list">
            {expenses.map((e, i) => (
              <div className="expense-row" key={i}>
                <input placeholder="Название" value={e.name} onChange={(ev) => setExpenses((arr) => arr.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} className="input input--inline" />
                <input type="number" inputMode="numeric" placeholder="Сумма" value={e.amount} onChange={(ev) => setExpenses((arr) => arr.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} className="input input--inline input--number" />
                <button type="button" className="btn btn--danger btn--icon" onClick={() => setExpenses((arr) => arr.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        <div className="totals-row">
          <span>Итого расходов</span>
          <span className="totals-row__value">{fmt(totalExp)} сум</span>
        </div>
      </section>

      <section className="card">
        <div className="field">
          <label className="field__label">Комментарий</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="textarea" placeholder="Необязательно…" />
        </div>
      </section>

      <div className="action-bar">
        {msg && (
          <div className={`banner ${msg.ok ? 'banner--success' : 'banner--error'}`} style={{ flex: 1 }}>
            {msg.text}
          </div>
        )}
        <button type="button" onClick={save} disabled={submitting} className="btn btn--primary action-bar__btn">
          {submitting ? 'Сохранение…' : 'Сохранить изменения'}
        </button>
      </div>
    </>
  );
}
