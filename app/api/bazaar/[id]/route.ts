import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { db, schema } from '@/db/client';
import { and, eq, inArray } from 'drizzle-orm';
import { baseRole } from '@/lib/access';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  const role = baseRole(session.role);
  if (role !== 'admin') {
    return Response.json({ error: 'Только администратор может удалить отметку' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  const [row] = await db
    .select()
    .from(schema.botActions)
    .where(and(
      eq(schema.botActions.id, Number(params.id)),
      eq(schema.botActions.actionType, 'bazaar_balance'),
      inArray(schema.botActions.filialId, filialIds),
    ))
    .limit(1);

  if (!row) return Response.json({ error: 'Не найдено' }, { status: 404 });

  const prev = (row.details || {}) as Record<string, unknown>;
  await db.update(schema.botActions)
    .set({
      details: {
        ...prev,
        deleted_at: new Date().toISOString(),
        deleted_by: session.name,
      },
    })
    .where(eq(schema.botActions.id, row.id));

  return Response.json({ success: true });
}
