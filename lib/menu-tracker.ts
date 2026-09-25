/**
 * Легковесный трекер веб-аналитики для электронных меню (Lokmaco, Luma Garden).
 *
 * Как подключить в проект меню:
 * 1. Скопировать этот файл или вызвать initMenuTracker({ siteId: 'lokmaco' })
 * 2. Или вставить готовый <script> (см. инструкцию в дашборде)
 */

export interface MenuTrackerOptions {
  siteId: 'lokmaco' | 'luma_garden' | string;
  apiHost?: string; // по умолчанию хост бэкенда Lokmaco v2
  autoPageview?: boolean;
}

export interface MenuItemTrackData {
  id?: string;
  name: string;
  category?: string;
  price?: number;
}

export function initMenuTracker(options: MenuTrackerOptions) {
  if (typeof window === 'undefined') return null;

  const siteId = options.siteId;
  const apiHost = options.apiHost || 'https://lokmaco-web-v2.vercel.app';
  const trackUrl = `${apiHost.replace(/\/+$/, '')}/api/analytics/menu/track`;

  // 1. Уникальный ID посетителя (хранится в localStorage бессрочно)
  let visitorId = '';
  try {
    visitorId = localStorage.getItem('__lkm_vid') || '';
    if (!visitorId) {
      visitorId = 'v_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      localStorage.setItem('__lkm_vid', visitorId);
    }
  } catch {
    visitorId = 'v_anon_' + Date.now();
  }

  // 2. ID сессии (хранится в sessionStorage, сбрасывается при закрытии вкладки)
  let sessionId = '';
  try {
    sessionId = sessionStorage.getItem('__lkm_sid') || '';
    if (!sessionId) {
      sessionId = 's_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      sessionStorage.setItem('__lkm_sid', sessionId);
    }
  } catch {
    sessionId = 's_anon_' + Date.now();
  }

  function sendEvent(eventType: string, extraData: Record<string, unknown> = {}) {
    const payload = {
      siteId,
      eventType,
      visitorId,
      sessionId,
      pagePath: window.location.pathname + window.location.search,
      referrer: document.referrer || '',
      ...extraData,
    };

    const jsonStr = JSON.stringify(payload);

    // В приоритете sendBeacon (не блокирует закрытие страницы), запасной fetch
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const sent = navigator.sendBeacon(trackUrl, blob);
        if (sent) return;
      } catch {
        /* fallback ниже */
      }
    }

    fetch(trackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonStr,
      mode: 'cors',
      keepalive: true,
    }).catch(() => {
      // Игнорируем сетевые сбои в аналитике, чтобы не мешать пользователю меню
    });
  }

  // Публичный API трекера
  const tracker = {
    /** Отслеживание просмотра страницы */
    trackPageView(path?: string) {
      sendEvent('pageview', path ? { pagePath: path } : {});
    },

    /** Отслеживание открытия / клика по карточке блюда */
    trackItemClick(item: MenuItemTrackData) {
      sendEvent('item_click', {
        itemId: item.id,
        itemName: item.name,
        itemCategory: item.category,
        itemPrice: item.price,
      });
    },

    /** Отслеживание просмотра блюда в детальной модалке */
    trackItemView(item: MenuItemTrackData) {
      sendEvent('item_view', {
        itemId: item.id,
        itemName: item.name,
        itemCategory: item.category,
        itemPrice: item.price,
      });
    },

    /** Отслеживание переключения категории (Десерты, Напитки и т.п.) */
    trackCategoryView(categoryName: string) {
      sendEvent('category_view', {
        itemCategory: categoryName,
      });
    },
  };

  // Автоматический трекинг первого просмотра страницы при инициализации
  if (options.autoPageview !== false) {
    tracker.trackPageView();
  }

  // Привязка глобального клик-делегирования для элементов с data-атрибутами:
  // <div data-menu-item="Локма классическая" data-category="Локма" data-price="45000">
  try {
    document.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-menu-item]') as HTMLElement | null;
      if (target) {
        const name = target.getAttribute('data-menu-item') || '';
        const category = target.getAttribute('data-category') || '';
        const price = Number(target.getAttribute('data-price')) || undefined;
        const id = target.getAttribute('data-id') || undefined;
        if (name) {
          tracker.trackItemClick({ id, name, category, price });
        }
      }
    });
  } catch {
    /* игнор */
  }

  return tracker;
}
