import { db, schema } from '@/db/client';
import { withIikoSession, type IikoCreds } from './iiko';
import { resolveIikoCreds } from './filial-iiko';

export type Payments = {
  cash: number;
  encashment: number;
  uzcard: number;
  humo: number;
  online: number;
  rahmat: number;
  uzum: number;
  yandex: number;
};

export type ExpenseLine = { name: string; amount: number };
export type WageLine = { employeeId: string; name: string; wage: number };

export type CashSubmission = {
  filialId: number;
  date: string;
  payments: Partial<Payments>;
  expenses: ExpenseLine[];
  surplus: number;
  shortage: number;
  comment: string;
  employeeWages: WageLine[];
  userId: number;
  userName: string;
  userTgId: number | null;
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

function makeDocNumber(): string {
  const now = new Date(Date.now() + 5 * 3600_000);
  return `CSH-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

export async function submitCashReport(s: CashSubmission) {
  const p: Payments = {
    cash: num(s.payments.cash),
    encashment: num(s.payments.encashment),
    uzcard: num(s.payments.uzcard),
    humo: num(s.payments.humo),
    online: num(s.payments.online),
    rahmat: num(s.payments.rahmat),
    uzum: num(s.payments.uzum),
    yandex: num(s.payments.yandex),
  };
  const totalSales = Object.values(p).reduce((sum, v) => sum + v, 0);
  const totalExpenses = s.expenses.reduce((sum, e) => sum + num(e.amount), 0);
  const surplus = num(s.surplus);
  const shortage = num(s.shortage);

  let iikoRevenue = 0;
  let iikoError: string | null = null;
  try {
    iikoRevenue = await fetchDayRevenue(s.date, s.filialId);
  } catch (e) {
    iikoError = e instanceof Error ? e.message : 'iiko недоступен';
  }
  const iikoCash = iikoRevenue || totalSales;
  const diff = Math.round(totalSales - iikoRevenue);

  const createdAt = new Date(`${s.date}T12:00:00+05:00`);
  const docNumber = makeDocNumber();

  await db.insert(schema.cashReports).values({
    filialId: s.filialId,
    cashierTgId: s.userTgId,
    cashierName: s.userName,
    reportedCash: Math.round(totalSales),
    iikoCash: Math.round(iikoCash),
    difference: Math.round(diff),
    createdAt,
  });

  const [row] = await db.insert(schema.botActions).values({
    filialId: s.filialId,
    tgId: s.userTgId,
    userName: s.userName,
    actionType: 'cash',
    documentNumber: docNumber,
    createdAt,
    details: {
      payments: p,
      expenses: s.expenses.map((e) => ({ name: e.name || 'Расход', amount: num(e.amount) })),
      employee_wages: s.employeeWages.map((w) => ({ employeeId: w.employeeId, name: w.name, wage: num(w.wage) })),
      total_sales: totalSales,
      total_expenses: totalExpenses,
      surplus,
      shortage,
      difference: diff,
      iiko_cash: iikoCash,
      iiko_revenue: iikoRevenue,
      iiko_error: iikoError,
      comment: s.comment || '',
      selected_date: s.date,
    },
  }).returning({ id: schema.botActions.id });

  return { id: row.id, documentNumber: docNumber, iikoRevenue, diff, iikoError };
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchDayRevenue(date: string, filialId: number): Promise<number> {
  const { xml: creds } = await resolveIikoCreds(filialId);
  if (!creds.server || !creds.login) return 0;

  const nextDay = (() => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  return withIikoSession(async (token) => {
    const res = await fetch(`${creds.server}/resto/api/v2/reports/olap`, {
      method: 'POST',
      headers: { Cookie: `key=${token}`, 'Content-Type': 'application/json', 'User-Agent': BROWSER_UA },
      body: JSON.stringify({
        reportType: 'SALES',
        buildSummary: 'false',
        groupByRowFields: ['OpenDate.Typed'],
        groupByColFields: [],
        aggregateFields: ['DishDiscountSumInt'],
        filters: {
          'OpenDate.Typed': {
            filterType: 'DateRange',
            periodType: 'CUSTOM',
            from: date,
            to: nextDay,
            includeLow: 'true',
            includeHigh: 'false',
          },
          DeletedWithWriteoff: { filterType: 'ExcludeValues', values: ['DELETED_WITHOUT_WRITEOFF'] },
        },
      }),
    });
    if (!res.ok) throw new Error(`iiko OLAP: ${res.status}`);
    const json = await res.json();
    let total = 0;
    for (const row of (json?.data ?? []) as Record<string, unknown>[]) {
      total += Math.abs(parseFloat(String(row['DishDiscountSumInt'] ?? 0)));
    }
    return Math.round(total);
  }, creds);
}
