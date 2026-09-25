import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { resolveIikoCreds } from '@/lib/filial-iiko';
import { createWriteoff, WRITEOFF_ACCOUNT_ID } from '@/lib/iiko';
import { logAction } from '@/lib/log-action';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await requireSession();
  const [baseRole, userStoreId] = session.role.split(':');
  if (!['admin', 'bar', 'accountant'].includes(baseRole)) {
    return Response.json({ error: 'Доступ запрещен для вашей роли' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'no filial' }, { status: 400 });
  const filialId = filialIds[0];

  const b = await req.json();
  const items = Array.isArray(b.items) ? b.items : [];
  if (items.length === 0) return Response.json({ error: 'Не выбраны товары' }, { status: 400 });

  // Кассир/бар списывает только со своего склада — склад зашит в его роль.
  const storeId = userStoreId || b.store_id;
  if (!storeId) return Response.json({ error: 'Не указан склад для проведения акта' }, { status: 400 });

  // Счёт списания меняет админ и бухгалтер; всем остальным — пищевые потери.
  const accountId = ['admin', 'accountant'].includes(baseRole) && b.account_id ? b.account_id : WRITEOFF_ACCOUNT_ID;

  const comment = `${b.comment || 'Списание через сайт'} (Создал: ${session.name})`;
  const { xml: creds } = await resolveIikoCreds(filialId);
  const result = await createWriteoff(storeId, items, comment, accountId, creds);

  const details = {
    items, comment, store_id: storeId, store_name: b.store_name || '', account_id: accountId, account_name: b.account_name || '',
  };

  await logAction({
    filialId,
    tgId: session.tgId,
    userName: session.name,
    actionType: 'writeoff',
    documentNumber: result.success ? result.documentNumber || 'WRITEOFF' : 'СБОЙ',
    details: result.success ? details : { ...details, error: result.error },
  });

  if (!result.success) return Response.json({ error: result.error || 'iiko отклонил документ' }, { status: 502 });
  return Response.json({ success: true, documentNumber: result.documentNumber });
}
