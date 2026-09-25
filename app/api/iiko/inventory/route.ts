import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { resolveIikoCreds } from '@/lib/filial-iiko';
import { submitDocument } from '@/lib/iiko-web-docs';
import { logAction } from '@/lib/log-action';

export const dynamic = 'force-dynamic';

// Роли и ограничение по складу — дословно из легаси
// (app/api/iiko/inventory/route.js).
const ALLOWED_ROLES = ['admin', 'director', 'kitchen', 'prep_chef', 'bar', 'supplier', 'accountant'];

export async function POST(req: Request) {
  const session = await requireSession();
  const [baseRole, userStoreId] = session.role.split(':');
  const canManageAll = baseRole === 'admin' || baseRole === 'director' || baseRole === 'accountant';
  if (!ALLOWED_ROLES.includes(baseRole)) {
    return Response.json({ error: 'Доступ запрещен для вашей роли' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'no filial' }, { status: 400 });
  const filialId = filialIds[0];

  const b = await req.json();
  if (!b.store_id || !Array.isArray(b.items) || b.items.length === 0) {
    return Response.json({ error: 'store_id, items required' }, { status: 400 });
  }
  if (!canManageAll && userStoreId && b.store_id !== userStoreId) {
    return Response.json({ error: 'Вы можете проводить инвентаризацию только на своем складе' }, { status: 403 });
  }

  const { web: creds } = await resolveIikoCreds(filialId);
  const result = await submitDocument({
    type: 'INVENTORY',
    storeId: b.store_id,
    items: b.items,
    comment: b.comment || `Создал: ${session.name}`,
  }, creds);

  if (!result.success) return Response.json({ error: result.error || 'iiko failed' }, { status: 502 });

  await logAction({
    filialId,
    tgId: session.tgId,
    userName: session.name,
    actionType: 'inventory',
    documentNumber: result.documentNumber,
    details: {
      store_id: b.store_id,
      store_name: b.store_name,
      items: b.items,
      comment: b.comment || '',
    },
  });

  return Response.json({ success: true, documentNumber: result.documentNumber });
}
