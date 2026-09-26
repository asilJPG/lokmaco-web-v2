import { requireSession } from '@/lib/auth-session';
import { createSafeAudit, deleteSafeAudit } from '@/lib/safe-audit';
import { getUserFilialIds } from '@/lib/current-filial';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await requireSession();
  if (!['admin', 'director'].includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json();
  const allowed = await getUserFilialIds();
  const filialId = Number(body.filialId ?? allowed[0]);
  if (!filialId || !allowed.includes(filialId)) {
    return Response.json({ error: 'Filial access denied' }, { status: 403 });
  }
  if (!body.date || body.amount === undefined || body.amount === null) {
    return Response.json({ error: 'date and amount required' }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: 'amount must be > 0' }, { status: 400 });
  }
  const result = await createSafeAudit({
    filialId,
    date: String(body.date),
    amount,
    comment: body.comment ? String(body.comment) : '',
    userId: session.id,
    userName: session.name,
    userTgId: session.tgId,
  });
  return Response.json({ success: true, ...result });
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (!['admin', 'director'].includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  const deleted = await deleteSafeAudit(id, await getUserFilialIds());
  return Response.json({ success: deleted > 0 });
}
