import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { db, schema } from '@/db/client';
import { and, eq, inArray } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  const filialIds = await getCurrentFilialIds();

  const [row] = await db
    .select()
    .from(schema.botActions)
    .where(and(
      eq(schema.botActions.id, Number(params.id)),
      eq(schema.botActions.actionType, 'cash'),
      inArray(schema.botActions.filialId, filialIds),
    ))
    .limit(1);

  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json({ shift: row });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (session.role.split(':')[0] !== 'admin') {
    return Response.json({ error: 'Только администратор может редактировать смену' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  const [existing] = await db
    .select()
    .from(schema.botActions)
    .where(and(
      eq(schema.botActions.id, Number(params.id)),
      eq(schema.botActions.actionType, 'cash'),
      inArray(schema.botActions.filialId, filialIds),
    ))
    .limit(1);

  if (!existing) return Response.json({ error: 'Смена не найдена' }, { status: 404 });

  const body = await req.json();
  const prev = (existing.details || {}) as Record<string, unknown>;
  const prevPay = (prev.payments || {}) as Record<string, number>;

  const nextPay = {
    cash: body.payments?.cash !== undefined ? num(body.payments.cash) : num(prevPay.cash),
    encashment: body.payments?.encashment !== undefined ? num(body.payments.encashment) : num(prevPay.encashment),
    uzcard: body.payments?.uzcard !== undefined ? num(body.payments.uzcard) : num(prevPay.uzcard),
    humo: body.payments?.humo !== undefined ? num(body.payments.humo) : num(prevPay.humo),
    online: body.payments?.online !== undefined ? num(body.payments.online) : num(prevPay.online),
    rahmat: body.payments?.rahmat !== undefined ? num(body.payments.rahmat) : num(prevPay.rahmat),
    uzum: body.payments?.uzum !== undefined ? num(body.payments.uzum) : num(prevPay.uzum),
    yandex: body.payments?.yandex !== undefined ? num(body.payments.yandex) : num(prevPay.yandex),
  };

  const nextExpenses = Array.isArray(body.expenses)
    ? body.expenses.filter((e: { name?: string; amount?: unknown }) => e && (e.name || e.amount))
        .map((e: { name?: string; amount?: unknown }) => ({ name: String(e.name || '').trim(), amount: num(e.amount) }))
    : (prev.expenses as { name: string; amount: number }[]) || [];

  const surplus = body.surplus !== undefined ? num(body.surplus) : num(prev.surplus);
  const shortage = body.shortage !== undefined ? num(body.shortage) : num(prev.shortage);

  const totalSales = Object.values(nextPay).reduce((s, v) => s + v, 0);
  const totalExpenses = nextExpenses.reduce((s: number, e: { amount: number }) => s + num(e.amount), 0);
  const diff = Math.round(totalSales - num(prev.iiko_revenue));

  const changes: Record<string, { from: number; to: number }> = {};
  for (const [k, v] of Object.entries(nextPay)) {
    if (num(prevPay[k]) !== v) changes[`payments.${k}`] = { from: num(prevPay[k]), to: v };
  }
  if (num(prev.total_expenses) !== totalExpenses) {
    changes.total_expenses = { from: num(prev.total_expenses), to: totalExpenses };
  }
  if (num(prev.surplus) !== surplus) changes.surplus = { from: num(prev.surplus), to: surplus };
  if (num(prev.shortage) !== shortage) changes.shortage = { from: num(prev.shortage), to: shortage };
  if (body.date && body.date !== prev.selected_date) {
    changes.selected_date = { from: num(prev.selected_date), to: num(body.date) };
  }

  if (Object.keys(changes).length === 0) {
    return Response.json({ success: true, unchanged: true });
  }

  const editEntry = {
    edited_at: new Date().toISOString(),
    edited_by: session.name,
    edited_by_id: String(session.id),
    reason: (body.edit_reason || '').trim() || null,
    changes,
  };

  const details = {
    ...prev,
    payments: nextPay,
    expenses: nextExpenses,
    surplus,
    shortage,
    difference: diff,
    total_sales: totalSales,
    total_expenses: totalExpenses,
    iiko_cash: totalSales - (surplus - shortage),
    comment: body.comment !== undefined ? String(body.comment || '') : (prev.comment as string) || '',
    selected_date: body.date || prev.selected_date,
    edit_history: [...(Array.isArray(prev.edit_history) ? prev.edit_history : []), editEntry],
  };

  await db.update(schema.botActions)
    .set({ details })
    .where(eq(schema.botActions.id, Number(params.id)));

  return Response.json({ success: true, details, changed: Object.keys(changes).length });
}
