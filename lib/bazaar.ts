type BalanceMark = { id: number; date: string; leftover: number; repaid?: number; comment?: string; by: string };
type GivenEntry = { date: string; amount: number; name: string };
export type InvoiceEntry = { id?: number; date: string; total: number; document?: string };

export type BazaarWindow = {
  from: string;
  to: string;
  openingLeftover: number;
  leftover: number;
  given: GivenEntry[];
  givenSum: number;
  spent: number;
  entered: number;
  invoiceCount: number;
  invoices: InvoiceEntry[];
  diff: number;
  // Накладных больше, чем потрачено налом → снабженец привёз в долг на эту сумму.
  inDebt: number;
  // Погашено старого долга деньгами в этом окне (вводит бухгалтер).
  repaid: number;
  // Реально не хватает накладных после вычета погашения долга.
  shortfall: number;
  // Накопительный долг снабженца на конец этого окна.
  debtAfter: number;
  tolerance: number;
  status: 'ok' | 'missing' | 'over';
  suspicious: boolean;
};

/** Предыдущий календарный день для даты YYYY-MM-DD. */
function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function computeWindows(
  counts: BalanceMark[],
  given: GivenEntry[],
  invoices: InvoiceEntry[],
): BazaarWindow[] {
  const sorted = [...counts].sort((a, b) => a.date.localeCompare(b.date));
  const windows: BazaarWindow[] = [];
  // Долг копим в хронологическом порядке: «over» (товар в долг) его увеличивает,
  // погашение деньгами — уменьшает. В конце список разворачиваем (свежие сверху).
  let debt = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    // Кассир записывает выдачу на базар в своей смене за день N (вечером при
    // закрытии кассы), а снабженец едет на базар и покупает на следующий день
    // N+1 — тогда и проводятся накладные. Поэтому выдачу берём строго за день
    // перед закрытием окна (cur − 1 календарный день), а не за весь период от
    // прошлой отметки: касса вносится каждый день, выдача за вчера всегда есть.
    // Если промежуточный день пропущен в отметках — его выдача просто не
    // сверяется, а не слипается с текущим окном.
    //   выдачи   — ровно день cur − 1;
    //   накладные (prev, cur] — проведены в день cur (или за пропущенные дни).
    const prevDay = dayBefore(cur.date);
    const givenIn = given.filter(g => g.date === prevDay);
    const invIn = invoices.filter(v => v.date > prev.date && v.date <= cur.date);
    const givenSum = givenIn.reduce((s, g) => s + g.amount, 0);
    const spent = prev.leftover + givenSum - cur.leftover;
    const entered = invIn.reduce((s, v) => s + v.total, 0);
    const diff = spent - entered;

    const repaid = Math.max(0, cur.repaid ?? 0);
    // Накладных больше потраченного → привезли в долг на разницу.
    const inDebt = Math.max(0, -diff);
    // Потрачено больше накладных → часть покрывает погашение долга, остаток —
    // реально не внесённые накладные.
    const shortfall = Math.max(0, diff - repaid);
    debt += inDebt - repaid;

    const tolerance = Math.max(50_000, Math.abs(spent) * 0.02);
    const status = inDebt > tolerance ? 'over' : shortfall > tolerance ? 'missing' : 'ok';
    windows.push({
      from: prev.date,
      to: cur.date,
      openingLeftover: prev.leftover,
      leftover: cur.leftover,
      given: givenIn,
      givenSum,
      spent,
      entered,
      invoiceCount: invIn.length,
      invoices: invIn,
      diff,
      inDebt,
      repaid,
      shortfall,
      debtAfter: debt,
      tolerance,
      status,
      suspicious: spent < 0,
    });
  }
  return windows.reverse();
}

const BAZAAR_RE = /(бозор|базор|базар|bozor|bazar|bazor)/i;

export function isBazaarExpense(name: string): boolean {
  return BAZAAR_RE.test(name);
}

const TASHKENT_OFFSET_MS = 5 * 3600_000;

export function toTashkentDate(utc: Date | string): string {
  const d = new Date(typeof utc === 'string' ? utc : utc.getTime());
  const shifted = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
