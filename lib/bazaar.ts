type BalanceMark = { id: number; date: string; leftover: number; comment?: string; by: string };
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
  tolerance: number;
  status: 'ok' | 'missing' | 'over';
  suspicious: boolean;
};

export function computeWindows(
  counts: BalanceMark[],
  given: GivenEntry[],
  invoices: InvoiceEntry[],
): BazaarWindow[] {
  const sorted = [...counts].sort((a, b) => a.date.localeCompare(b.date));
  const windows: BazaarWindow[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    // Остаток снимается вечером после закупа, поэтому вся активность дня уже
    // «зашита» в вечернюю отметку этого дня. Окно (prev, cur] — это дни после
    // прошлой отметки по текущую включительно; выдачи и накладные берём по
    // одной границе, иначе они разъезжаются на день.
    const givenIn = given.filter(g => g.date > prev.date && g.date <= cur.date);
    const invIn = invoices.filter(v => v.date > prev.date && v.date <= cur.date);
    const givenSum = givenIn.reduce((s, g) => s + g.amount, 0);
    const spent = prev.leftover + givenSum - cur.leftover;
    const entered = invIn.reduce((s, v) => s + v.total, 0);
    const diff = spent - entered;
    const tolerance = Math.max(50_000, Math.abs(spent) * 0.02);
    const status = diff > tolerance ? 'missing' : diff < -tolerance ? 'over' : 'ok';
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
