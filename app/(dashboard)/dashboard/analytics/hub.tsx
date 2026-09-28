'use client';

import { useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { OverviewTab } from './overview-tab';
import { IikoTabs } from './iiko-tabs';
import { DishesTab } from './dishes-tab';
import { LiquidityTab } from './liquidity-tab';
import { PricesTab } from './prices-tab';
import { canAccess, type Section } from '@/lib/access';

export type TabId = 'overview' | 'pl' | 'abc' | 'liquidity' | 'sales' | 'purchases' | 'waiters';

// Роли вкладок — из lib/access.ts, как в легаси: менеджеру видны только те,
// что и там («Продажи»), остальное — финансовая кухня для admin/director.
const TABS: { id: TabId; label: string; section: Section }[] = [
  { id: 'overview', label: 'Обзор', section: 'analytics' },
  { id: 'pl', label: 'ОПиУ', section: 'analytics.pl' },
  { id: 'abc', label: 'ABC-анализ блюд', section: 'analytics.abc' },
  { id: 'liquidity', label: 'Ликвидность', section: 'analytics.liquidity' },
  { id: 'sales', label: 'Продажи по группам', section: 'analytics.sales' },
  { id: 'purchases', label: 'Закупки', section: 'analytics.purchases' },
  { id: 'waiters', label: 'Официанты', section: 'analytics.waiters' },
];

/** Явки и Сверка уехали в «Смену» и «Финансы» — старые ссылки не должны ломаться. */
const MOVED: Record<string, string> = {
  attendance: '/dashboard/attendance',
  reconciliation: '/dashboard/reconciliation',
};

export function AnalyticsHub({ from, to, role }: { from: string; to: string; role: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();

  const raw = sp?.get('tab');
  const moved = raw ? MOVED[raw] : undefined;

  useEffect(() => {
    if (moved) router.replace(moved);
  }, [moved, router]);

  const visible = TABS.filter((t) => canAccess(role, t.section));
  // Вкладка не своей роли не должна открываться по прямой ссылке — уводим на
  // первую доступную.
  const tab: TabId = visible.some((t) => t.id === raw) ? (raw as TabId) : (visible[0]?.id ?? 'overview');

  // The tab lives in the URL so the sidebar can deep-link and the view survives
  // a reload or a shared link.
  function select(id: TabId) {
    const next = new URLSearchParams(sp?.toString() || '');
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="grid">
      <div style={{ width: '100%', maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', paddingBottom: 2 }}>
        <div className="segmented" role="tablist">
          {visible.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className="segmented__item"
              onClick={() => select(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <OverviewTab from={from} to={to} />}
      {tab === 'abc' && <DishesTab from={from} to={to} />}
      {tab === 'liquidity' && <LiquidityTab />}
      {tab === 'purchases' && <PricesTab from={from} to={to} />}
      {(tab === 'pl' || tab === 'sales' || tab === 'waiters') && (
        <IikoTabs from={from} to={to} tab={tab} />
      )}
    </div>
  );
}
