'use client';

import { useEffect, useState } from 'react';

export function toggleGlobalTheme() {
  if (typeof window === 'undefined') return;
  const current =
    document.documentElement.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('lokmaco_theme', next);
  } catch {}
  window.dispatchEvent(new CustomEvent('lokmaco-theme-change', { detail: next }));
}

function SunIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function ThemeToggle({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'dark' || current === 'light') {
      setTheme(current);
    } else {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(isDark ? 'dark' : 'light');
    }

    function onThemeChange(e: Event) {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail === 'dark' || customEvent.detail === 'light') {
        setTheme(customEvent.detail);
      }
    }

    window.addEventListener('lokmaco-theme-change', onThemeChange);
    return () => window.removeEventListener('lokmaco-theme-change', onThemeChange);
  }, []);

  const isDark = theme === 'dark';
  const label = isDark ? 'Светлая' : 'Тёмная';
  const title = isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему';

  return (
    <button
      type="button"
      onClick={toggleGlobalTheme}
      className={`theme-toggle-btn ${compact ? 'theme-toggle-btn--compact' : ''} ${className}`}
      title={title}
      aria-label={title}
      suppressHydrationWarning
    >
      <span className="theme-toggle-btn__icon" aria-hidden="true">
        {mounted ? (isDark ? <SunIcon size={compact ? 16 : 14} /> : <MoonIcon size={compact ? 16 : 14} />) : <SunIcon size={compact ? 16 : 14} />}
      </span>
      {!compact && <span>{mounted ? label : 'Тема'}</span>}
    </button>
  );
}
