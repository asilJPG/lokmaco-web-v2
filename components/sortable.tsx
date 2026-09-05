'use client';

import { useMemo, useRef, useState } from 'react';

export type SortState<K extends string> = { key: K; dir: 1 | -1 };

/**
 * Сортировка таблицы по клику на заголовок.
 *
 * Вынесена в общий компонент, потому что копия уже жила в «Остатках»: у
 * второй таблицы стрелки и порядок первого клика неизбежно разъехались бы.
 *
 * Первый клик по столбцу даёт **убывание**: в отчётах ищут «у кого больше
 * всех», а не «у кого меньше». Повторный клик переворачивает.
 */
export function useSort<T, K extends string>(
  rows: T[],
  initial: K,
  value: (row: T, key: K) => number | string | null | undefined
) {
  const [sort, setSort] = useState<SortState<K>>({ key: initial, dir: -1 });

  // Функция извлечения приходит новой на каждый рендер — держим её в ref,
  // иначе пересортировка запускалась бы вхолостую при любом изменении стейта.
  const valueRef = useRef(value);
  valueRef.current = value;

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const x = valueRef.current(a, sort.key);
      const y = valueRef.current(b, sort.key);
      if (typeof x === 'string' || typeof y === 'string') {
        return String(x ?? '').localeCompare(String(y ?? ''), 'ru') * sort.dir;
      }
      return ((Number(x) || 0) - (Number(y) || 0)) * sort.dir;
    });
    return out;
  }, [rows, sort]);

  function toggle(key: K) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));
  }

  return { sorted, sort, toggle };
}

export function SortTh<K extends string>({ label, col, sort, onSort, align = 'left', className }: {
  label: string;
  col: K;
  sort: SortState<K>;
  onSort: (col: K) => void;
  align?: 'left' | 'right';
  /** Классы колонки — по ним таблица прячет второстепенное на узком экране. */
  className?: string;
}) {
  const active = sort.key === col;
  return (
    <th
      className={className}
      onClick={() => onSort(col)}
      style={{
        padding: '10px 8px', textAlign: align, borderBottom: '1px solid var(--border)',
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        color: active ? 'var(--text)' : undefined,
      }}
      title="Сортировать"
    >
      {label}{active ? (sort.dir === 1 ? ' ↑' : ' ↓') : ' ↕'}
    </th>
  );
}
