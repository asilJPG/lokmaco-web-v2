'use client';

import { useEffect, useState } from 'react';
import { FilialSwitcher } from './filial-switcher';
import { ThemeToggle } from './theme-toggle';
import { LogoutButton } from './logout-button';

export function toggleGlobalSidebar() {
  if (typeof window === 'undefined') return;
  const isCollapsed = document.documentElement.getAttribute('data-sidebar-collapsed') === 'true';
  const next = !isCollapsed;
  if (next) {
    document.documentElement.setAttribute('data-sidebar-collapsed', 'true');
  } else {
    document.documentElement.removeAttribute('data-sidebar-collapsed');
  }
  try {
    localStorage.setItem('lokmaco_sidebar_collapsed', next ? 'true' : 'false');
  } catch {}
  window.dispatchEvent(new CustomEvent('lokmaco-sidebar-toggle', { detail: next }));
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const isCollapsed = document.documentElement.getAttribute('data-sidebar-collapsed') === 'true';
    setCollapsed(isCollapsed);

    function onToggle(e: Event) {
      const customEvent = e as CustomEvent<boolean>;
      setCollapsed(customEvent.detail);
    }

    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        toggleGlobalSidebar();
      }
    }

    window.addEventListener('lokmaco-sidebar-toggle', onToggle);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('lokmaco-sidebar-toggle', onToggle);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return { collapsed, toggleSidebar: toggleGlobalSidebar };
}

export function SidebarCollapseButton() {
  useSidebarCollapsed();

  return (
    <button
      type="button"
      className="sidebar-collapse-btn"
      onClick={toggleGlobalSidebar}
      title="Скрыть боковую панель (Ctrl+B)"
      aria-label="Скрыть боковую панель"
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
        <path d="m14 9-3 3 3 3" />
      </svg>
    </button>
  );
}

export function DesktopCollapsedBar({
  filials,
  current,
  allowAll,
  userName,
}: {
  filials: { id: number; name: string }[];
  current: number | 'all';
  allowAll: boolean;
  userName: string;
}) {
  useSidebarCollapsed();

  return (
    <header className="desktop-collapsed-bar" data-print-hide>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <button
          type="button"
          className="btn btn--sm"
          onClick={toggleGlobalSidebar}
          title="Показать боковую панель (Ctrl+B)"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 3v18" />
            <path d="m12 9 3 3-3 3" />
          </svg>
          <span>Меню</span>
          <kbd style={{ fontSize: 10, padding: '1px 5px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--surface-muted)' }}>⌘B</kbd>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14 }}>
          <span className="app-sidebar__mark" style={{ width: 22, height: 22, fontSize: 11 }}>L</span>
          <span>Lokmaco</span>
        </div>

        {(filials.length > 1 || allowAll) && (
          <FilialSwitcher filials={filials} current={current} allowAll={allowAll} compact />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => window.dispatchEvent(new CustomEvent('open-cmdk'))}
          title="Быстрый поиск (Cmd+K)"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}
        >
          <span>Поиск</span>
          <kbd style={{ fontSize: 10, padding: '1px 5px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--surface-muted)' }}>⌘K</kbd>
        </button>

        <ThemeToggle compact />

        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, padding: '0 4px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {userName}
        </div>

        <LogoutButton />
      </div>
    </header>
  );
}
