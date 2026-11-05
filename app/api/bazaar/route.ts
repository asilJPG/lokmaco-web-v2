import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { db, schema } from '@/db/client';
import { and, eq, inArray, sql, gte, lte, isNull } from 'drizzle-orm';
import { baseRole } from '@/lib/access';
import { computeWindows, isBazaarExpense, toTashkentDate } from '@/lib/bazaar';
import type { InvoiceEntry } from '@/lib/bazaar';
import { fetchIikoCashInvoices } from '@/lib/bazaar-iiko';
import { todayTashkent } from '@/lib/period';

export const dynamic = 'force-dynamic';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

type Details = Record<string, unknown>;

export async function GET() {
  const session = await requireSession();
  const role = baseRole(session.role);
  if (role !== 'admin' && role !== 'accountant' && role !== 'director') {
    return Response.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) {
    return Response.json({ error: 'Нет филиала' }, { status: 400 });
  }

  const marks = await db
    .select()
    .from(schema.botActions)
    .where(and(
      inArray(schema.botActions.filialId, filialIds),
      eq(schema.botActions.actionType, 'bazaar_balance'),
    ));

  const activeCounts = marks
    .filter(r => {
      const d = (r.details || {}) as Details;
      return !d.deleted_at;
    })
    .map(r => {
      const d = (r.details || {}) as Details;
      return {
        id: r.id,
        date: String(d.date || ''),
        leftover: num(d.leftover),
        comment: String(d.comment || ''),
        by: r.userName || '',
      };
    });

  const allDates = activeCounts.map(c => c.date).filter(Boolean);
  if (allDates.length < 2) {
    return Response.json({
      windows: [],
      marks: activeCounts.sort((a, b) => b.date.localeCompare(a.date)),
    });
  }

  const minDate = allDates.sort()[0];
  const maxDate = allDates.sort()[allDates.length - 1];

  const cashRows = await db
    .select()
    .from(schema.botActions)
    .where(and(
      inArray(schema.botActions.filialId, filialIds),
      eq(schema.botActions.actionType, 'cash'),
    ));

  const given: { date: string; amount: number; name: string }[] = [];
  for (const row of cashRows) {
    const d = (row.details || {}) as Details;
    const shiftDate = String(d.selected_date || '') || toTashkentDate(row.createdAt);
    if (shiftDate < minDate || shiftDate > maxDate) continue;
    const expenses = Array.isArray(d.expenses) ? d.expenses : [];
    for (const e of expenses) {
      if (isBazaarExpense(String(e.name || ''))) {
        given.push({ date: shiftDate, amount: num(e.amount), name: String(e.name) });
      }
    }
  }

  // Накладные берём напрямую из iiko (источник правды), а не из наших
  // TG-записей: отредактированную внутри iiko накладную наша база не увидит.
  const invoices: InvoiceEntry[] = [];
  const seen = new Set<string>();
  try {
    for (const fid of filialIds) {
      const iikoInvoices = await fetchIikoCashInvoices(fid, minDate, maxDate);
      for (const inv of iikoInvoices) {
        // Один iiko-сервер на несколько филиалов вернёт одни и те же документы —
        // дедупим по id документа.
        if (inv.docId && seen.has(inv.docId)) continue;
        if (inv.docId) seen.add(inv.docId);
        invoices.push({ date: inv.date, total: inv.total, document: inv.document });
      }
    }
  } catch (e) {
    return Response.json(
      { error: `Не удалось получить накладные из iiko: ${e instanceof Error ? e.message : 'ошибка'}` },
      { status: 502 },
    );
  }

  const windows = computeWindows(activeCounts, given, invoices);

  return Response.json({
    windows,
    marks: activeCounts.sort((a, b) => b.date.localeCompare(a.date)),
  });
}

export async function POST(req: Request) {
  const session = await requireSession();
  const role = baseRole(session.role);
  if (role !== 'admin' && role !== 'accountant' && role !== 'director') {
    return Response.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0 || filialIds.length > 1) {
    return Response.json({ error: 'Выберите один филиал' }, { status: 400 });
  }

  const body = await req.json();
  const date = String(body.date || '').trim();
  const leftover = num(body.leftover);
  const comment = String(body.comment || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Неверная дата' }, { status: 400 });
  }
  if (date > todayTashkent()) {
    return Response.json({ error: 'Дата не может быть из будущего' }, { status: 400 });
  }
  if (leftover < 0) {
    return Response.json({ error: 'Остаток не может быть отрицательным' }, { status: 400 });
  }

  const filialId = filialIds[0];

  const [existing] = await db
    .select()
    .from(schema.botActions)
    .where(and(
      eq(schema.botActions.filialId, filialId),
      eq(schema.botActions.actionType, 'bazaar_balance'),
      eq(schema.botActions.documentNumber, date),
    ))
    .limit(1);

  if (existing) {
    const prev = (existing.details || {}) as Details;
    await db.update(schema.botActions)
      .set({
        details: {
          ...prev,
          date,
          leftover,
          comment: comment || prev.comment || '',
          deleted_at: null,
          deleted_by: null,
          edited_by: session.name,
          edited_at: new Date().toISOString(),
        },
        userName: session.name,
      })
      .where(eq(schema.botActions.id, existing.id));

    return Response.json({ success: true, updated: true, id: existing.id });
  }

  const [row] = await db.insert(schema.botActions).values({
    filialId,
    tgId: null,
    userName: session.name,
    actionType: 'bazaar_balance',
    documentNumber: date,
    details: { date, leftover, comment },
  }).returning({ id: schema.botActions.id });

  return Response.json({ success: true, id: row.id });
}
