import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { resolveIikoCreds } from '@/lib/filial-iiko';
import { submitDocument } from '@/lib/iiko-web-docs';
import { logAction } from '@/lib/log-action';

export const dynamic = 'force-dynamic';

// Роли — дословно из легаси (app/api/iiko/production/route.js). Склад у акта
// приготовления берётся из роли, отдельной проверки store_id там нет.
const ALLOWED_ROLES = ['admin', 'prep_chef', 'bar', 'accountant'];

export async function POST(req: Request) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ запрещен для вашей роли' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'no filial' }, { status: 400 });
  const filialId = filialIds[0];

  const b = await req.json();
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return Response.json({ error: 'items required' }, { status: 400 });
  }

  const { web: creds } = await resolveIikoCreds(filialId);
  const result = await submitDocument({
    type: 'PRODUCTION_DOCUMENT',
    items: b.items,
    comment: b.comment || `Создал: ${session.name}`,
  }, creds);

  if (!result.success) return Response.json({ error: result.error || 'iiko failed' }, { status: 502 });

  await logAction({
    filialId,
    tgId: session.tgId,
    userName: session.name,
    actionType: 'production',
    documentNumber: result.documentNumber,
    details: { items: b.items, comment: b.comment || '' },
  });

  return Response.json({ success: true, documentNumber: result.documentNumber });
}
