import { describe, test, expect } from 'vitest';
import { computeWindows, toTashkentDate } from './bazaar';

function mk(date: string, leftover: number, repaid = 0) {
  return { id: 1, date, leftover, repaid, by: 'test' };
}

// Модель: остаток снимается вечером после закупа. Окно (prev, cur] —
// активность дней после прошлой отметки по текущую включительно. Выдачи и
// накладные берутся по одной границе.
describe('computeWindows', () => {
  test('пример владельца — ok', () => {
    const counts = [mk('2026-11-03', 500_000), mk('2026-11-04', 1_000_000)];
    const given = [{ date: '2026-11-04', amount: 3_000_000, name: 'бозор' }];
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
    const counts = [mk('2026-11-03', 500_000), mk('2026-11-04', 1_000_000)];
    const given = [{ date: '2026-11-04', amount: 3_000_000, name: 'бозор' }];
    const invoices = [{ id: 1, date: '2026-11-04', total: 2_100_000 }];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.diff).toBe(400_000);
    expect(w.status).toBe('missing');
  });

  test('накладных больше — over', () => {
    const counts = [mk('2026-11-03', 500_000), mk('2026-11-04', 1_000_000)];
    const given = [{ date: '2026-11-04', amount: 3_000_000, name: 'бозор' }];
    const invoices = [{ id: 1, date: '2026-11-04', total: 3_300_000 }];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.diff).toBe(-800_000);
    expect(w.status).toBe('over');
  });

  test('допуск — разница 30 000 при потрачено 2 500 000 — ok', () => {
    const counts = [mk('2026-11-03', 500_000), mk('2026-11-04', 1_000_000)];
    const given = [{ date: '2026-11-04', amount: 3_000_000, name: 'бозор' }];
    const invoices = [{ id: 1, date: '2026-11-04', total: 2_470_000 }];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.status).toBe('ok');
    expect(w.tolerance).toBe(50_000);
  });

  test('перенос остатка', () => {
    const counts = [mk('2026-11-04', 500_000), mk('2026-11-05', 300_000)];
    const given = [{ date: '2026-11-05', amount: 2_000_000, name: 'бозор' }];
    const invoices = [{ id: 1, date: '2026-11-05', total: 2_200_000 }];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.spent).toBe(2_200_000);
    expect(w.status).toBe('ok');
  });

  test('выдача в день прошлой отметки — не входит', () => {
    const counts = [mk('2026-11-04', 0), mk('2026-11-05', 0)];
    const given = [
      { date: '2026-11-04', amount: 1_000_000, name: 'бозор' },
      { date: '2026-11-05', amount: 2_000_000, name: 'бозор' },
    ];
    const invoices = [{ id: 1, date: '2026-11-05', total: 2_000_000 }];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.givenSum).toBe(2_000_000);
  });

  test('приход в день прошлой отметки — не входит', () => {
    const counts = [mk('2026-11-04', 0), mk('2026-11-05', 0)];
    const given = [{ date: '2026-11-05', amount: 1_000_000, name: 'бозор' }];
    const invoices = [
      { id: 1, date: '2026-11-04', total: 500_000 },
      { id: 2, date: '2026-11-05', total: 500_000 },
    ];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.entered).toBe(500_000);
    expect(w.invoiceCount).toBe(1);
  });

  test('окно в два дня — выдачи и приходы за оба дня', () => {
    const counts = [mk('2026-11-01', 0), mk('2026-11-03', 400_000)];
    const given = [
      { date: '2026-11-02', amount: 3_000_000, name: 'бозор' },
      { date: '2026-11-03', amount: 3_000_000, name: 'бозор' },
    ];
    const invoices = [{ id: 1, date: '2026-11-03', total: 5_600_000 }];
    const [w] = computeWindows(counts, given, invoices);
    expect(w.givenSum).toBe(6_000_000);
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
    const given = [{ date: '2026-11-04', amount: 1_000_000, name: 'бозор' }];
    const [w] = computeWindows(counts, given, []);
    expect(w.suspicious).toBe(true);
    expect(w.spent).toBe(-4_000_000);
  });

  test('привёз в долг — долг растёт из over', () => {
    const counts = [mk('2026-11-03', 500_000), mk('2026-11-04', 0)];
    const invoices = [{ id: 1, date: '2026-11-04', total: 1_000_000 }];
    const [w] = computeWindows(counts, [], invoices);
    expect(w.spent).toBe(500_000);
    expect(w.inDebt).toBe(500_000);
    expect(w.debtAfter).toBe(500_000);
    expect(w.status).toBe('over');
  });

  test('погашение закрывает долг и гасит ложную «не хватает»', () => {
    const counts = [mk('2026-11-01', 0), mk('2026-11-02', 0), mk('2026-11-03', 0, 1_000_000)];
    const given = [{ date: '2026-11-03', amount: 1_000_000, name: 'бозор' }];
    const invoices = [{ id: 1, date: '2026-11-02', total: 1_000_000 }];
    const [recent, older] = computeWindows(counts, given, invoices);
    // старое окно 01→02: привезли в долг на 1 млн
    expect(older.inDebt).toBe(1_000_000);
    expect(older.debtAfter).toBe(1_000_000);
    expect(older.status).toBe('over');
    // свежее окно 02→03: выдали 1 млн, накладных нет, но это погашение долга
    expect(recent.shortfall).toBe(0);
    expect(recent.debtAfter).toBe(0);
    expect(recent.status).toBe('ok');
  });

  test('частичное погашение — остаток идёт в «не хватает»', () => {
    const counts = [mk('2026-11-04', 0), mk('2026-11-05', 0, 600_000)];
    const given = [{ date: '2026-11-05', amount: 1_000_000, name: 'бозор' }];
    const [w] = computeWindows(counts, given, []);
    expect(w.spent).toBe(1_000_000);
    expect(w.repaid).toBe(600_000);
    expect(w.shortfall).toBe(400_000);
    expect(w.debtAfter).toBe(-600_000);
    expect(w.status).toBe('missing');
  });
});

describe('toTashkentDate', () => {
  test('UTC 23:30 = Tashkent следующий день', () => {
    expect(toTashkentDate('2026-11-04T23:30:00Z')).toBe('2026-11-05');
  });
});
