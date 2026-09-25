'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { canAccess, type Section } from '@/lib/access';

type Tab = { href: string; label: string; icon: string; section: Section; badgeKey?: 'inbox' };

/**
 * Разделы нижней панели. Порядок = приоритет: первые четыре попадают в панель,
 * остальное уезжает в «Ещё». На телефоне ряд из пяти колонок — потолок, при
 * котором подпись читается и палец не промахивается.
 */
const TABS: Tab[] = [
  { href: '/dashboard', label: 'Главная', icon: '🏠', section: 'home' },
  { href: '/dashboard/operations', label: 'Смена', icon: '🧾', section: 'home', badgeKey: 'inbox' },
  { href: '/dashboard/warehouse', label: 'Склад', icon: '📦', section: 'balances' },
  { href: '/dashboard/finance', label: 'Финансы', icon: '💰', section: 'safe' },
  { href: '/dashboard/analytics', label: 'Аналитика', icon: '📊', section: 'analytics' },
  { href: '/dashboard/assistant', label: 'Ассистент', icon: '✨', section: 'assistant' },
  { href: '/dashboard/assets', label: 'Опись ОС', icon: '🏛', section: 'assets' },
  { href: '/dashboard/profile', label: 'Профиль', icon: '🙂', section: 'profile' },
  { href: '/dashboard/admin', label: 'Настройки', icon: '⚙️', section: 'adminUsers' },
];

const MAX_IN_BAR = 4;

function useCloseOnRouteChange(close: () => void) {
  const path = usePathname();
  useEffect(() => { close(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Общая шторка снизу: на телефоне до неё дотягивается большой палец. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Фон не должен уезжать под шторкой.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__handle" aria-hidden="true" />
        <div className="sheet__title">{title}</div>
        <div className="sheet__body">{children}</div>
        <button type="button" className="btn sheet__close" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );
}

export function MobileTabBar({
  role,
  permissions,
  badges,
}: {
  role: string;
  permissions?: (string | Section)[] | null;
  badges?: { inbox?: number };
}) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  useCloseOnRouteChange(() => setMore(false));

  const allowed = TABS.filter((t) => canAccess(role, t.section, permissions));
  const inBar = allowed.length <= 5 ? allowed : allowed.slice(0, MAX_IN_BAR);
  const rest = allowed.length <= 5 ? [] : allowed.slice(MAX_IN_BAR);

  const isActive = (href: string) =>
    href === '/dashboard' ? path === href : !!path?.startsWith(href);
  // Пункт из «Ещё» тоже должен подсвечивать кнопку «Ещё».
  const restActive = rest.some((t) => isActive(t.href));

  return (
    <>
      <nav className="mobile-tabbar" style={{ gridTemplateColumns: `repeat(${inBar.length + (rest.length ? 1 : 0)}, 1fr)` }}>
        {inBar.map((t) => {
          const badge = t.badgeKey && badges?.[t.badgeKey];
          return (
            <Link key={t.href} href={t.href} className="mobile-tab" data-active={isActive(t.href) || undefined}>
              <span className="mobile-tab__icon">
                {t.icon}
                {badge ? <span className="mobile-tab__badge">{badge > 99 ? '99+' : badge}</span> : null}
              </span>
              <span className="mobile-tab__label">{t.label}</span>
            </Link>
          );
        })}
        {rest.length > 0 && (
          <button type="button" className="mobile-tab" data-active={restActive || more || undefined} onClick={() => setMore(true)}>
            <span className="mobile-tab__icon">⋯</span>
            <span className="mobile-tab__label">Ещё</span>
          </button>
        )}
      </nav>

      {more && (
        <Sheet title="Ещё" onClose={() => setMore(false)}>
          {rest.map((t) => (
            <Link key={t.href} href={t.href} className="sheet__row" onClick={() => setMore(false)}>
              <span className="sheet__row-icon">{t.icon}</span>
              <span>{t.label}</span>
            </Link>
          ))}
        </Sheet>
      )}
    </>
  );
}

type Filial = { id: number; name: string };

/**
 * Верхняя панель телефона: выбор филиала переехал сюда из бокового меню.
 * Это самый частый переключатель, а в нижнюю панель он не помещается — здесь
 * он всегда на виду и открывается шторкой с крупными строками вместо
 * системного `<select>`, по которому на телефоне тяжело попасть.
 */
export function MobileTopBar({
  filials, current, allowAll, userName,
}: { filials: Filial[]; current: number | 'all'; allowAll: boolean; userName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();

  // Переключать есть что только когда филиалов больше одного: «Все филиалы»
  // поверх единственного — то же самое. (Раньше здесь стояло условие с двумя
  // одинаковыми половинами, и вторая никогда ничего не добавляла.)
  const canSwitch = filials.length > 1;
  const currentName = current === 'all'
    ? 'Все филиалы'
    : filials.find((f) => f.id === current)?.name || 'Филиал';

  async function switchTo(value: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/current-filial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: value }),
      });
      if (!res.ok) {
        // Молчаливый отказ на телефоне ещё заметнее: шторка закрывается, а
        // филиал прежний — выглядит как «кнопка не нажалась».
        const data = await res.json().catch(() => ({} as { error?: string }));
        alert(data.error || `Не удалось переключить филиал (${res.status})`);
        return;
      }
      setOpen(false);
      start(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="mobile-topbar">
        <span className="mobile-topbar__mark" aria-hidden="true">L</span>
        {canSwitch ? (
          <button type="button" className="mobile-topbar__filial" onClick={() => setOpen(true)} disabled={busy}>
            <span className="mobile-topbar__filial-name">{currentName}</span>
            <span aria-hidden="true">▾</span>
          </button>
        ) : (
          <span className="mobile-topbar__filial mobile-topbar__filial--static">{currentName}</span>
        )}
        <Link href="/dashboard/profile" className="mobile-topbar__user" aria-label={`Профиль: ${userName}`}>
          {userName.trim().charAt(0).toUpperCase() || '?'}
        </Link>
      </header>

      {open && (
        <Sheet title="Филиал" onClose={() => setOpen(false)}>
          {allowAll && filials.length > 1 && (
            <button type="button" className="sheet__row" onClick={() => switchTo('all')} disabled={busy}
              data-active={current === 'all' || undefined}>
              <span className="sheet__row-icon">🌐</span>
              <span>Все филиалы</span>
              {current === 'all' && <span className="sheet__row-check">✓</span>}
            </button>
          )}
          {filials.map((f) => (
            <button key={f.id} type="button" className="sheet__row" onClick={() => switchTo(String(f.id))} disabled={busy}
              data-active={current === f.id || undefined}>
              <span className="sheet__row-icon">🏢</span>
              <span>{f.name}</span>
              {current === f.id && <span className="sheet__row-check">✓</span>}
            </button>
          ))}
        </Sheet>
      )}
    </>
  );
}
