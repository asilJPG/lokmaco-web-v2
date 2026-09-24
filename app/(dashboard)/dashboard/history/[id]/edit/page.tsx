import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { db, schema } from '@/db/client';
import { and, eq, inArray } from 'drizzle-orm';
import { fmtDate } from '@/lib/period';
import { baseRole } from '@/lib/access';
import ShiftEditForm from './form';

export const metadata = { title: 'Редактирование смены' };
export const dynamic = 'force-dynamic';

export default async function EditShiftPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/');
  if (baseRole(session.role) !== 'admin') redirect('/dashboard/history');

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) notFound();

  const [row] = await db
    .select()
    .from(schema.botActions)
    .where(and(
      eq(schema.botActions.id, Number(params.id)),
      eq(schema.botActions.actionType, 'cash'),
      inArray(schema.botActions.filialId, filialIds),
    ))
    .limit(1);

  if (!row) notFound();

  const d = (row.details || {}) as Record<string, unknown>;

  return (
    <div className="grid">
      <div>
        <Link href={`/dashboard/history/${params.id}`} className="btn btn--sm">← Назад к смене</Link>
        <h1 className="page-title" style={{ marginTop: 12 }}>
          Редактирование смены {fmtDate((d.selected_date as string) || '')}
        </h1>
        <p className="page-subtitle">Кассир: {row.userName}</p>
      </div>
      <ShiftEditForm shiftId={Number(params.id)} details={d} />
    </div>
  );
}
