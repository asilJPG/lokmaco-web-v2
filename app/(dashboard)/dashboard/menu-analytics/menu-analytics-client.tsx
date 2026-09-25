'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

interface TimelineEntry {
  day: string;
  pageviews: number;
  visitors: number;
  itemClicks: number;
}

interface TopItem {
  itemName: string;
  category: string;
  price: number | null;
  clicks: number;
  uniqueClicks: number;
  sharePercent: number;
}

interface TopCategory {
  category: string;
  clicks: number;
  sharePercent: number;
}

interface DeviceStat {
  device: string;
  count: number;
  sharePercent: number;
}

interface SiteInfo {
  id: string;
  name: string;
  eventsCount: number;
}

interface RecentEvent {
  id: string;
  siteId: string;
  eventType: string;
  pagePath: string | null;
  itemName: string | null;
  itemCategory: string | null;
  deviceType: string | null;
  createdAt: string;
}

interface AnalyticsData {
  site: string;
  from: string;
  to: string;
  summary: {
    totalPageviews: number;
    uniqueVisitors: number;
    totalItemClicks: number;
    totalEvents: number;
    mobileShare: number;
    avgViewsPerVisitor: string;
  };
  timeline: TimelineEntry[];
  topItems: TopItem[];
  topCategories: TopCategory[];
  devices: DeviceStat[];
  sites: SiteInfo[];
  recentEvents: RecentEvent[];
}

const SITE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  all: { label: 'Все сайты', icon: '🌐', color: 'var(--accent)' },
  lokmaco: { label: 'Lokmaco', icon: '🍩', color: '#f59e0b' },
  luma_garden: { label: 'Luma Garden', icon: '🌿', color: '#10b981' },
};

function fmtMoney(n: number) {
  return Math.round(n).toLocaleString('ru-RU');
}

