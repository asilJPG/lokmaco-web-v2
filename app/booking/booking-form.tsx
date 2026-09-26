'use client';

import { useState, useEffect } from 'react';

// Зоны и предустановленные столы
const RESTAURANTS = [
  { id: 'The Lokmaco', name: 'The Lokmaco', icon: '🍩' },
  { id: 'Luma Garden', name: 'Luma Garden', icon: '🌿' },
];

const ZONES = [
  { id: 'main', name: 'Основной зал', icon: '🏛️' },
  { id: 'vip', name: 'VIP-зал', icon: '👑' },
  { id: 'terrace', name: 'Терраса', icon: '☀️' },
  { id: 'garden', name: 'Летний сад', icon: '🌳' },
];

const DEFAULT_TABLES: Record<string, { num: string; cap: string }[]> = {
  main: [
    { num: 'Стол 1', cap: '2-4 чел' },
    { num: 'Стол 2', cap: '2-4 чел' },
    { num: 'Стол 3', cap: '4-6 чел' },
    { num: 'Стол 4', cap: '4-6 чел' },
    { num: 'Стол 5', cap: '6-8 чел' },
    { num: 'Банкетный 1', cap: '10-15 чел' },
    { num: 'Банкетный 2', cap: '15-25 чел' },
  ],
  vip: [
    { num: 'VIP 1', cap: '6-10 чел' },
    { num: 'VIP 2', cap: '10-16 чел' },
  ],
  terrace: [
    { num: 'Терраса 1', cap: '2-4 чел' },
    { num: 'Терраса 2', cap: '4-6 чел' },
    { num: 'Терраса 3', cap: '6-8 чел' },
    { num: 'Терраса Банкет', cap: '10-16 чел' },
  ],
  garden: [
    { num: 'Сад 1', cap: '4-6 чел' },
    { num: 'Сад 2', cap: '6-8 чел' },
    { num: 'Сад Беседка', cap: '10-20 чел' },
  ],
};

const OCCASIONS = [
  { id: 'birthday', title: 'День рождения', icon: '🎂' },
  { id: 'corporate', title: 'Корпоратив', icon: '💼' },
  { id: 'family', title: 'Семейное торжество', icon: '👨‍👩‍👧' },
  { id: 'jubilee', title: 'Юбилей / Банкет', icon: '🥂' },
  { id: 'romance', title: 'Сватовство / Романтика', icon: '💐' },
  { id: 'other', title: 'Другой повод', icon: '✨' },
];

const GUEST_PRESETS = [2, 4, 6, 8, 10, 15, 20, 30];

