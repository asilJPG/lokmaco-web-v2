'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

interface BanquetBooking {
  id: number;
  filialId: number;
  restaurantName: string;
  eventDate: string;
  eventTime: string;
  endTime: string | null;
  guestCount: number;
  tableNumber: string;
  zone: string;
  guestName: string;
  guestPhone: string;
  employeeName: string;
  occasion: string;
  occasionTitle: string;
  depositAmount: string | number;
  depositStatus: 'pending' | 'paid' | 'refunded';
  depositMethod: string;
  totalEstimate: string | number;
  status: 'confirmed' | 'completed' | 'cancelled';
  cancelReason: string | null;
  specialRequests: string | null;
  preorderItems: Array<{ name: string; quantity: number; price?: number }> | null;
  notes: string | null;
  createdAt: string;
}

interface BanquetAnalytics {
  totalCount: number;
  totalGuests: number;
  totalDeposits: number;
  totalEstimate: number;
  completedCount: number;
  cancelledCount: number;
  confirmedCount: number;
  avgGuestsPerBanquet: string;
}

interface OccasionStat {
  occasion_title: string;
  count: string;
  guests: string;
}

interface TableStat {
  zone: string;
  table_number: string;
  count: string;
  guests: string;
}

interface TimelineEntry {
  day: string;
  count: string;
  guests: string;
  deposits: string;
}

interface EmployeeStat {
  employee_name: string;
  count: string;
  deposits: string;
}

interface ApiResponse {
  bookings: BanquetBooking[];
  stats: BanquetAnalytics;
  occasions: OccasionStat[];
  tables: TableStat[];
  timeline: TimelineEntry[];
  employees: EmployeeStat[];
  period: { from: string; to: string };
}

function fmtMoney(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? parseFloat(n) : Number(n || 0);
  if (isNaN(num)) return '0 сум';
  return `${Math.round(num).toLocaleString('ru-RU')} сум`;
}

function formatDateRu(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const monthIdx = parseInt(m, 10) - 1;
  return `${parseInt(d, 10)} ${months[monthIdx] || m} ${y}`;
}

const OCCASION_ICONS: Record<string, string> = {
  birthday: '🎂',
  anniversary: '🎉',
  corporate: '🏢',
  family: '👨‍👩‍👧‍👦',
  wedding: '💍',
  date: '🕯️',
  business: '💼',
  other: '🥂',
};

export function BanquetsClient() {
  const [preset, setPreset] = useState<string>('30d');
  const [filialFilter, setFilialFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Модальные окна
  const [activeBooking, setActiveBooking] = useState<BanquetBooking | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cancelModalBooking, setCancelModalBooking] = useState<BanquetBooking | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('');

  // Форма добавления брони прямо из дашборда
  const [newFilialId, setNewFilialId] = useState(1);
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestPhone, setNewGuestPhone] = useState('');
  const [newEventDate, setNewEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newEventTime, setNewEventTime] = useState('18:00');
  const [newGuestCount, setNewGuestCount] = useState(6);
  const [newTableNumber, setNewTableNumber] = useState('Стол 1');
  const [newZone, setNewZone] = useState('Основной зал');
  const [newOccasion, setNewOccasion] = useState('birthday');
  const [newDepositAmount, setNewDepositAmount] = useState('200000');
  const [newDepositStatus, setNewDepositStatus] = useState<'pending' | 'paid'>('paid');
  const [newDepositMethod, setNewDepositMethod] = useState('click');
  const [newEmployeeName, setNewEmployeeName] = useState('Менеджер');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (isCustom && customFrom && customTo) {
        params.set('from', customFrom);
        params.set('to', customTo);
      } else {
        params.set('preset', preset);
      }
      if (filialFilter !== 'all') {
        params.set('filialId', filialFilter);
      }
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const res = await fetch(`/api/bookings?${params.toString()}`);
      if (!res.ok) throw new Error(`Ошибка загрузки данных (${res.status})`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось получить данные о бронированиях');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [preset, filialFilter, statusFilter, isCustom, customFrom, customTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Обновление статуса бронирования
  const handleUpdateStatus = async (id: number, newStatus: 'confirmed' | 'completed' | 'cancelled', cancelReason?: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, cancelReason: cancelReason || null }),
      });
      if (!res.ok) throw new Error('Ошибка при обновлении статуса');
      showToast(newStatus === 'completed' ? 'Бронь успешно отмечена завершенной! ✅' : newStatus === 'cancelled' ? 'Бронь отменена ❌' : 'Статус обновлен');
      await loadData(true);
      if (activeBooking && activeBooking.id === id) {
        setActiveBooking(prev => prev ? { ...prev, status: newStatus, cancelReason: cancelReason || null } : null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка обновления');
    } finally {
      setUpdatingId(null);
      setCancelModalBooking(null);
      setCancelReasonInput('');
    }
  };

  // Обновление статуса депозита
  const handleToggleDeposit = async (id: number, currentStatus: string) => {
    setUpdatingId(id);
    try {
      const nextStatus = currentStatus === 'paid' ? 'pending' : 'paid';
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depositStatus: nextStatus }),
      });
      if (!res.ok) throw new Error('Ошибка обновления депозита');
      showToast(nextStatus === 'paid' ? 'Предоплата отмечена как полученная! 💰' : 'Статус депозита изменен на «Ожидает»');
      await loadData(true);
      if (activeBooking && activeBooking.id === id) {
        setActiveBooking(prev => prev ? { ...prev, depositStatus: nextStatus } : null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка обновления');
    } finally {
      setUpdatingId(null);
    }
  };

  // Удаление брони
  const handleDeleteBooking = async (id: number) => {
    if (!confirm('Вы действительно хотите удалить эту запись о бронировании?')) return;
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Ошибка при удалении');
      showToast('Запись удалена');
      setActiveBooking(null);
      await loadData(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setUpdatingId(null);
    }
  };

  // Копирование ссылки для персонала
  const handleCopyStaffLink = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/booking`;
    navigator.clipboard.writeText(link).then(() => {
      showToast('🔗 Ссылка для сотрудников скопирована! Отправьте её в чат персонала.');
    });
  };

  // Копирование текста брони для Telegram/WhatsApp
  const handleCopyBookingDetails = (b: BanquetBooking) => {
    const text = `🥂 БРОНЬ БАНКЕТА — ${b.restaurantName}