export function MenuAnalyticsClient() {
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [preset, setPreset] = useState<string>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Поиск и фильтрация по блюдам
  const [itemSearch, setItemSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Модальное окно кода интеграции
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Автообновление в реальном времени
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      sp.set('site', selectedSite);
      if (isCustom && customFrom && customTo) {
        sp.set('from', customFrom);
        sp.set('to', customTo);
      } else {
        sp.set('preset', preset);
      }

      const res = await fetch(`/api/menu-analytics?${sp.toString()}`);
      if (!res.ok) {
        throw new Error(`Ошибка загрузки данных: ${res.status}`);
      }
      const json: AnalyticsData = await res.json();
      setData(json);
      if (!isCustom) {
        setCustomFrom(json.from);
        setCustomTo(json.to);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить аналитику');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedSite, preset, isCustom, customFrom, customTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  // Фильтрация списка блюд
  const filteredItems = useMemo(() => {
    if (!data?.topItems) return [];
    const q = itemSearch.trim().toLowerCase();
    return data.topItems.filter((it) => {
      const matchCat = selectedCategory === 'all' || it.category === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;
      return it.itemName.toLowerCase().includes(q) || it.category.toLowerCase().includes(q);
    });
  }, [data?.topItems, itemSearch, selectedCategory]);

  // Максимальное значение кликов для баров прогресса
  const maxItemClicks = useMemo(() => {
    if (!data?.topItems || data.topItems.length === 0) return 1;
    return Math.max(...data.topItems.map((i) => i.clicks), 1);
  }, [data?.topItems]);

  // Максимальное значение для графика динамики
  const maxTimelineViews = useMemo(() => {
    if (!data?.timeline || data.timeline.length === 0) return 10;
    return Math.max(...data.timeline.map((t) => Math.max(t.pageviews, t.itemClicks)), 10);
  }, [data?.timeline]);

  // Категории для фильтра
  const categoriesList = useMemo(() => {
    if (!data?.topCategories) return [];
    return data.topCategories.map((c) => c.category);
  }, [data?.topCategories]);

  // Генерация кода трекера для выбранного сайта
  const snippetSiteId = selectedSite === 'all' ? 'lokmaco' : selectedSite;
  const trackingSnippet = `<!-- Вставьте перед закрывающим тегом </head> или в начале <body> -->
<script>
  (function() {
    var SITE_ID = '${snippetSiteId}';
    var API_URL = '${typeof window !== 'undefined' ? window.location.origin : 'https://lokmaco-web-v2.vercel.app'}/api/analytics/menu/track';
    
    var vid = localStorage.getItem('__lkm_vid');
    if (!vid) {
      vid = 'v_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      localStorage.setItem('__lkm_vid', vid);
    }
    
    var sid = sessionStorage.getItem('__lkm_sid');
    if (!sid) {
      sid = 's_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      sessionStorage.setItem('__lkm_sid', sid);
    }
    
    function send(type, data) {
      var payload = Object.assign({
        siteId: SITE_ID,
        eventType: type,
        visitorId: vid,
        sessionId: sid,
        pagePath: window.location.pathname,
        referrer: document.referrer || ''
      }, data || {});
      
      var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_URL, blob);
      } else {
        fetch(API_URL, { method: 'POST', body: blob, keepalive: true });
      }
    }
    
    // Автоматический трекинг первого просмотра
    send('pageview');
    
    // Глобальное отслеживание кликов по блюдам с атрибутом data-menu-item
    document.addEventListener('click', function(e) {
      var el = e.target.closest('[data-menu-item]');
      if (el) {
        send('item_click', {
          itemName: el.getAttribute('data-menu-item') || '',
          itemCategory: el.getAttribute('data-category') || '',
          itemPrice: Number(el.getAttribute('data-price')) || undefined
        });
      }
    });
    
    window.__menuTracker = { trackPageView: function(p) { send('pageview', { pagePath: p }); }, trackItemClick: function(d) { send('item_click', d); } };
  })();
</script>`;

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* Шапка раздела */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📱</span> Аналитика меню
          </h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
            Посещаемость, просмотры страниц и клики по блюдам для сайтов Lokmaco и Luma Garden
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className={`btn btn--sm ${autoRefresh ? 'btn--primary' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title="Автоматически обновлять аналитику каждые 15 секунд"
          >
            {autoRefresh ? '🟢 Live (15с)' : '⚪ Live'}
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setShowCodeModal(true)}
            title="Инструкция и код для вставки на сайты меню"
          >
            📋 Код для сайтов
          </button>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => loadData(false)}
            disabled={loading}
          >
            {loading ? '⏳' : '🔄'} Обновить
          </button>
        </div>
      </div>

      {error && (
        <div className="banner banner--error">
          {error}
        </div>
      )}

      {/* Верхний фильтр: Выбор сайта и Периода */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          {/* Переключатель сайтов */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Сайт меню:</span>
            <div style={{ display: 'inline-flex', background: 'var(--surface-muted)', borderRadius: 8, padding: 3, gap: 4 }}>
              {(['all', 'lokmaco', 'luma_garden'] as const).map((sId) => {
                const cfg = SITE_CONFIG[sId] || { label: sId, icon: '📄', color: 'var(--accent)' };
                const isActive = selectedSite === sId;
                return (
                  <button
                    key={sId}
                    type="button"
                    onClick={() => setSelectedSite(sId)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: isActive ? 'var(--surface)' : 'transparent',
                      color: isActive ? 'var(--text)' : 'var(--text-muted)',
                      fontWeight: isActive ? 700 : 500,
                      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Переключатель периода */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', background: 'var(--surface-muted)', borderRadius: 8, padding: 3, gap: 2 }}>
              {[
                { id: 'today', label: 'Сегодня' },
                { id: '7d', label: '7 дней' },
                { id: '30d', label: '30 дней' },
                { id: 'this_month', label: 'Этот месяц' },
                { id: 'last_month', label: 'Прошлый' },
              ].map((p) => {
                const isActive = !isCustom && preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setIsCustom(false);
                      setPreset(p.id);
                    }}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: 'none',
                      background: isActive ? 'var(--surface)' : 'transparent',
                      color: isActive ? 'var(--text)' : 'var(--text-muted)',
                      fontWeight: isActive ? 700 : 500,
                      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Произвольные даты */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="date"
                className="input input--sm"
                value={customFrom}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setIsCustom(true);
                }}
                style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
              <input
                type="date"
                className="input input--sm"
                value={customTo}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setIsCustom(true);
                }}
                style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
              />
              {isCustom && (
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  onClick={() => loadData(false)}
                  style={{ padding: '4px 10px', fontSize: 12 }}
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Сводные карточки ключевых метрик */}
      <div className="grid grid--4" style={{ gap: 12 }}>
        <div className="stat-card">
          <div className="stat-card__label">👥 Уникальные посетители</div>
          <div className="stat-card__value" style={{ color: 'var(--accent)' }}>
            {data ? fmtMoney(data.summary.uniqueVisitors) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Посетителей за выбранный период
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__label">👁 Просмотры страниц</div>
          <div className="stat-card__value">
            {data ? fmtMoney(data.summary.totalPageviews) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            В среднем {data ? data.summary.avgViewsPerVisitor : '0'} на посетителя
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__label">🍽 Открытия блюд (клики)</div>
          <div className="stat-card__value" style={{ color: '#f59e0b' }}>
            {data ? fmtMoney(data.summary.totalItemClicks) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Просмотров карточек блюд
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__label">📱 С мобильных телефонов</div>
          <div className="stat-card__value" style={{ color: '#10b981' }}>
            {data ? `${data.summary.mobileShare}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Основной трафик гостей
          </div>
        </div>
      </div>

      {/* График посещаемости по дням */}
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="card__title" style={{ margin: 0 }}>
            📈 Посещаемость и активность гостей по дням
          </h2>
          <div style={{ display: 'flex', gap: 14, fontSize: 12, alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)' }} />
              Просмотры страниц
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b' }} />
              Клики по блюдам
            </span>
          </div>
        </div>

        {data?.timeline && data.timeline.length > 0 ? (
          <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
            <div style={{ minWidth: 640, height: 200, display: 'flex', alignItems: 'flex-end', gap: 6, paddingTop: 20 }}>
              {data.timeline.map((t) => {
                const pvHeight = Math.max(4, Math.round((t.pageviews / maxTimelineViews) * 160));
                const clickHeight = Math.max(4, Math.round((t.itemClicks / maxTimelineViews) * 160));
                const dayLabel = t.day.slice(5); // MM-DD

                return (
                  <div
                    key={t.day}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      height: '100%',
                      justifyContent: 'flex-end',
                      position: 'relative',
                    }}
                    title={`${t.day}: ${t.pageviews} просмотров, ${t.visitors} уник. гостей, ${t.itemClicks} кликов по блюдам`}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, width: '100%', justifyContent: 'center' }}>
                      {/* Бар просмотров */}
                      <div
                        style={{
                          width: '45%',
                          maxWidth: 16,
                          height: `${pvHeight}px`,
                          background: 'var(--accent)',
                          borderRadius: '3px 3px 0 0',
                          opacity: t.pageviews > 0 ? 0.9 : 0.2,
                          transition: 'height 0.2s ease',
                        }}
                      />
                      {/* Бар кликов */}
                      <div
                        style={{
                          width: '45%',
                          maxWidth: 16,
                          height: `${clickHeight}px`,
                          background: '#f59e0b',
                          borderRadius: '3px 3px 0 0',
                          opacity: t.itemClicks > 0 ? 0.9 : 0.2,
                          transition: 'height 0.2s ease',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, whiteSpace: 'nowrap' }}>
                      {dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 40 }}>
            Данных за этот период пока нет. Подключите трекер на сайт меню, чтобы видеть график посещений.
          </div>
        )}
      </section>

      {/* Основная сетка: Топ блюд (слева) + Категории и устройства (справа) */}
      <div className="grid grid--2" style={{ gap: 16 }}>
        {/* Топ блюд по просмотрам */}
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h2 className="card__title" style={{ margin: 0 }}>
              🏆 Самые просматриваемые блюда
            </h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Всего позиций: {filteredItems.length}
            </span>
          </div>

          {/* Фильтры по списку */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              className="input input--sm"
              placeholder="🔍 Поиск по названию блюда…"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            {categoriesList.length > 0 && (
              <select
                className="select select--sm"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{ maxWidth: 160 }}
              >
                <option value="all">Все категории</option>
                {categoriesList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
          </div>

          {filteredItems.length > 0 ? (
            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 4px', textAlign: 'left', width: 36 }}>#</th>
                    <th style={{ padding: '8px 8px', textAlign: 'left' }}>Блюдо</th>
                    <th style={{ padding: '8px 8px', textAlign: 'right', width: 90 }}>Кликов</th>
                    <th style={{ padding: '8px 8px', textAlign: 'right', width: 70 }}>Доля</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => {
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`;
                    const barWidth = Math.round((item.clicks / maxItemClicks) * 100);

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 4px', fontWeight: idx < 3 ? 700 : 400, color: 'var(--text-muted)' }}>
                          {medal}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ fontWeight: 600 }}>{item.itemName}</div>
                          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            <span>🏷 {item.category}</span>
                            {item.price && <span>· {fmtMoney(item.price)} сум</span>}
                            <span>· {item.uniqueClicks} чел.</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(item.clicks)}</span>
                          <div style={{ width: 70, height: 4, background: 'var(--surface-muted)', borderRadius: 2, marginLeft: 'auto', marginTop: 4 }}>
                            <div style={{ width: `${barWidth}%`, height: '100%', background: '#f59e0b', borderRadius: 2 }} />
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', fontSize: 12 }}>
                          {item.sharePercent}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 32 }}>
              {data?.topItems && data.topItems.length > 0
                ? 'Блюда не найдены по запросу'
                : 'Кликов по блюдам пока нет. Подключите отслеживание кликов на сайте меню.'}
            </div>
          )}
        </section>

        {/* Правая колонка: Категории и Устройства */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Категории */}
          <section className="card">
            <h2 className="card__title" style={{ marginBottom: 12 }}>
              🥗 Популярность категорий меню
            </h2>

            {data?.topCategories && data.topCategories.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.topCategories.map((cat, idx) => (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{cat.category}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        <b>{fmtMoney(cat.clicks)}</b> кликов ({cat.sharePercent}%)
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(3, cat.sharePercent))}%`,
                          background: idx % 3 === 0 ? 'var(--accent)' : idx % 3 === 1 ? '#10b981' : '#f59e0b',
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>
                Данных по категориям пока нет
              </div>
            )}
          </section>

          {/* Устройства */}
          <section className="card">
            <h2 className="card__title" style={{ marginBottom: 12 }}>
              📲 Устройства гостей
            </h2>

            {data?.devices && data.devices.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {data.devices.map((d, i) => {
                  const icon = d.device === 'mobile' ? '📱' : d.device === 'tablet' ? '📟' : '💻';
                  const title = d.device === 'mobile' ? 'Смартфоны' : d.device === 'tablet' ? 'Планшеты' : 'Компьютеры';

                  return (
                    <div
                      key={i}
                      style={{
                        padding: '12px',
                        background: 'var(--surface-muted)',
                        borderRadius: 8,
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 24 }}>{icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{title}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: 'var(--accent)' }}>
                        {d.sharePercent}%
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {fmtMoney(d.count)} действий
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>
                Данных по устройствам пока нет
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Лента последних действий гостей в реальном времени */}
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="card__title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚡️</span> Последняя активность на сайтах меню
          </h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Показываются последние 25 событий
          </span>
        </div>

        {data?.recentEvents && data.recentEvents.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '8px 8px', textAlign: 'left', width: 140 }}>Время</th>
                  <th style={{ padding: '8px 8px', textAlign: 'left', width: 120 }}>Сайт</th>
                  <th style={{ padding: '8px 8px', textAlign: 'left', width: 120 }}>Действие</th>
                  <th style={{ padding: '8px 8px', textAlign: 'left' }}>Блюдо / Страница</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right', width: 100 }}>Устройство</th>
                </tr>
              </thead>
              <tbody>
                {data.recentEvents.map((ev) => {
                  const siteCfg = SITE_CONFIG[ev.siteId] || { label: ev.siteId, icon: '📄', color: 'var(--accent)' };
                  const isItem = ev.eventType.includes('item');

                  return (
                    <tr key={ev.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', color: 'var(--text-muted)', fontSize: 12 }}>
                        {ev.createdAt}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                          <span>{siteCfg.icon}</span>
                          <span>{siteCfg.label}</span>
                        </span>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span
                          className={`badge ${isItem ? 'badge--warning' : ''}`}
                          style={{ fontSize: 11, padding: '2px 6px' }}
                        >
                          {isItem ? '🍽 Клик по блюду' : '👁 Просмотр меню'}
                        </span>
                      </td>
                      <td style={{ padding: '8px', fontWeight: isItem ? 600 : 400 }}>
                        {ev.itemName || ev.pagePath || '/'}
                        {ev.itemCategory && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>
                            ({ev.itemCategory})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                        {ev.deviceType === 'mobile' ? '📱 Смартфон' : ev.deviceType === 'tablet' ? '📟 Планшет' : '💻 Компьютер'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 32 }}>
            События ещё не поступали. Как только гости откроют меню, здесь появится живая лента кликов.
          </div>
        )}
      </section>

      {/* Модальное окно с кодом для вставки на сайты меню */}
      {showCodeModal && (
        <div className="modal-backdrop" onClick={() => setShowCodeModal(false)}>
          <div className="modal-card modal-card--lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title">📋 Как подключить аналитику к меню</h3>
              <button type="button" className="btn btn--sm btn--icon" onClick={() => setShowCodeModal(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>
                Чтобы посещаемость и клики по блюдам попадали в этот дашборд, добавьте трекер в проект меню.
                Выберите сайт для генерации нужного <code>siteId</code>:
              </p>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`btn btn--sm ${snippetSiteId === 'lokmaco' ? 'btn--primary' : ''}`}
                  onClick={() => setSelectedSite('lokmaco')}
                >
                  🍩 Lokmaco (siteId: &apos;lokmaco&apos;)
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${snippetSiteId === 'luma_garden' ? 'btn--primary' : ''}`}
                  onClick={() => setSelectedSite('luma_garden')}
                >
                  🌿 Luma Garden (siteId: &apos;luma_garden&apos;)
                </button>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Способ 1: Готовый HTML-скрипт (любой сайт)</span>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => {
                      navigator.clipboard.writeText(trackingSnippet);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                  >
                    {copiedCode ? '✅ Скопировано!' : 'Скопировать код'}
                  </button>
                </div>
                <pre
                  style={{
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 11,
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 240,
                  }}
                >
                  {trackingSnippet}
                </pre>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Способ 2: Для React / Next.js меню</span>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 8px' }}>
                  В репозитории проекта меню достаточно импортировать трекер или вызывать клик при открытии карточки блюда:
                </p>
                <pre
                  style={{
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 11,
                    overflowX: 'auto',
                  }}
                >
{`// При открытии карточки блюда в меню:
fetch('${typeof window !== 'undefined' ? window.location.origin : 'https://v2.lokmaco.uz'}/api/analytics/menu/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    siteId: '${snippetSiteId}',
    eventType: 'item_click',
    itemName: dish.name,
    itemCategory: dish.category,
    itemPrice: dish.price,
  }),
  keepalive: true,
});`}
                </pre>
              </div>
            </div>

            <div className="modal-foot">
              <button type="button" className="btn btn--primary" onClick={() => setShowCodeModal(false)}>
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
