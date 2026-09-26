import { and, desc, inArray, sql, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export type SafeAudit = {
  id: number;
  date: string;
  amount: number;
  comment: string | null;
  userName: string | null;
  createdAt: Date;
};

export async function listSafeAudits(filialIds: number[], from: string, to: string): Promise<SafeAudit[]> {
  if (filialIds.length === 0) return [];
  const dateExpr = sql<string>`coalesce(${schema.botActions.details}->>'selected_date', to_char(${schema.botActions.createdAt} at time zone 'Asia/Tashkent', 'YYYY-MM-DD'))`;

  const rows = await db
    .select({
      id: schema.botActions.id,
      date: dateExpr,
      amount: sql<string>`${schema.botActions.details}->>'amount'`,
      comment: sql<string>`${schema.botActions.details}->>'comment'`,
      userName: schema.botActions.userName,
      createdAt: schema.botActions.createdAt,
    })
    .from(schema.botActions)
    .where(
      and(
        inArray(schema.botActions.filialId, filialIds),
        eq(schema.botActions.actionType, 'safe_audit'),
        sql`${dateExpr} between ${from} and ${to}`
      )
    )
    .orderBy(desc(dateExpr), desc(schema.botActions.id));

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    amount: Number(r.amount) || 0,
    comment: r.comment || null,
    userName: r.userName,
    createdAt: r.createdAt,
  }));
}

export async function createSafeAudit(input: {
  filialId: number;
  date: string;
  amount: number;
  comment?: string;
  userId: number;
  userName: string;
  userTgId: number | null;
}) {
  const createdAt = new Date(`${input.date}T12:00:00+05:00`);
  const [row] = await db.insert(schema.botActions).values({
    filialId: input.filialId,
    tgId: input.userTgId,
    userName: input.userName,
    actionType: 'safe_audit',
    documentNumber: 'SAFE_AUDIT',
    createdAt,
    details: {
      amount: input.amount,
      selected_date: input.date,
      comment: (input.comment || '').trim(),
    },
  }).returning({ id: schema.botActions.id });
  return row;
}

export async function deleteSafeAudit(id: number, filialIds: number[]) {
  if (filialIds.length === 0) return 0;
  const res = await db.delete(schema.botActions).where(
    and(
      eq(schema.botActions.id, id),
      eq(schema.botActions.actionType, 'safe_audit'),
      inArray(schema.botActions.filialId, filialIds)
    )
  );
  return res.rowCount ?? 0;
}