export function BookingForm() {
  const [restaurant, setRestaurant] = useState('The Lokmaco');
  const [date, setDate] = useState(() => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10));
  const [time, setTime] = useState('18:00');
  const [endTime, setEndTime] = useState('22:00');
  const [guestCount, setGuestCount] = useState<number>(6);

  const [selectedZone, setSelectedZone] = useState('main');
  const [selectedTable, setSelectedTable] = useState('Стол 3');
  const [customTable, setCustomTable] = useState('');

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('+998 ');
  const [employeeName, setEmployeeName] = useState('');

  const [occasion, setOccasion] = useState('birthday');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState<'cash' | 'card' | 'transfer' | 'none'>('none');
  const [totalEstimate, setTotalEstimate] = useState('');

  // Дополнительные пожелания и галочки
  const [hasCake, setHasCake] = useState(false);
  const [hasCandles, setHasCandles] = useState(false);
  const [hasDecor, setHasDecor] = useState(false);
  const [hasKidsChair, setHasKidsChair] = useState(false);
  const [specialNote, setSpecialNote] = useState('');
  const [preorderText, setPreorderText] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBooking, setSuccessBooking] = useState<any | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Восстанавливаем имя сотрудника из localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('__lkm_employee_name');
      if (saved) setEmployeeName(saved);
    } catch {}
  }, []);

  const activeZoneObj = ZONES.find((z) => z.id === selectedZone) || ZONES[0];
  const activeOccasionObj = OCCASIONS.find((o) => o.id === occasion) || OCCASIONS[0];
  const finalTable = customTable.trim() || selectedTable;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!guestName.trim()) {
      setErrorMessage('Укажите имя гостя');
      return;
    }
    if (!guestPhone.trim() || guestPhone.length < 9) {
      setErrorMessage('Укажите контактный номер телефона гостя');
      return;
    }
    if (!employeeName.trim()) {
      setErrorMessage('Укажите имя сотрудника, принявшего бронь');
      return;
    }

    try {
      localStorage.setItem('__lkm_employee_name', employeeName.trim());
    } catch {}

    setIsSubmitting(true);

    // Собираем пожелания
    const requestsParts: string[] = [];
    if (hasCake) requestsParts.push('Свой торт');
    if (hasCandles) requestsParts.push('Торжественный вынос торта со свечами');
    if (hasDecor) requestsParts.push('Оформление / украшение шарами');
    if (hasKidsKidsChair(requestsParts)) {} // noop
    if (hasKidsChair) requestsParts.push('Нужен детский стульчик');
    if (specialNote.trim()) requestsParts.push(specialNote.trim());

    const specialRequests = requestsParts.join(' • ');

    const payload = {
      filialId: 1,
      restaurantName: restaurant,
      eventDate: date,
      eventTime: time,
      endTime: endTime || null,
      guestCount: Number(guestCount) || 1,
      tableNumber: finalTable,
      zone: activeZoneObj.name,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      employeeName: employeeName.trim(),
      occasion: occasion,
      occasionTitle: activeOccasionObj.title,
      depositAmount: depositMethod === 'none' ? '0' : String(Number(depositAmount) || 0),
      depositStatus: depositMethod === 'none' || !Number(depositAmount) ? 'pending' : 'paid',
      depositMethod: depositMethod === 'none' ? null : depositMethod,
      totalEstimate: String(Number(totalEstimate) || 0),
      status: 'confirmed',
      specialRequests: specialRequests || null,
      notes: preorderText.trim() ? `Предзаказ: ${preorderText.trim()}` : null,
    };

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при сохранении брони');
      }

      setSuccessBooking(data.booking);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Сбой отправки');
    } finally {
      setIsSubmitting(false);
    }
  }

  function hasKidsKidsChair(arr: string[]) {
    return false;
  }

  function resetForm() {
    setSuccessBooking(null);
    setGuestName('');
    setGuestPhone('+998 ');
    setDepositAmount('');
    setDepositMethod('none');
    setTotalEstimate('');
    setSpecialNote('');
    setPreorderText('');
    setHasCake(false);
    setHasCandles(false);
    setHasDecor(false);
    setHasKidsChair(false);
  }

  const summaryText = successBooking
    ? `🎉 БРОНЬ БАНКЕТА · ${successBooking.restaurantName}
📅 Дата: ${successBooking.eventDate} в ${successBooking.eventTime}
👥 Гостей: ${successBooking.guestCount} чел.
📍 Стол: ${successBooking.tableNumber} (${successBooking.zone})
🎂 Повод: ${successBooking.occasionTitle}
👤 Гость: ${successBooking.guestName} (${successBooking.guestPhone})
💰 Предоплата: ${Number(successBooking.depositAmount) > 0 ? Number(successBooking.depositAmount).toLocaleString('ru-RU') + ' сум (' + (successBooking.depositMethod === 'cash' ? 'наличные' : 'карта') + ')' : 'Без предоплаты'}
${successBooking.specialRequests ? '✨ Пожелания: ' + successBooking.specialRequests : ''}
${successBooking.notes ? '📋 ' + successBooking.notes : ''}
👨‍🍳 Принял: ${successBooking.employeeName}`
    : '';

  if (successBooking) {
    return (
      <div style={{ maxWidth: 640, margin: '24px auto', padding: '0 16px', fontFamily: 'inherit' }}>
        <div className="card" style={{ padding: 24, textAlign: 'center', border: '2px solid var(--success)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: 'var(--success)' }}>
            Банкет успешно забронирован!
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 20px' }}>
            Номер брони: <b>#{successBooking.id}</b>. Запись добавлена в общий журнал и банкетную аналитику.
          </p>

          {/* Карточка информации о брони */}
          <div
            style={{
              background: 'var(--surface-muted)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 16,
              textAlign: 'left',
              fontSize: 14,
              lineHeight: 1.6,
              marginBottom: 20,
            }}
          >
            <div>🏢 <b>Заведение:</b> {successBooking.restaurantName}</div>
            <div>📅 <b>Дата и время:</b> {successBooking.eventDate} в {successBooking.eventTime}</div>
            <div>👥 <b>Количество персон:</b> {successBooking.guestCount} чел.</div>
            <div>📍 <b>Стол и зона:</b> {successBooking.tableNumber} — {successBooking.zone}</div>
            <div>👤 <b>Гость:</b> {successBooking.guestName} (<a href={`tel:${successBooking.guestPhone}`}>{successBooking.guestPhone}</a>)</div>
            <div>🎂 <b>Повод:</b> {successBooking.occasionTitle}</div>
            <div>
              💰 <b>Предоплата:</b>{' '}
              {Number(successBooking.depositAmount) > 0
                ? `${Number(successBooking.depositAmount).toLocaleString('ru-RU')} сум (${successBooking.depositMethod === 'cash' ? 'наличные' : 'карта'})`
                : 'Без предоплаты'}
            </div>
            {successBooking.specialRequests && (
              <div style={{ marginTop: 6, color: '#92400e' }}>
                ✨ <b>Пожелания:</b> {successBooking.specialRequests}
              </div>
            )}
            {successBooking.notes && (
              <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                📋 <b>Заметки:</b> {successBooking.notes}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
              Принял сотрудник: <b>{successBooking.employeeName}</b>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                navigator.clipboard.writeText(summaryText);
                setCopiedSummary(true);
                setTimeout(() => setCopiedSummary(false), 2000);
              }}
            >
              {copiedSummary ? '✅ Скопировано!' : '📋 Скопировать для гостя (TG)'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={resetForm}>
              ➕ Оформить ещё бронь
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '20px auto', padding: '0 16px', fontFamily: 'inherit' }}>
      {/* Шапка формы */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 36, marginBottom: 4 }}>🥂</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Бронь стола и банкета
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
          Быстрая фиксация заказа банкета сотрудником. Данные сразу попадают в аналитику ресторанов.
        </p>
      </div>

      {errorMessage && (
        <div className="banner banner--error" style={{ marginBottom: 16 }}>
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 1. Ресторан */}
        <div className="card" style={{ padding: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
            1. ВЫБЕРИТЕ ЗАВЕДЕНИЕ
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {RESTAURANTS.map((r) => {
              const active = restaurant === r.id;
              return (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => setRestaurant(r.id)}
                  style={{
                    padding: '12px 10px',
                    borderRadius: 10,
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'var(--accent-soft)' : 'var(--surface)',
                    color: active ? 'var(--accent)' : 'var(--text)',
                    fontWeight: 700,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{r.icon}</span>
                  {r.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Дата, время и количество гостей */}
        <div className="card" style={{ padding: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 10 }}>
            2. ДАТА, ВРЕМЯ И КОЛИЧЕСТВО ГОСТЕЙ
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
            <div className="field">
              <label className="field__label">Дата банкета *</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field__label">Время с *</label>
              <input
                type="time"
                className="input"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field__label">Время до</label>
              <input
                type="time"
                className="input"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="field__label" style={{ marginBottom: 6, display: 'block' }}>
              Количество гостей (персон) *
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {GUEST_PRESETS.map((p) => {
                const active = guestCount === p;
                return (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setGuestCount(p)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: active ? 'var(--accent)' : 'var(--surface-muted)',
                      color: active ? '#fff' : 'var(--text)',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <input
              type="number"
              className="input"
              min={1}
              max={200}
              value={guestCount}
              onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value) || 1))}
              placeholder="Или укажите точное число"
              style={{ maxWidth: 200 }}
              required
            />
          </div>
        </div>

        {/* 3. Зона и Стол */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
              3. ВЫБОР СТОЛА И ЗОНЫ
            </label>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Схему зала можно скинуть позже</span>
          </div>

          {/* Зоны */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 12 }}>
            {ZONES.map((z) => {
              const active = selectedZone === z.id;
              return (
                <button
                  type="button"
                  key={z.id}
                  onClick={() => {
                    setSelectedZone(z.id);
                    setSelectedTable(DEFAULT_TABLES[z.id]?.[0]?.num || 'Стол 1');
                    setCustomTable('');
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'var(--accent-soft)' : 'var(--surface)',
                    color: active ? 'var(--accent)' : 'var(--text)',
                    fontWeight: 600,
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>{z.icon}</span>
                  {z.name}
                </button>
              );
            })}
          </div>

          {/* Карточки столов в выбранной зоне */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 10 }}>
            {(DEFAULT_TABLES[selectedZone] || []).map((tbl) => {
              const active = !customTable && selectedTable === tbl.num;
              return (
                <button
                  type="button"
                  key={tbl.num}
                  onClick={() => {
                    setSelectedTable(tbl.num);
                    setCustomTable('');
                  }}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 8,
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'var(--accent-soft)' : 'var(--surface)',
                    color: active ? 'var(--accent)' : 'var(--text)',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{tbl.num}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tbl.cap}</div>
                </button>
              );
            })}
          </div>

          <div className="field">
            <label className="field__label">Или укажите свой номер стола / комментарий</label>
            <input
              type="text"
              className="input"
              placeholder="например: Стол у окна, Сдвоенные столы 4+5"
              value={customTable}
              onChange={(e) => setCustomTable(e.target.value)}
            />
          </div>
        </div>

        {/* 4. Данные гостя */}
        <div className="card" style={{ padding: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 10 }}>
            4. ДАННЫЕ ГОСТЯ (ЗАКАЗЧИКА)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label className="field__label">Имя гостя *</label>
              <input
                type="text"
                className="input"
                placeholder="Сардор, Дильноза..."
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field__label">Телефон для связи *</label>
              <input
                type="tel"
                className="input"
                placeholder="+998 90 123 45 67"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        {/* 5. Повод банкета и Депозит */}
        <div className="card" style={{ padding: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
            5. ПОВОД БАНКЕТА
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6, marginBottom: 16 }}>
            {OCCASIONS.map((o) => {
              const active = occasion === o.id;
              return (
                <button
                  type="button"
                  key={o.id}
                  onClick={() => setOccasion(o.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'var(--accent-soft)' : 'var(--surface)',
                    color: active ? 'var(--accent)' : 'var(--text)',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>{o.icon}</span>
                  {o.title}
                </button>
              );
            })}
          </div>

          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
            ПРЕДОПЛАТА (ДЕПОЗИТ)
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {(['none', 'cash', 'card', 'transfer'] as const).map((m) => {
              const titles = { none: 'Без предоплаты', cash: '💵 Наличные', card: '💳 Карта / Click', transfer: '🏦 Перечисление' };
              const active = depositMethod === m;
              return (
                <button
                  type="button"
                  key={m}
                  onClick={() => setDepositMethod(m)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'var(--accent)' : 'var(--surface-muted)',
                    color: active ? '#fff' : 'var(--text)',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {titles[m]}
                </button>
              );
            })}
          </div>

          {depositMethod !== 'none' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <div className="field">
                <label className="field__label">Сумма предоплаты (сум)</label>
                <input
                  type="number"
                  className="input"
                  placeholder="например: 500000"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  step={50000}
                />
              </div>
              <div className="field">
                <label className="field__label">Примерный чек банкета (сум)</label>
                <input
                  type="number"
                  className="input"
                  placeholder="например: 2500000"
                  value={totalEstimate}
                  onChange={(e) => setTotalEstimate(e.target.value)}
                  step={100000}
                />
              </div>
            </div>
          )}
        </div>

        {/* 6. Пожелания и предзаказ блюд */}
        <div className="card" style={{ padding: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
            6. ПОЖЕЛАНИЯ И ОСОБЫЕ ОТМЕТКИ
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={hasCake} onChange={(e) => setHasCake(e.target.checked)} />
              🎂 Свой торт
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={hasCandles} onChange={(e) => setHasCandles(e.target.checked)} />
              🕯️ Вынос торта со свечами
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={hasDecor} onChange={(e) => setHasDecor(e.target.checked)} />
              🎈 Оформление шарами
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={hasKidsChair} onChange={(e) => setHasKidsChair(e.target.checked)} />
              👶 Детский стульчик
            </label>
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <label className="field__label">Особые пожелания / Аллергии</label>
            <input
              type="text"
              className="input"
              placeholder="например: тихий стол, не включать кондиционер, аниматоры в 19:30"
              value={specialNote}
              onChange={(e) => setSpecialNote(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label">Предзаказ по меню (если есть)</label>
            <textarea
              className="input"
              rows={2}
              placeholder="например: 4 салата цезарь, 2 пиццы пепперони, чайник чая к приходу..."
              value={preorderText}
              onChange={(e) => setPreorderText(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        {/* 7. Кто принял бронь */}
        <div className="card" style={{ padding: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
            7. КТО ПРИНЯЛ БРОНЬ (ДЛЯ ОТЧЁТА)
          </label>
          <div className="field">
            <label className="field__label">Имя сотрудника *</label>
            <input
              type="text"
              className="input"
              placeholder="например: Алишер (официант) или Малика (хостес)"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Кнопка отправки */}
        <button
          type="submit"
          className="btn btn--primary"
          disabled={isSubmitting}
          style={{
            padding: '14px 24px',
            fontSize: 16,
            fontWeight: 700,
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(47, 111, 237, 0.25)',
          }}
        >
          {isSubmitting ? 'Сохранение брони…' : '✅ Подтвердить и сохранить бронь'}
        </button>
      </form>
    </div>
  );
}
