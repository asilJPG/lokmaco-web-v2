'use client';

import { useEffect, useMemo, useState } from 'react';

type Employee = { id: string; name: string; defaultWage: number };

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

function fmt(n: number) {
  return n.toLocaleString('ru-RU');
}

export default function CashierForm({ defaultDate }: { defaultDate: string }) {
  const [date, setDate] = useState(defaultDate);
  const [payments, setPayments] = useState<Record<PaymentKey, string>>(
    Object.fromEntries(PAYMENT_FIELDS.map((f) => [f.key, ''])) as Record<PaymentKey, string>
  );
  const [expenses, setExpenses] = useState<{ name: string; amount: string }[]>([]);
  const [surplus, setSurplus] = useState('');
  const [shortage, setShortage] = useState('');
  const [comment, setComment] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [wages, setWages] = useState<Record<string, string>>({});
  const [loadingEmp, setLoadingEmp] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [iikoResult, setIikoResult] = useState<{ iikoRevenue: number; diff: number; iikoError: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingEmp(true);
      setEmpError(null);
      try {
        const res = await fetch(`/api/iiko/employees/active?date=${date}`);
        const data = await res.json();
        if (cancelled) return;
        const list: Employee[] = data.employees || [];
        setEmployees(list);
        setWages((prev) => {
          const next = { ...prev };
          for (const e of list) if (next[e.id] === undefined) next[e.id] = e.defaultWage ? String(e.defaultWage) : '';
          return next;
        });
        if (data.error) setEmpError(data.error);
      } catch (e) {
        if (!cancelled) setEmpError(e instanceof Error ? e.message : 'fetch failed');
      } finally {
        if (!cancelled) setLoadingEmp(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date]);

  const totalSales = useMemo(
    () => PAYMENT_FIELDS.reduce((s, f) => s + (parseFloat(payments[f.key]) || 0), 0),
    [payments]
  );
  const totalExp = useMemo(
    () => expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
    [expenses]
  );
  const totalWages = useMemo(
    () => Object.values(wages).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [wages]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !submitting && totalSales > 0) {
        e.preventDefault();
        submit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting, totalSales, date, payments, expenses, surplus, shortage, comment, wages, employees]);

  async function submit() {
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/cashier/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          payments: Object.fromEntries(PAYMENT_FIELDS.map((f) => [f.key, parseFloat(payments[f.key]) || 0])),
          expenses: expenses.filter((e) => parseFloat(e.amount) > 0).map((e) => ({ name: e.name || 'Расход', amount: parseFloat(e.amount) || 0 })),
          surplus: parseFloat(surplus) || 0,
          shortage: parseFloat(shortage) || 0,
          comment,
          employeeWages: employees
            .filter((e) => (parseFloat(wages[e.id]) || 0) > 0)
            .map((e) => ({ employeeId: e.id, name: e.name, wage: parseFloat(wages[e.id]) || 0 })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || 'Ошибка' });
      } else {
        setMsg({ ok: true, text: `Сохранено: ${data.documentNumber}` });
        if (data.iikoRevenue !== undefined) {
          setIikoResult({ iikoRevenue: data.iikoRevenue, diff: data.diff, iikoError: data.iikoError });
        }
        setPayments(Object.fromEntries(PAYMENT_FIELDS.map((f) => [f.key, ''])) as Record<PaymentKey, string>);
        setExpenses([]);
        setSurplus('');
        setShortage('');
        setComment('');
        setWages({});
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid">
      <div className="grid grid--2">
        <section className="card">
          <div className="card__title"><span className="card__title-text">📅 Дата смены</span></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn--sm" title="Предыдущий день" onClick={() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)); }}>←</button>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" style={{ flex: 1 }} />
            <button type="button" className="btn btn--sm" title="Следующий день" onClick={() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)); }}>→</button>
            <button type="button" className="btn btn--sm" onClick={() => setDate(defaultDate)} title="Сегодня">Сегодня</button>
          </div>
        </section>

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
          <span className="card__title-text">💸 Расходы кассира</span>
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
        <div className="card__title">
          <span className="card__title-text">👥 Зарплаты сотрудников</span>
          {employees.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-faint)', textTransform: 'none', letterSpacing: 0 }}>{employees.length} на смене</span>}
        </div>
        {loadingEmp && <div className="empty-state">Загрузка списка…</div>}
        {empError && !loadingEmp && (
          <div className="banner banner--warn" style={{ marginBottom: 12 }}>
            ⚠️ iiko недоступен: {empError}. ЗП можно внести позже.
          </div>
        )}
        {!loadingEmp && employees.length === 0 && !empError && (
          <div className="empty-state">На эту дату сотрудников нет</div>
        )}
        {employees.length > 0 && (
          <div className="list">
            {employees.map((e) => (
              <div className="employee-row" key={e.id}>
                <div className="employee-row__name">{e.name}</div>
                <input type="number" inputMode="numeric" value={wages[e.id] ?? ''} onChange={(ev) => setWages({ ...wages, [e.id]: ev.target.value })} className="input input--inline input--number" placeholder="0" />
              </div>
            ))}
          </div>
        )}
        {employees.length > 0 && (
          <div className="totals-row">
            <span>Итого ЗП</span>
            <span className="totals-row__value">{fmt(totalWages)} сум</span>
          </div>
        )}
      </section>

      <section className="card">
        <div className="field">
          <label className="field__label">Комментарий</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="textarea" placeholder="Необязательно…" />
        </div>
      </section>

      {iikoResult && (
        <section className="card">
          <div className="card__title"><span className="card__title-text">📊 Сверка с iiko</span></div>
          {iikoResult.iikoError ? (
            <div className="banner banner--warn">⚠️ {iikoResult.iikoError} — сверка будет доступна в месячном отчёте</div>
          ) : (
            <div className="grid grid--3" style={{ gap: 12 }}>
              <div className="stat-card">
                <div className="stat-card__label">Выручка по iiko</div>
                <div className="stat-card__value">{fmt(iikoResult.iikoRevenue)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__label">Ввёл кассир</div>
                <div className="stat-card__value">{fmt(iikoResult.iikoRevenue + iikoResult.diff)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__label">Разница</div>
                <div className={`stat-card__value ${iikoResult.diff === 0 ? '' : iikoResult.diff > 0 ? 'text-green' : 'text-red'}`}>
                  {iikoResult.diff === 0 ? '0 ✓' : `${iikoResult.diff > 0 ? '+' : ''}${fmt(iikoResult.diff)}`}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="action-bar">
        {msg && (
          <div className={`banner ${msg.ok ? 'banner--success' : 'banner--error'}`} style={{ flex: 1 }}>
            {msg.text}
          </div>
        )}
        <button type="button" onClick={submit} disabled={submitting || totalSales === 0} className="btn btn--primary action-bar__btn" title={totalSales === 0 ? 'Заполни хотя бы одну сумму оплат' : 'Ctrl/⌘ + Enter'}>
          {submitting ? 'Сохранение…' : <>Сохранить отчёт <kbd className="kbd-hint" style={{ marginLeft: 8 }}>⌘↵</kbd></>}
        </button>
      </div>
    </div>
  );
}
