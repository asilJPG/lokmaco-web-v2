'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { canAccess, type Section } from '@/lib/access';

type Item = {
  href: string;
  label: string;
  icon: string;
  badgeKey?: 'inbox';
  /** Раздел из lib/access.ts — единственный источник правды по ролям. */
  section: Section;
};

type Group = { title?: string; items: Item[] };

/**
 * Grouped by how the day actually runs — what a cashier touches every shift
 * first, then stock, then the reporting layers — rather than by which system
 * the data happens to come from.
 */
const GROUPS: Group[] = [
  {
    items: [
      { href: '/dashboard', label: 'Главная', icon: '🏠', section: 'home' },
      { href: '/dashboard/assistant', label: 'Ассистент', icon: '✨', section: 'assistant' },
    ],
  },
  {
    title: 'Смена',
    items: [
      { href: '/dashboard/cashier', label: 'Закрыть смену', icon: '🧾', section: 'cashier' },
      { href: '/dashboard/inbox', label: 'Подтверждения', icon: '📨', badgeKey: 'inbox', section: 'inbox' },
      { href: '/dashboard/history', label: 'История смен', icon: '🗂️', section: 'history' },
      { href: '/dashboard/attendance', label: 'Явки', icon: '🕒', section: 'attendance' },
    ],
  },
  {
    title: 'Склад',
    items: [
      { href: '/dashboard/balances', label: 'Остатки', icon: '📦', section: 'balances' },
      { href: '/dashboard/transfer', label: 'Перемещение', icon: '🔄', section: 'transfer' },
      { href: '/dashboard/invoice', label: 'Приход накладной', icon: '🚚', section: 'invoice' },
      { href: '/dashboard/inventory', label: 'Инвентаризация', icon: '📋', section: 'inventory' },
      { href: '/dashboard/production', label: 'Приготовление', icon: '🍳', section: 'production' },
      { href: '/dashboard/writeoff', label: 'Списание', icon: '🗑', section: 'writeoff' },
      { href: '/dashboard/services', label: 'Услуги', icon: '🧾', section: 'services' },
      { href: '/dashboard/documents', label: 'Документы iiko', icon: '📑', section: 'documents' },
      { href: '/dashboard/assets', label: 'Опись ОС', icon: '🏛', section: 'assets' },
    ],
  },
  {
    title: 'Аналитика',
    items: [
      { href: '/dashboard/analytics', label: 'Обзор', icon: '📊', section: 'analytics' },
      { href: '/dashboard/menu-analytics', label: 'Аналитика меню', icon: '📱', section: 'analytics' },
      { href: '/dashboard/analytics?tab=pl', label: 'ОПиУ', icon: '📈', section: 'analytics.pl' },
      { href: '/dashboard/analytics?tab=abc', label: 'ABC-анализ блюд', icon: '🍽', section: 'analytics.abc' },
      { href: '/dashboard/analytics?tab=liquidity', label: 'Ликвидность', icon: '🧊', section: 'analytics.liquidity' },
      { href: '/dashboard/analytics?tab=purchases', label: 'Закупки', icon: '🏷', section: 'analytics.purchases' },
      { href: '/dashboard/analytics?tab=waiters', label: 'Официанты', icon: '👨‍🍳', section: 'analytics.waiters' },
    ],
  },
  {
    title: 'Финансы',
    items: [
      { href: '/dashboard/safe', label: 'Сейф', icon: '💰', section: 'safe' },
      { href: '/dashboard/wages', label: 'Зарплаты', icon: '👥', section: 'wages' },
      { href: '/dashboard/pnl', label: 'P&L', icon: '📈', section: 'pnl' },
      { href: '/dashboard/reconciliation', label: 'Отчёты кассы', icon: '🧮', section: 'reconciliation' },
      { href: '/dashboard/tax-report', label: 'Налоговый отчёт', icon: '🧾', section: 'taxReport' },
    ],
  },
  {
    title: 'Настройки',
    items: [
      { href: '/dashboard/profile', label: 'Профиль', icon: '🙂', section: 'profile' },
      { href: '/dashboard/admin/users', label: 'Пользователи', icon: '👤', section: 'adminUsers' },
      { href: '/dashboard/admin/permissions', label: 'Права доступа', icon: '🔐', section: 'adminUsers' },
      { href: '/dashboard/admin/filials', label: 'Филиалы', icon: '🏢', section: 'adminFilials' },
    ],
  },
];

export function SidebarNav({
  role,
  permissions,
  badges,
}: {
  role: string;
  permissions?: (string | Section)[] | null;
  badges?: { inbox?: number };
}) {
  const path = usePathname();
  const sp = useSearchParams();

  const currentTab = sp?.get('tab');

  function isActive(item: Item): boolean {
    const [href, query] = item.href.split('?');
    if (path !== href) {
      // Nested pages (e.g. /dashboard/admin/users/…) keep their parent lit.
      return href !== '/dashboard' && !!path?.startsWith(`${href}/`);
    }
    // Two entries can share a page and differ only by tab.
    const wantTab = query ? new URLSearchParams(query).get('tab') : null;
    if (wantTab) return currentTab === wantTab;
    return !currentTab;
  }

  function allowed(item: Item): boolean {
    return canAccess(role, item.section, permissions);
  }

  return (
    <nav className="app-sidebar__nav app-sidebar__nav--desktop">
      {GROUPS.map((group, gi) => {
        const items = group.items.filter(allowed);
        if (items.length === 0) return null;
        return (
          <div className="app-sidebar__group" key={group.title || gi}>
            {group.title && <div className="app-sidebar__group-title">{group.title}</div>}
            {items.map((it) => {
              const badge = it.badgeKey && badges?.[it.badgeKey];
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="app-sidebar__link"
                  data-active={isActive(it) || undefined}
                >
                  <span className="app-sidebar__icon">{it.icon}</span>
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {badge ? <span className="nav-badge">{badge}</span> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
