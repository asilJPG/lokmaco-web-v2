import { describe, test, expect } from 'vitest';
import { computeWindows, toTashkentDate } from './bazaar';

function mk(date: string, leftover: number) {
  return { id: 1, date, leftover, by: 'test' };
}

describe('computeWindows', () => {
  test('пример владельца — ok', () => {
    const counts = [mk('2026-11-03', 0), mk('2026-11-04', 500_000)];
    const given = [{ date: '2026-11-03', amount: 3_000_000, name: 'бозор' }];
    const invoices = [
      { id: 1, date: '2026-11-04', total: 1_500_000 },
      { id: 2, date: '2026-11-04', total: 1_000_000 },
    ];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.spent).toBe(2_500_000);
    expect(w.entered).toBe(2_500_000);
    expect(w.status).toBe('ok');
  });

  test('не хватает накладных — missing', () => {
    const counts = [mk('2026-11-03', 0), mk('2026-11-04', 500_000)];
    const given = [{ date: '2026-11-03', amount: 3_000_000, name: 'бозор' }];
    const invoices = [{ id: 1, date: '2026-11-04', total: 2_100_000 }];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.diff).toBe(400_000);
    expect(w.status).toBe('missing');
  });

  test('накладных больше — over', () => {
    const counts = [mk('2026-11-03', 0), mk('2026-11-04', 500_000)];
    const given = [{ date: '2026-11-03', amount: 3_000_000, name: 'бозор' }];
    const invoices = [{ id: 1, date: '2026-11-04', total: 3_300_000 }];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.diff).toBe(-800_000);
    expect(w.status).toBe('over');
  });

  test('допуск — разница 30 000 при потрачено 2 500 000 — ok', () => {
    const counts = [mk('2026-11-03', 0), mk('2026-11-04', 500_000)];
    const given = [{ date: '2026-11-03', amount: 3_000_000, name: 'бозор' }];
    const invoices = [{ id: 1, date: '2026-11-04', total: 2_470_000 }];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.status).toBe('ok');
    expect(w.tolerance).toBe(50_000);
  });

  test('перенос остатка', () => {
    const counts = [mk('2026-11-04', 500_000), mk('2026-11-05', 300_000)];
    const given = [{ date: '2026-11-04', amount: 2_000_000, name: 'бозор' }];
    const invoices = [{ id: 1, date: '2026-11-05', total: 2_200_000 }];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.spent).toBe(2_200_000);
    expect(w.status).toBe('ok');
  });

  test('выдача в день отметки — только та, что < cur.date', () => {
    const counts = [mk('2026-11-04', 0), mk('2026-11-05', 0)];
    const given = [
      { date: '2026-11-04', amount: 1_000_000, name: 'бозор' },
      { date: '2026-11-05', amount: 2_000_000, name: 'бозор' },
    ];
    const invoices = [{ id: 1, date: '2026-11-05', total: 1_000_000 }];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.givenSum).toBe(1_000_000);
  });

  test('приход в день прошлой отметки — не входит', () => {
    const counts = [mk('2026-11-04', 0), mk('2026-11-05', 0)];
    const given = [{ date: '2026-11-04', amount: 1_000_000, name: 'бозор' }];
    const invoices = [
      { id: 1, date: '2026-11-04', total: 500_000 },
      { id: 2, date: '2026-11-05', total: 500_000 },
    ];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.entered).toBe(500_000);
    expect(w.invoiceCount).toBe(1);
  });

  test('окно в два дня', () => {
    const counts = [mk('2026-11-01', 0), mk('2026-11-03', 400_000)];
    const given = [
      { date: '2026-11-01', amount: 3_000_000, name: 'бозор' },
      { date: '2026-11-02', amount: 3_000_000, name: 'бозор' },
    ];
    const invoices = [{ id: 1, date: '2026-11-03', total: 5_600_000 }];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.spent).toBe(5_600_000);
    expect(w.status).toBe('ok');
  });

  test('одна отметка — нет окон', () => {
    expect(computeWindows([mk('2026-11-03', 0)], [], [])).toHaveLength(0);
  });

  test('нет отметок — нет окон', () => {
    expect(computeWindows([], [], [])).toHaveLength(0);
  });

  test('остаток больше денег — suspicious', () => {
    const counts = [mk('2026-11-03', 0), mk('2026-11-04', 5_000_000)];
    const given = [{ date: '2026-11-03', amount: 1_000_000, name: 'бозор' }];
    const [w] = computeWindows(counts, given, []);
    expect(w.suspicious).toBe(true);
    expect(w.spent).toBe(-4_000_000);
  });
});

describe('toTashkentDate', () => {
  test('UTC 23:30 = Tashkent следующий день', () => {
    expect(toTashkentDate('2026-11-04T23:30:00Z')).toBe('2026-11-05');
  });
});
