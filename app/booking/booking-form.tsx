'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

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

const STEPS = [
  { id: 1, label: 'Когда и гости', icon: '🕒' },
  { id: 2, label: 'Стол и контакт', icon: '📍' },
  { id: 3, label: 'Детали и расчёт', icon: '🥂' },
];

export function BookingForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);

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

  // Дополнительные пожелания
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

  function goToStep(step: number) {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
    setErrorMessage(null);
  }

  function validateStep1(): boolean {
    if (!date) {
      setErrorMessage('Укажите дату банкета');
      return false;
    }
    if (!time) {
      setErrorMessage('Укажите время начала');
      return false;
    }
    if (!guestCount || guestCount < 1) {
      setErrorMessage('Укажите количество гостей');
      return false;
    }
    setErrorMessage(null);
    return true;
  }

  function validateStep2(): boolean {
    if (!guestName.trim()) {
      setErrorMessage('Укажите имя гостя');
      return false;
    }
    if (!guestPhone.trim() || guestPhone.length < 9) {
      setErrorMessage('Укажите номер телефона гостя');
      return false;
    }
    if (!employeeName.trim()) {
      setErrorMessage('Укажите имя сотрудника, принявшего бронь');
      return false;
    }
    setErrorMessage(null);
    return true;
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErrorMessage(null);

    if (!validateStep1()) {
      goToStep(1);
      return;
    }
    if (!validateStep2()) {
      goToStep(2);
      return;
    }

    try {
      localStorage.setItem('__lkm_employee_name', employeeName.trim());
    } catch {}

    setIsSubmitting(true);

    const requestsParts: string[] = [];
    if (hasCake) requestsParts.push('Свой торт');
    if (hasCandles) requestsParts.push('Торжественный вынос торта со свечами');
    if (hasDecor) requestsParts.push('Оформление / украшение шарами');
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

  function resetForm() {
    setSuccessBooking(null);
    setCurrentStep(1);
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

  // ---------------- SUCCESS SCREEN ----------------
  if (successBooking) {
    return (
      <div style={{ maxWidth: 580, margin: '32px auto', padding: '0 16px' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: 'var(--surface)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: 24,
            padding: '32px 24px',
            textAlign: 'center',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.06)',
          }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.12)',
              color: '#16a34a',
              display: 'grid',
              placeItems: 'center',
              fontSize: 32,
              margin: '0 auto 16px',
            }}
          >
            ✓
          </motion.div>

          <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px', color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Банкет успешно забронирован!
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px' }}>
            Номер брони: <b>#{successBooking.id}</b>. Запись зафиксирована в журнале и аналитике.
          </p>

          <div
            style={{
              background: 'var(--surface-muted)',
              border: '1px solid var(--border)',
              borderRadius: 18,
              padding: 20,
              textAlign: 'left',
              fontSize: 13.5,
              lineHeight: 1.65,
              marginBottom: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)' }}>Заведение</span>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{successBooking.restaurantName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)' }}>Дата и время</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{successBooking.eventDate} в {successBooking.eventTime}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)' }}>Гостей</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{successBooking.guestCount} персон</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)' }}>Стол и зона</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{successBooking.tableNumber} ({successBooking.zone})</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)' }}>Гость</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                {successBooking.guestName} · <a href={`tel:${successBooking.guestPhone}`} style={{ color: 'var(--accent)' }}>{successBooking.guestPhone}</a>
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)' }}>Предоплата</span>
              <span style={{ fontWeight: 700, color: Number(successBooking.depositAmount) > 0 ? '#16a34a' : 'var(--text-muted)' }}>
                {Number(successBooking.depositAmount) > 0
                  ? `${Number(successBooking.depositAmount).toLocaleString('ru-RU')} сум (${successBooking.depositMethod === 'cash' ? 'наличные' : 'карта'})`
                  : 'Без предоплаты'}
              </span>
            </div>
            {successBooking.specialRequests && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#b45309', background: 'rgba(245, 158, 11, 0.1)', padding: '6px 10px', borderRadius: 8 }}>
                ✨ {successBooking.specialRequests}
              </div>
            )}
            {successBooking.notes && (
              <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>
                📋 {successBooking.notes}
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'right' }}>
              Принял: <b>{successBooking.employeeName}</b>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              className="btn btn--primary"
              style={{ minHeight: 46, padding: '0 20px', borderRadius: 14, fontWeight: 600 }}
              onClick={() => {
                navigator.clipboard.writeText(summaryText);
                setCopiedSummary(true);
                setTimeout(() => setCopiedSummary(false), 2000);
              }}
            >
              {copiedSummary ? '✓ Скопировано в буфер!' : '📋 Скопировать для Telegram'}
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              className="btn btn--ghost"
              style={{ minHeight: 46, padding: '0 18px', borderRadius: 14 }}
              onClick={resetForm}
            >
              ➕ Оформить ещё
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ---------------- FORM SCREEN ----------------
  return (
    <div style={{ maxWidth: 620, margin: '20px auto 40px', padding: '0 14px', fontFamily: 'inherit' }}>
      {/* Шапка формы в стиле Apple */}
      <header style={{ textAlign: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 32, display: 'inline-block', marginBottom: 4 }}>🥂</span>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.03em', color: 'var(--text)' }}>
          Бронь стола и банкета
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
          Быстрая фиксация заказа банкета сотрудником.
        </p>
      </header>

      {/* Apple-style Step Navigation (Segmented Bar) */}
      <div
        style={{
          background: 'var(--surface-muted)',
          padding: 4,
          borderRadius: 16,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 4,
          marginBottom: 16,
          border: '1px solid var(--border)',
        }}
      >
        {STEPS.map((s) => {
          const isActive = currentStep === s.id;
          const isDone = currentStep > s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (s.id === 2 && !validateStep1()) return;
                if (s.id === 3 && (!validateStep1() || !validateStep2())) return;
                goToStep(s.id);
              }}
              style={{
                position: 'relative',
                background: 'transparent',
                border: 'none',
                padding: '9px 6px',
                borderRadius: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                fontSize: 12.5,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--text)' : isDone ? 'var(--accent)' : 'var(--text-muted)',
                outline: 'none',
                transition: 'color 0.15s ease',
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="apple-step-pill"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'var(--surface)',
                    borderRadius: 12,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                    zIndex: 0,
                  }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 1 }}>{isDone ? '✓' : s.icon}</span>
              <span style={{ position: 'relative', zIndex: 1, whiteSpace: 'nowrap' }}>{s.label}</span>
            </button>
          );
        })}
      </div>

      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="banner banner--error"
          style={{ marginBottom: 14 }}
        >
          {errorMessage}
        </motion.div>
      )}

      {/* Step Content Container */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 22,
          padding: '20px 18px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {/* STEP 1: Заведение, дата, время и гости */}
          {currentStep === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: direction * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -direction * 16 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
            >
              {/* Ресторан */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                  Заведение
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {RESTAURANTS.map((r) => {
                    const active = restaurant === r.id;
                    return (
                      <motion.button
                        type="button"
                        key={r.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setRestaurant(r.id)}
                        style={{
                          padding: '14px 10px',
                          borderRadius: 14,
                          border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: active ? 'var(--accent-soft)' : 'var(--surface-muted)',
                          color: active ? 'var(--accent)' : 'var(--text)',
                          fontWeight: 700,
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          cursor: 'pointer',
                          minHeight: 48,
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{r.icon}</span>
                        {r.name}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Дата и Время */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                  Дата и время
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8 }}>
                  <div className="field">
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Дата *</span>
                    <input
                      type="date"
                      className="input"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      style={{ minHeight: 44, borderRadius: 12 }}
                      required
                    />
                  </div>
                  <div className="field">
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>С *</span>
                    <input
                      type="time"
                      className="input"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      style={{ minHeight: 44, borderRadius: 12 }}
                      required
                    />
                  </div>
                  <div className="field">
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>До</span>
                    <input
                      type="time"
                      className="input"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      style={{ minHeight: 44, borderRadius: 12 }}
                    />
                  </div>
                </div>
              </div>

              {/* Количество гостей */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Количество гостей
                  </label>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                    {guestCount} {guestCount === 1 ? 'персона' : guestCount < 5 ? 'персоны' : 'персон'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {GUEST_PRESETS.map((p) => {
                    const active = guestCount === p;
                    return (
                      <motion.button
                        type="button"
                        key={p}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setGuestCount(p)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 12,
                          border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                          background: active ? 'var(--accent)' : 'var(--surface-muted)',
                          color: active ? '#fff' : 'var(--text)',
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: 'pointer',
                          minHeight: 38,
                        }}
                      >
                        {p}
                      </motion.button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={200}
                    value={guestCount}
                    onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value) || 1))}
                    placeholder="Или укажите точное число"
                    style={{ minHeight: 44, borderRadius: 12 }}
                  />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setGuestCount((c) => Math.max(1, c - 1))}
                      className="btn"
                      style={{ width: 44, height: 44, padding: 0, borderRadius: 12, fontSize: 18, fontWeight: 700 }}
                    >
                      −
                    </motion.button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setGuestCount((c) => c + 1)}
                      className="btn"
                      style={{ width: 44, height: 44, padding: 0, borderRadius: 12, fontSize: 18, fontWeight: 700 }}
                    >
                      +
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Кнопка перехода к шагу 2 */}
              <div style={{ paddingTop: 6 }}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  className="btn btn--primary"
                  onClick={() => {
                    if (validateStep1()) goToStep(2);
                  }}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    borderRadius: 14,
                    fontSize: 15,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span>Далее: Стол и контакт</span>
                  <span>→</span>
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Стол и данные гостя */}
          {currentStep === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: direction * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -direction * 16 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
            >
              {/* Выбор зоны */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                  Зона ресторана
                </label>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' }}>
                  {ZONES.map((z) => {
                    const active = selectedZone === z.id;
                    return (
                      <motion.button
                        type="button"
                        key={z.id}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setSelectedZone(z.id);
                          setSelectedTable(DEFAULT_TABLES[z.id]?.[0]?.num || 'Стол 1');
                          setCustomTable('');
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                          background: active ? 'var(--accent-soft)' : 'var(--surface-muted)',
                          color: active ? 'var(--accent)' : 'var(--text)',
                          fontWeight: 600,
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexShrink: 0,
                          minHeight: 42,
                        }}
                      >
                        <span>{z.icon}</span>
                        <span>{z.name}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Столы в выбранной зоне */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                  Стол ({activeZoneObj.name})
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(115px, 1fr))', gap: 8, marginBottom: 8 }}>
                  {(DEFAULT_TABLES[selectedZone] || []).map((tbl) => {
                    const active = !customTable && selectedTable === tbl.num;
                    return (
                      <motion.button
                        type="button"
                        key={tbl.num}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setSelectedTable(tbl.num);
                          setCustomTable('');
                        }}
                        style={{
                          padding: '10px 8px',
                          borderRadius: 12,
                          border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: active ? 'var(--accent-soft)' : 'var(--surface-muted)',
                          color: active ? 'var(--accent)' : 'var(--text)',
                          textAlign: 'center',
                          cursor: 'pointer',
                          minHeight: 46,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{tbl.num}</div>
                        <div style={{ fontSize: 11, color: active ? 'var(--accent)' : 'var(--text-muted)' }}>{tbl.cap}</div>
                      </motion.button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  className="input"
                  placeholder="Или свой номер/описание (напр. стол у окна)..."
                  value={customTable}
                  onChange={(e) => setCustomTable(e.target.value)}
                  style={{ minHeight: 42, borderRadius: 12, fontSize: 13 }}
                />
              </div>

              {/* Данные гостя */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                  Данные гостя
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field">
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Имя гостя *</span>
                    <input
                      type="text"
                      className="input"
                      placeholder="Сардор, Дильноза..."
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      style={{ minHeight: 44, borderRadius: 12 }}
                      required
                    />
                  </div>
                  <div className="field">
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Телефон *</span>
                    <input
                      type="tel"
                      className="input"
                      placeholder="+998 90 123 45 67"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      style={{ minHeight: 44, borderRadius: 12 }}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Кто принял бронь */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                  Кто принял бронь *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="например: Алишер (официант) или Малика (хостес)"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  style={{ minHeight: 44, borderRadius: 12 }}
                  required
                />
              </div>

              {/* Кнопки Назад / Далее */}
              <div style={{ display: 'flex', gap: 10, paddingTop: 6 }}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  className="btn btn--ghost"
                  onClick={() => goToStep(1)}
                  style={{ minHeight: 48, borderRadius: 14, padding: '0 16px' }}
                >
                  ← Назад
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  className="btn btn--primary"
                  onClick={() => {
                    if (validateStep2()) goToStep(3);
                  }}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 14,
                    fontSize: 15,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span>Далее: Детали и расчёт</span>
                  <span>→</span>
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Повод, пожелания, предоплата */}
          {currentStep === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: direction * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -direction * 16 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
            >
              {/* Повод банкета */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                  Повод банкета
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
                  {OCCASIONS.map((o) => {
                    const active = occasion === o.id;
                    return (
                      <motion.button
                        type="button"
                        key={o.id}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setOccasion(o.id)}
                        style={{
                          padding: '10px 8px',
                          borderRadius: 12,
                          border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                          background: active ? 'var(--accent-soft)' : 'var(--surface-muted)',
                          color: active ? 'var(--accent)' : 'var(--text)',
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          minHeight: 42,
                        }}
                      >
                        <span>{o.icon}</span>
                        <span>{o.title}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Пожелания */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                  Пожелания и опции
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  {[
                    { label: '🎂 Свой торт', checked: hasCake, set: setHasCake },
                    { label: '🕯️ Вынос свечей', checked: hasCandles, set: setHasCandles },
                    { label: '🎈 Шары / декор', checked: hasDecor, set: setHasDecor },
                    { label: '👶 Детский стульчик', checked: hasKidsChair, set: setHasKidsChair },
                  ].map((item, i) => (
                    <motion.button
                      type="button"
                      key={i}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => item.set(!item.checked)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: item.checked ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                        background: item.checked ? 'var(--accent-soft)' : 'var(--surface-muted)',
                        color: item.checked ? 'var(--accent)' : 'var(--text)',
                        fontWeight: 600,
                        fontSize: 12.5,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        minHeight: 44,
                      }}
                    >
                      <span>{item.label}</span>
                      <span style={{ fontSize: 14 }}>{item.checked ? '✓' : ''}</span>
                    </motion.button>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Особые пожелания (напр. тихий стол, аллергии)..."
                    value={specialNote}
                    onChange={(e) => setSpecialNote(e.target.value)}
                    style={{ minHeight: 42, borderRadius: 12, fontSize: 13 }}
                  />
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Предзаказ по меню (напр. 4 салата, 2 пиццы, чайник чая)..."
                    value={preorderText}
                    onChange={(e) => setPreorderText(e.target.value)}
                    style={{ borderRadius: 12, fontSize: 13, resize: 'vertical' }}
                  />
                </div>
              </div>

              {/* Предоплата (Депозит) */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                  Предоплата (Депозит)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6, marginBottom: 8 }}>
                  {(['none', 'cash', 'card', 'transfer'] as const).map((m) => {
                    const titles = { none: 'Без предоплаты', cash: '💵 Наличные', card: '💳 Карта / Click', transfer: '🏦 Перечисление' };
                    const active = depositMethod === m;
                    return (
                      <motion.button
                        type="button"
                        key={m}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setDepositMethod(m)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 12,
                          border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                          background: active ? 'var(--accent)' : 'var(--surface-muted)',
                          color: active ? '#fff' : 'var(--text)',
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: 'pointer',
                          minHeight: 40,
                        }}
                      >
                        {titles[m]}
                      </motion.button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {depositMethod !== 'none' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 6 }}>
                        <div className="field">
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Сумма депозита (сум)</span>
                          <input
                            type="number"
                            className="input"
                            placeholder="500 000"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            step={50000}
                            style={{ minHeight: 44, borderRadius: 12 }}
                          />
                        </div>
                        <div className="field">
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Примерный чек (сум)</span>
                          <input
                            type="number"
                            className="input"
                            placeholder="2 500 000"
                            value={totalEstimate}
                            onChange={(e) => setTotalEstimate(e.target.value)}
                            step={100000}
                            style={{ minHeight: 44, borderRadius: 12 }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Кнопки Назад / Подтвердить */}
              <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  className="btn btn--ghost"
                  onClick={() => goToStep(2)}
                  style={{ minHeight: 50, borderRadius: 14, padding: '0 16px' }}
                >
                  ← Назад
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  className="btn btn--primary"
                  onClick={() => handleSubmit()}
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    minHeight: 50,
                    borderRadius: 14,
                    fontSize: 15,
                    fontWeight: 700,
                    boxShadow: '0 4px 14px rgba(47, 111, 237, 0.3)',
                  }}
                >
                  {isSubmitting ? 'Сохранение брони…' : '✓ Подтвердить и сохранить бронь'}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Краткая сводка перед отправкой на шаге 3 */}
      {currentStep === 3 && (
        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 14, background: 'var(--surface-muted)', fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{restaurant} · {date}, {time} · {guestCount} чел.</span>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{finalTable}</span>
        </div>
      )}
    </div>
  );
}