📅 Дата: ${formatDateRu(b.eventDate)} в ${b.eventTime}
📍 Стол / Зона: ${b.tableNumber} (${b.zone})
👥 Количество гостей: ${b.guestCount} чел.
👤 Гость: ${b.guestName} (${b.guestPhone})
🎉 Повод: ${b.occasionTitle}
💰 Депозит: ${fmtMoney(b.depositAmount)} (${b.depositStatus === 'paid' ? 'ОПЛАЧЕН ✅' : 'ОЖИДАЕТ ⏳'})
${b.specialRequests ? `✨ Пожелания: ${b.specialRequests}\n` : ''}${b.notes ? `📝 Заметка: ${b.notes}\n` : ''}👨‍💼 Оформил(а): ${b.employeeName}`;

    navigator.clipboard.writeText(text).then(() => {
      showToast('📋 Текст бронирования скопирован для отправки гостю/в чат!');
    });
  };

  // Создание брони из модала
  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuestName.trim() || !newGuestPhone.trim()) {
      alert('Пожалуйста, заполните имя и телефон гостя');
      return;
    }
    setCreating(true);
    try {
      const payload = {
        filialId: newFilialId,
        restaurantName: newFilialId === 2 ? 'Luma Garden' : 'The Lokmaco',
        eventDate: newEventDate,
        eventTime: newEventTime,
        guestCount: Number(newGuestCount),
        tableNumber: newTableNumber,
        zone: newZone,
        guestName: newGuestName.trim(),
        guestPhone: newGuestPhone.trim(),
        employeeName: newEmployeeName.trim() || 'Менеджер',
        occasion: newOccasion,
        depositAmount: Number(newDepositAmount) || 0,
        depositStatus: newDepositStatus,
        depositMethod: newDepositMethod,
        notes: newNotes.trim() || null,
        status: 'confirmed',
      };

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Не удалось сохранить бронь');
      showToast('Бронь успешно создана и добавлена в базу! 🥂');
      setShowCreateModal(false);
      // Очистка формы
      setNewGuestName('');
      setNewGuestPhone('');
      setNewNotes('');
      await loadData(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка при сохранении');
    } finally {
      setCreating(false);
    }
  };

  // Фильтрация бронирований на клиенте по строке поиска
  const filteredBookings = useMemo(() => {
    if (!data?.bookings) return [];
    if (!searchQuery.trim()) return data.bookings;
    const q = searchQuery.toLowerCase().trim();
    return data.bookings.filter(b =>
      b.guestName.toLowerCase().includes(q) ||
      b.guestPhone.toLowerCase().includes(q) ||
      b.tableNumber.toLowerCase().includes(q) ||
      b.employeeName.toLowerCase().includes(q) ||
      b.occasionTitle.toLowerCase().includes(q) ||
      b.restaurantName.toLowerCase().includes(q)
    );
  }, [data?.bookings, searchQuery]);

  // Максимальное значение для динамики по дням
  const maxDayCount = useMemo(() => {
    if (!data?.timeline?.length) return 1;
    return Math.max(...data.timeline.map(t => Number(t.count) || 0), 1);
  }, [data?.timeline]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            background: 'var(--text)',
            color: 'var(--surface)',
            padding: '12px 20px',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            fontSize: 14,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <span>{toast}</span>
        </div>
      )}

      {/* Верхняя шапка страницы с кнопками быстрого действия */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🥂</span>
            <span>Бронь и банкеты</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 999,
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
            >
              Live
            </span>
          </h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Управление бронированиями столов, банкетный учет и сквозная аналитика для руководства
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--soft"
            onClick={handleCopyStaffLink}
            title="Скопировать публичную ссылку для персонала (открывается без логина)"
          >
            📋 Ссылка для персонала
          </button>

          <a
            href="/booking"
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{ textDecoration: 'none' }}
            title="Открыть форму оформления брони в новой вкладке"
          >
            ↗️ Форма бронирования
          </a>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setShowCreateModal(true)}
          >
            ➕ Добавить бронь
          </button>

          <button
            type="button"
            className="btn"
            onClick={() => loadData()}
            disabled={loading}
            title="Обновить данные"
          >
            {loading ? '⏳' : '🔄'}
          </button>
        </div>
      </div>

      {/* Информационная плашка про ссылку для сотрудников */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(47,111,237,0.06), rgba(16,185,129,0.06))',
          borderColor: 'rgba(47,111,237,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            📱
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>
              Сотрудники могут оформлять банкеты со смартфона без пароля
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Ссылка <code style={{ userSelect: 'all' }}>/booking</code> доступна официантам, администраторам и хостес прямо во время звонка гостя.
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--sm btn--soft"
          onClick={handleCopyStaffLink}
        >
          Скопировать ссылку для отправки
        </button>
      </div>

      {/* Панель фильтров: Филиал + Период + Статус */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          {/* Переключатель заведения */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>
              Заведение:
            </span>
            {[
              { id: 'all', label: 'Все заведения', icon: '🌐' },
              { id: '1', label: 'The Lokmaco', icon: '🍩' },
              { id: '2', label: 'Luma Garden', icon: '🌿' },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                className={`btn btn--sm ${filialFilter === f.id ? 'btn--primary' : ''}`}
                onClick={() => setFilialFilter(f.id)}
              >
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </button>
            ))}
          </div>

          {/* Быстрые пресеты периода */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>
              Период:
            </span>
            {[
              { id: 'today', label: 'Сегодня' },
              { id: '7d', label: '7 дней' },
              { id: '30d', label: '30 дней' },
              { id: 'month', label: 'Этот месяц' },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                className={`btn btn--sm ${!isCustom && preset === p.id ? 'btn--soft' : ''}`}
                style={!isCustom && preset === p.id ? { borderColor: 'var(--accent)' } : {}}
                onClick={() => {
                  setIsCustom(false);
                  setPreset(p.id);
                }}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={`btn btn--sm ${isCustom ? 'btn--soft' : ''}`}
              style={isCustom ? { borderColor: 'var(--accent)' } : {}}
              onClick={() => setIsCustom(true)}
            >
              📅 Свой период
            </button>
          </div>
        </div>

        {/* Выбор кастомных дат */}
        {isCustom && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              paddingTop: 10,
              borderTop: '1px solid var(--border)',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>С:</span>
            <input
              type="date"
              className="input input--inline"
              style={{ width: 140 }}
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>По:</span>
            <input
              type="date"
              className="input input--inline"
              style={{ width: 140 }}
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
            />
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => loadData()}
              disabled={!customFrom || !customTo}
            >
              Применить
            </button>
          </div>
        )}

        {/* Статус брони и поиск */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingTop: 10,
            borderTop: '1px solid var(--border)',
            flexWrap: 'wrap',
          }}
        >
          {/* Статус */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>
              Статус:
            </span>
            {[
              { id: 'all', label: 'Все' },
              { id: 'confirmed', label: 'Подтверждены' },
              { id: 'completed', label: 'Завершены' },
              { id: 'cancelled', label: 'Отменены' },
            ].map(s => (
              <button
                key={s.id}
                type="button"
                className={`btn btn--sm ${statusFilter === s.id ? 'btn--soft' : ''}`}
                onClick={() => setStatusFilter(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Поиск */}
          <div style={{ flex: '1 1 240px', maxWidth: 360, position: 'relative' }}>
            <input
              type="text"
              className="input input--inline"
              placeholder="🔍 Поиск по гостю, телефону, столу..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ошибка если есть */}
      {error && (
        <div className="card" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#b91c1c' }}>
          <strong>Ошибка:</strong> {error}
        </div>
      )}

      {/* Блок ключевых KPI (Сводная аналитика) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 14,
        }}
      >
        {/* Карточка 1: Всего банкетов */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Всего банкетов</span>
            <span style={{ fontSize: 20 }}>🥂</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>
            {data?.stats?.totalCount || 0}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--accent)' }}>● {data?.stats?.confirmedCount || 0} активных</span>
            <span style={{ color: 'var(--success)' }}>● {data?.stats?.completedCount || 0} проведено</span>
            {Number(data?.stats?.cancelledCount || 0) > 0 && (
              <span style={{ color: 'var(--danger)' }}>● {data?.stats?.cancelledCount} отмен</span>
            )}
          </div>
        </div>

        {/* Карточка 2: Всего гостей */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Количество гостей</span>
            <span style={{ fontSize: 20 }}>👥</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>
            {data?.stats?.totalGuests || 0} <span style={{ fontSize: 16, fontWeight: 500 }}>чел.</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Средняя посадка: <strong>{data?.stats?.avgGuestsPerBanquet || '0'}</strong> персон на банкет
          </div>
        </div>

        {/* Карточка 3: Внесено депозитов */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Оплачено депозитов</span>
            <span style={{ fontSize: 20 }}>💰</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)', lineHeight: 1.1 }}>
            {fmtMoney(data?.stats?.totalDeposits || 0)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Гарантированная бронь на расчетном счете
          </div>
        </div>

        {/* Карточка 4: Ожидаемый оборот */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Ожидаемая выручка</span>
            <span style={{ fontSize: 20 }}>📊</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>
            {fmtMoney(data?.stats?.totalEstimate || 0)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Прогноз чеков с учетом меню банкетов
          </div>
        </div>
      </div>

      {/* Графики и аналитические срезы */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {/* График динамики по дням (Timeline) */}
        <div className="card">
          <div className="card__title">
            <span className="card__title-text">
              <span>📅</span> Динамика банкетов по дням
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {data?.timeline?.length || 0} дней с событиями
            </span>
          </div>

          {!data?.timeline || data.timeline.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              За выбранный период банкетов пока не зафиксировано
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 6,
                  height: 140,
                  paddingBottom: 4,
                  borderBottom: '1px solid var(--border)',
                  overflowX: 'auto',
                }}
              >
                {data.timeline.map(t => {
                  const count = Number(t.count) || 0;
                  const guests = Number(t.guests) || 0;
                  const heightPct = Math.max(12, Math.round((count / maxDayCount) * 100));
                  const shortDay = t.day.slice(5); // MM-DD

                  return (
                    <div
                      key={t.day}
                      style={{
                        flex: '1 0 32px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        height: '100%',
                        justifyContent: 'flex-end',
                        cursor: 'default',
                      }}
                      title={`${formatDateRu(t.day)}: ${count} банкетов, ${guests} гостей, депозит: ${fmtMoney(t.deposits)}`}
                    >
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>
                        {count}
                      </span>
                      <div
                        style={{
                          width: '100%',
                          maxWidth: 24,
                          height: `${heightPct}%`,
                          background: 'linear-gradient(180deg, var(--accent) 0%, #1e40af 100%)',
                          borderRadius: '4px 4px 0 0',
                          transition: 'height 0.3s ease',
                        }}
                      />
                      <span style={{ fontSize: 9, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                        {shortDay}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                Столбики показывают число банкетов в конкретный день
              </div>
            </div>
          )}
        </div>

        {/* Анализ поводов праздников (Occasions) */}
        <div className="card">
          <div className="card__title">
            <span className="card__title-text">
              <span>🎉</span> Поводы праздников
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Распределение</span>
          </div>

          {!data?.occasions || data.occasions.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Нет данных о поводах банкетов
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
              {data.occasions.map(occ => {
                const count = Number(occ.count) || 0;
                const total = data.stats.totalCount || 1;
                const pct = Math.round((count / total) * 100);

                return (
                  <div key={occ.occasion_title} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>🎂</span>
                        <span>{occ.occasion_title}</span>
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        <strong>{count}</strong> ({pct}%) • {occ.guests} чел.
                      </span>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: 7,
                        background: 'var(--surface-muted)',
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: 'var(--accent)',
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Популярные зоны и столы */}
        <div className="card">
          <div className="card__title">
            <span className="card__title-text">
              <span>🪑</span> Загрузка столов и зон
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Топ локаций</span>
          </div>

          {!data?.tables || data.tables.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Нет данных по столам
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.tables.map((t, idx) => (
                <div
                  key={`${t.zone}-${t.table_number}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'var(--surface-muted)',
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{t.table_number}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface)', padding: '2px 6px', borderRadius: 4 }}>
                      {t.zone}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    <strong>{t.count}</strong> броней ({t.guests} гостей)
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Рейтинг активности сотрудников */}
        <div className="card">
          <div className="card__title">
            <span className="card__title-text">
              <span>👨‍💼</span> Активность персонала
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Принято броней</span>
          </div>

          {!data?.employees || data.employees.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Пока никто из сотрудников не оформлял брони
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.employees.map((emp, idx) => (
                <div
                  key={`${emp.employee_name}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'var(--surface-muted)',
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>👤</span>
                    <span style={{ fontWeight: 600 }}>{emp.employee_name || 'Не указан'}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12.5 }}>
                      {emp.count} броней
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--success)' }}>
                      {fmtMoney(emp.deposits)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Список бронирований (Таблица / Карточки) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Заголовок блока с переключением вида */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Список бронирований</span>
            <span
              style={{
                fontSize: 12,
                background: 'var(--surface-muted)',
                padding: '2px 8px',
                borderRadius: 999,
                fontWeight: 600,
              }}
            >
              Найдено: {filteredBookings.length}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`btn btn--sm ${viewMode === 'list' ? 'btn--soft' : ''}`}
              onClick={() => setViewMode('list')}
            >
              📋 Таблица
            </button>
            <button
              type="button"
              className={`btn btn--sm ${viewMode === 'cards' ? 'btn--soft' : ''}`}
              onClick={() => setViewMode('cards')}
            >
              🗂 Карточки
            </button>
          </div>
        </div>

        {/* Табличный вид */}
        {viewMode === 'list' ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)' }}>Дата и время</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)' }}>Заведение / Стол</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)' }}>Гость</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)' }}>Гостей</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)' }}>Повод</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)' }}>Депозит</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)' }}>Сотрудник</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)' }}>Статус</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      {loading ? 'Загрузка данных...' : 'Бронирований не найдено. Нажмите «Добавить бронь» или передайте ссылку персоналу!'}
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map(b => {
                    const isToday = b.eventDate.slice(0, 10) === new Date().toISOString().slice(0, 10);
                    return (
                      <tr
                        key={b.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: isToday ? 'rgba(47,111,237,0.02)' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        {/* Дата и время */}
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600 }}>{formatDateRu(b.eventDate)}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>🕒 {b.eventTime}</span>
                            {isToday && (
                              <span
                                style={{
                                  fontSize: 10,
                                  background: 'var(--accent)',
                                  color: '#fff',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  fontWeight: 700,
                                }}
                              >
                                СЕГОДНЯ
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Заведение / Стол */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{b.restaurantName}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {b.tableNumber} • <span style={{ opacity: 0.85 }}>{b.zone}</span>
                          </div>
                        </td>

                        {/* Гость */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{b.guestName}</div>
                          <a
                            href={`tel:${b.guestPhone.replace(/\D/g, '')}`}
                            style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
                          >
                            📞 {b.guestPhone}
                          </a>
                        </td>

                        {/* Гостей */}
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{b.guestCount}</span>{' '}
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>перс.</span>
                        </td>

                        {/* Повод */}
                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 12,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'var(--surface-muted)',
                            }}
                          >
                            <span>{OCCASION_ICONS[b.occasion] || '🎉'}</span>
                            <span>{b.occasionTitle}</span>
                          </span>
                        </td>

                        {/* Депозит */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {fmtMoney(b.depositAmount)}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleDeposit(b.id, b.depositStatus)}
                            disabled={updatingId === b.id}
                            style={{
                              marginTop: 3,
                              fontSize: 11,
                              padding: '1px 6px',
                              borderRadius: 4,
                              border: 'none',
                              cursor: 'pointer',
                              fontWeight: 600,
                              background:
                                b.depositStatus === 'paid'
                                  ? 'var(--success-soft)'
                                  : 'var(--surface-muted)',
                              color:
                                b.depositStatus === 'paid'
                                  ? 'var(--success)'
                                  : 'var(--warning)',
                            }}
                            title="Нажмите, чтобы переключить статус оплаты депозита"
                          >
                            {b.depositStatus === 'paid' ? '✓ Оплачен' : '⏳ Ожидает'}
                          </button>
                        </td>

                        {/* Сотрудник */}
                        <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                          👤 {b.employeeName}
                        </td>

                        {/* Статус */}
                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{
                              fontSize: 11,
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontWeight: 600,
                              display: 'inline-block',
                              background:
                                b.status === 'completed'
                                  ? 'var(--success-soft)'
                                  : b.status === 'cancelled'
                                  ? '#fee2e2'
                                  : 'var(--accent-soft)',
                              color:
                                b.status === 'completed'
                                  ? 'var(--success)'
                                  : b.status === 'cancelled'
                                  ? 'var(--danger)'
                                  : 'var(--accent)',
                            }}
                          >
                            {b.status === 'completed'
                              ? 'Завершена'
                              : b.status === 'cancelled'
                              ? 'Отменена'
                              : 'Подтверждена'}
                          </span>
                          {b.status === 'cancelled' && b.cancelReason && (
                            <div style={{ fontSize: 10, color: 'var(--danger)', marginTop: 2 }}>
                              {b.cancelReason}
                            </div>
                          )}
                        </td>

                        {/* Действия */}
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn--sm"
                              style={{ padding: '4px 8px' }}
                              onClick={() => setActiveBooking(b)}
                              title="Подробная информация о банкете"
                            >
                              Инфо
                            </button>

                            <button
                              type="button"
                              className="btn btn--sm"
                              style={{ padding: '4px 8px' }}
                              onClick={() => handleCopyBookingDetails(b)}
                              title="Скопировать детали брони для отправки в мессенджер"
                            >
                              📋
                            </button>

                            {b.status === 'confirmed' && (
                              <button
                                type="button"
                                className="btn btn--sm btn--soft"
                                style={{ padding: '4px 8px', color: 'var(--success)' }}
                                onClick={() => handleUpdateStatus(b.id, 'completed')}
                                disabled={updatingId === b.id}
                                title="Отметить банкет успешно проведенным"
                              >
                                ✓
                              </button>
                            )}

                            {b.status === 'confirmed' && (
                              <button
                                type="button"
                                className="btn btn--sm btn--danger"
                                style={{ padding: '4px 8px' }}
                                onClick={() => setCancelModalBooking(b)}
                                disabled={updatingId === b.id}
                                title="Отменить бронирование"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Вид карточками */
          <div
            style={{
              padding: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 14,
            }}
          >
            {filteredBookings.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                Бронирований не найдено
              </div>
            ) : (
              filteredBookings.map(b => (
                <div
                  key={b.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 16,
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'var(--accent-soft)',
                          color: 'var(--accent)',
                        }}
                      >
                        {b.restaurantName}
                      </span>
                      <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>
                        {formatDateRu(b.eventDate)} в {b.eventTime}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontWeight: 600,
                        background:
                          b.status === 'completed'
                            ? 'var(--success-soft)'
                            : b.status === 'cancelled'
                            ? '#fee2e2'
                            : 'var(--accent-soft)',
                        color:
                          b.status === 'completed'
                            ? 'var(--success)'
                            : b.status === 'cancelled'
                            ? 'var(--danger)'
                            : 'var(--accent)',
                      }}
                    >
                      {b.status === 'completed' ? 'Завершена' : b.status === 'cancelled' ? 'Отменена' : 'Подтверждена'}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div>
                      👤 <strong>{b.guestName}</strong>{' '}
                      <a href={`tel:${b.guestPhone.replace(/\D/g, '')}`} style={{ color: 'var(--accent)' }}>
                        ({b.guestPhone})
                      </a>
                    </div>
                    <div>
                      📍 {b.tableNumber} • {b.zone} • <strong>{b.guestCount} гостей</strong>
                    </div>
                    <div>
                      {OCCASION_ICONS[b.occasion] || '🎉'} Повод: <strong>{b.occasionTitle}</strong>
                    </div>
                    <div>
                      💰 Депозит: <strong>{fmtMoney(b.depositAmount)}</strong>{' '}
                      <span style={{ color: b.depositStatus === 'paid' ? 'var(--success)' : 'var(--warning)', fontSize: 12 }}>
                        ({b.depositStatus === 'paid' ? 'Оплачен' : 'Ожидает'})
                      </span>
                    </div>
                    {b.specialRequests && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-muted)', padding: '4px 8px', borderRadius: 6 }}>
                        ✨ {b.specialRequests}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      className="btn btn--sm"
                      style={{ flex: 1 }}
                      onClick={() => setActiveBooking(b)}
                    >
                      Детали
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => handleCopyBookingDetails(b)}
                      title="Копировать"
                    >
                      📋
                    </button>
                    {b.status === 'confirmed' && (
                      <button
                        type="button"
                        className="btn btn--sm btn--soft"
                        style={{ color: 'var(--success)' }}
                        onClick={() => handleUpdateStatus(b.id, 'completed')}
                        title="Завершить"
                      >
                        ✓ Завершить
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Модальное окно просмотра деталей брони */}
      {activeBooking && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setActiveBooking(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: 540,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                  }}
                >
                  {activeBooking.restaurantName}
                </span>
                <h3 style={{ margin: '6px 0 0 0', fontSize: 18 }}>
                  Бронь #{activeBooking.id}: {activeBooking.guestName}
                </h3>
              </div>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setActiveBooking(null)}
                style={{ borderRadius: '50%', width: 32, height: 32, padding: 0 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13 }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Дата и время:</span>
                <div style={{ fontWeight: 600 }}>{formatDateRu(activeBooking.eventDate)} в {activeBooking.eventTime}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Посадочное место:</span>
                <div style={{ fontWeight: 600 }}>{activeBooking.tableNumber} ({activeBooking.zone})</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Гостей:</span>
                <div style={{ fontWeight: 600 }}>{activeBooking.guestCount} человек</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Повод:</span>
                <div style={{ fontWeight: 600 }}>{OCCASION_ICONS[activeBooking.occasion] || '🎉'} {activeBooking.occasionTitle}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Телефон:</span>
                <div style={{ fontWeight: 600 }}>
                  <a href={`tel:${activeBooking.guestPhone.replace(/\D/g, '')}`} style={{ color: 'var(--accent)' }}>
                    {activeBooking.guestPhone}
                  </a>
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Оформил(а):</span>
                <div style={{ fontWeight: 600 }}>👤 {activeBooking.employeeName}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Депозит / Статус:</span>
                <div style={{ fontWeight: 600 }}>
                  {fmtMoney(activeBooking.depositAmount)} ({activeBooking.depositStatus === 'paid' ? 'Оплачен' : 'Ожидает'})
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Способ оплаты:</span>
                <div style={{ fontWeight: 600 }}>{activeBooking.depositMethod.toUpperCase()}</div>
              </div>
            </div>

            {/* Пожелания */}
            {activeBooking.specialRequests && (
              <div style={{ background: 'var(--surface-muted)', padding: 12, borderRadius: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>✨ Спецпожелания:</span>
                {activeBooking.specialRequests}
              </div>
            )}

            {/* Заметки */}
            {activeBooking.notes && (
              <div style={{ background: 'var(--surface-muted)', padding: 12, borderRadius: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>📝 Внутренние заметки персонала:</span>
                {activeBooking.notes}
              </div>
            )}

            {/* Меню предзаказа если есть */}
            {activeBooking.preorderItems && activeBooking.preorderItems.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 8 }}>
                  🍽️ Предзаказ блюд ({activeBooking.preorderItems.length}):
                </span>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {activeBooking.preorderItems.map((item, idx) => (
                    <li key={idx}>
                      {item.name} × {item.quantity} шт. {item.price ? `(${fmtMoney(item.price * item.quantity)})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Кнопки действий */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => handleDeleteBooking(activeBooking.id)}
              >
                🗑 Удалить
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleCopyBookingDetails(activeBooking)}
                >
                  📋 Копировать
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setActiveBooking(null)}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модал отмены брони с указанием причины */}
      {cancelModalBooking && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setCancelModalBooking(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 440, width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: 0 }}>Отмена бронирования #{cancelModalBooking.id}</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              Укажите причину отмены банкета гостя <strong>{cancelModalBooking.guestName}</strong>:
            </p>
            <input
              type="text"
              className="input"
              placeholder="Например: Изменились планы, заболел именинник, перенос..."
              value={cancelReasonInput}
              onChange={e => setCancelReasonInput(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setCancelModalBooking(null)}>
                Назад
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => handleUpdateStatus(cancelModalBooking.id, 'cancelled', cancelReasonInput || 'Отменено по просьбе гостя')}
              >
                Подтвердить отмену
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модал создания новой брони прямо в дашборде */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: 580,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>➕ Добавить бронь / банкет</h3>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setShowCreateModal(false)}
                style={{ borderRadius: '50%', width: 32, height: 32, padding: 0 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBooking} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Заведение */}
              <div>
                <label className="field__label">Заведение:</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    className={`btn ${newFilialId === 1 ? 'btn--primary' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setNewFilialId(1)}
                  >
                    🍩 The Lokmaco
                  </button>
                  <button
                    type="button"
                    className={`btn ${newFilialId === 2 ? 'btn--primary' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setNewFilialId(2)}
                  >
                    🌿 Luma Garden
                  </button>
                </div>
              </div>

              {/* Дата и время */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div>
                  <label className="field__label">Дата банкета:</label>
                  <input
                    type="date"
                    required
                    className="input"
                    value={newEventDate}
                    onChange={e => setNewEventDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field__label">Время начала:</label>
                  <input
                    type="time"
                    required
                    className="input"
                    value={newEventTime}
                    onChange={e => setNewEventTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Стол, зона и количество гостей */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div>
                  <label className="field__label">Гостей (персон):</label>
                  <input
                    type="number"
                    min={1}
                    max={150}
                    required
                    className="input"
                    value={newGuestCount}
                    onChange={e => setNewGuestCount(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="field__label">Зона:</label>
                  <select
                    className="select"
                    value={newZone}
                    onChange={e => setNewZone(e.target.value)}
                  >
                    <option value="Основной зал">Основной зал</option>
                    <option value="VIP-зал">VIP-зал</option>
                    <option value="Терраса">Терраса</option>
                    <option value="Летний сад">Летний сад</option>
                  </select>
                </div>
                <div>
                  <label className="field__label">Номер стола:</label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Например, Стол 5"
                    value={newTableNumber}
                    onChange={e => setNewTableNumber(e.target.value)}
                  />
                </div>
              </div>

              {/* Гость */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div>
                  <label className="field__label">Имя гостя:</label>
                  <input
                    type="text"
                    required
                    placeholder="Имя заказчика"
                    className="input"
                    value={newGuestName}
                    onChange={e => setNewGuestName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field__label">Телефон гостя:</label>
                  <input
                    type="tel"
                    required
                    placeholder="+998 90 123 45 67"
                    className="input"
                    value={newGuestPhone}
                    onChange={e => setNewGuestPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Повод */}
              <div>
                <label className="field__label">Повод мероприятия:</label>
                <select
                  className="select"
                  value={newOccasion}
                  onChange={e => setNewOccasion(e.target.value)}
                >
                  <option value="birthday">🎂 День рождения</option>
                  <option value="anniversary">🎉 Юбилей</option>
                  <option value="corporate">🏢 Корпоратив</option>
                  <option value="family">👨‍👩‍👧‍👦 Семейный ужин</option>
                  <option value="wedding">💍 Свадьба / Помолвка</option>
                  <option value="date">🕯️ Романтический ужин</option>
                  <option value="business">💼 Деловая встреча</option>
                  <option value="other">🥂 Другое мероприятие</option>
                </select>
              </div>

              {/* Предоплата */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div>
                  <label className="field__label">Депозит (сум):</label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    className="input"
                    value={newDepositAmount}
                    onChange={e => setNewDepositAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field__label">Статус депозита:</label>
                  <select
                    className="select"
                    value={newDepositStatus}
                    onChange={e => setNewDepositStatus(e.target.value as 'pending' | 'paid')}
                  >
                    <option value="paid">✓ Оплачен</option>
                    <option value="pending">⏳ Ожидает</option>
                  </select>
                </div>
                <div>
                  <label className="field__label">Метод оплаты:</label>
                  <select
                    className="select"
                    value={newDepositMethod}
                    onChange={e => setNewDepositMethod(e.target.value)}
                  >
                    <option value="click">Click</option>
                    <option value="payme">Payme</option>
                    <option value="card">Терминал (карта)</option>
                    <option value="cash">Наличные</option>
                    <option value="transfer">Перевод</option>
                  </select>
                </div>
              </div>

              {/* Кто принял и заметки */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div>
                  <label className="field__label">Кто принял бронь:</label>
                  <input
                    type="text"
                    required
                    placeholder="Имя сотрудника"
                    className="input"
                    value={newEmployeeName}
                    onChange={e => setNewEmployeeName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field__label">Заметки / Пожелания:</label>
                  <input
                    type="text"
                    placeholder="Торт, свечи, аллергии..."
                    className="input"
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowCreateModal(false)}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={creating}
                >
                  {creating ? 'Сохранение...' : 'Сохранить бронь'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
