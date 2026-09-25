import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds, getUserFilialIds } from '@/lib/current-filial';
import { resolveIikoCreds } from '@/lib/filial-iiko';
import { submitDocument } from '@/lib/iiko-web-docs';
import { logAction as logBotAction } from '@/lib/log-action';
import {
  claimPendingTransfer,
  createPendingTransfer,
  getPendingTransferById,
  listPendingTransfers,
  releasePendingTransfer,
  updatePendingTransfer,
  type TransferItem,
} from '@/lib/pending-transfer';

const logAction = (input: {
  filialId: number; tgId: number | null; userName: string;
  documentNumber?: string | null; details: Record<string, unknown>;
}) => logBotAction({ ...input, actionType: 'transfer' });

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireSession();
  const filialIds = await getCurrentFilialIds();
  const list = await listPendingTransfers(filialIds);

  const [baseRole, storeId] = session.role.split(':');
  const canSeeAll = baseRole === 'admin' || baseRole === 'accountant';
  const tgId = String(session.tgId ?? '');

  const incoming = list.filter((it) =>
    (it.status === 'pending_receiver' || it.status === 'pending_sender') &&
    (canSeeAll ||
      (it.status === 'pending_receiver' && String(it.storeTo) === String(storeId)) ||
      (it.status === 'pending_sender' && String(it.storeFrom) === String(storeId)))
  );
  const returned = list.filter((it) => it.status === 'pending_creator' && (canSeeAll || String(it.creatorTgId) === tgId));
  const outgoing = list.filter(
    (it) => (it.status === 'pending_receiver' || it.status === 'pending_sender') &&
      String(it.creatorTgId) === tgId &&
      !incoming.some((i) => i.id === it.id)
  );

  return Response.json({ incoming, returned, outgoing });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Пакетный приём: обрабатываем по одному и тем же путём, что и одиночный,
    // — каждый документ так же атомарно занимается перед отправкой в iiko.
    // Последовательно, а не Promise.all: параллельные POST-ы в iikoWeb на одной
    // сессии — верный способ получить гонку на создании документов.
    if (Array.isArray(body?.ids)) {
      const results: { id: string; ok: boolean; documentNumber?: string; error?: string }[] = [];
      for (const rawId of body.ids) {
        const id = String(rawId);
        try {
          // Тело собираем заново, а не копируем: `items` из общего запроса
          // применились бы ко всем документам разом. Пакетно принимаем только
          // «как есть», правка количеств — по одному.
          const res = await handlePost(req, { action: body.action, id, comment: body.comment });
          const data = await res.json().catch(() => ({}));
          results.push(res.ok
            ? { id, ok: true, documentNumber: data?.documentNumber }
            : { id, ok: false, error: data?.error || `Ошибка ${res.status}` });
        } catch (e) {
          results.push({ id, ok: false, error: e instanceof Error ? e.message : 'server error' });
        }
      }
      return Response.json({ results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
    }
    return await handlePost(req, body);
  } catch (e) {
    console.error('[pending-transfer POST]', e);
    return Response.json({ error: e instanceof Error ? e.message : 'server error' }, { status: 500 });
  }
}

const ALLOWED_ROLES = ['admin', 'director', 'supplier', 'kitchen', 'prep_chef', 'bar', 'hall', 'accountant'];

async function handlePost(req: Request, b: any) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ запрещен для вашей роли' }, { status: 403 });
  }
  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'no filial' }, { status: 400 });
  const filialId = filialIds[0];

  const action: string | undefined = b.action;
  const [baseRole, userStoreId] = session.role.split(':');
  const canManageAll = baseRole === 'admin' || baseRole === 'accountant';

  if (!action) {
    if (!b.store_from || !b.store_to || !Array.isArray(b.items) || b.items.length === 0) {
      return Response.json({ error: 'store_from, store_to, items required' }, { status: 400 });
    }
    if (!canManageAll && userStoreId && b.store_from !== userStoreId && b.store_to !== userStoreId) {
      return Response.json({ error: 'Только со своего/на свой склад' }, { status: 403 });
    }
    let status = 'pending_receiver';
    if (!canManageAll && userStoreId) {
      if (String(b.store_to) === String(userStoreId)) status = 'pending_sender';
      else if (String(b.store_from) === String(userStoreId)) status = 'pending_receiver';
    }
    const items: TransferItem[] = b.items.map((it: any) => ({
      product_id: String(it.product_id),
      product_name: String(it.product_name || ''),
      quantity: Number(it.quantity) || 0,
      unit: String(it.unit || 'шт'),
      received_quantity: null,
    }));
    const inserted = await createPendingTransfer({
      filialId,
      creatorTgId: session.tgId ? String(session.tgId) : null,
      creatorName: session.name,
      creatorRole: session.role,
      storeFrom: String(b.store_from),
      storeFromName: String(b.store_from_name || ''),
      storeTo: String(b.store_to),
      storeToName: String(b.store_to_name || ''),
      items,
      comment: String(b.comment || ''),
      status,
    });
    return Response.json({ success: true, id: inserted.id });
  }

  const id = String(b.id || '');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  const doc = await getPendingTransferById(id);
  if (!doc) return Response.json({ error: 'not found' }, { status: 404 });
  if (!canManageAll && !(await getUserFilialIds()).includes(doc.filialId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (['approve_by_receiver', 'reject_by_receiver', 'modify_by_receiver'].includes(action)) {
    if (doc.status === 'pending_receiver') {
      if (!canManageAll && String(doc.storeTo) !== String(userStoreId)) return Response.json({ error: 'Не получатель' }, { status: 403 });
    } else if (doc.status === 'pending_sender') {
      if (!canManageAll && String(doc.storeFrom) !== String(userStoreId)) return Response.json({ error: 'Не отправитель' }, { status: 403 });
    } else {
      return Response.json({ error: 'Неверный статус' }, { status: 400 });
    }
  }
  if (['approve_by_creator', 'reject_by_creator'].includes(action)) {
    // Статус проверяем до отправки в iiko: без этого повторный запрос по уже
    // принятому перемещению создал бы в iiko второй такой же документ.
    if (doc.status !== 'pending_creator') {
      return Response.json({ error: 'Неверный статус' }, { status: 400 });
    }
    if (!canManageAll && String(doc.creatorTgId) !== String(session.tgId)) return Response.json({ error: 'Не создатель' }, { status: 403 });
  }

  const items: TransferItem[] = Array.isArray(b.items) ? b.items : doc.items;
  const receiverComment: string | undefined = b.receiver_comment;

  if (action === 'approve_by_receiver') {
    if (!(await claimPendingTransfer(id, doc.status))) {
      return Response.json({ error: 'Документ уже обработан' }, { status: 409 });
    }
    const { web: creds } = await resolveIikoCreds(doc.filialId);
    const finalComment = `Принял: ${session.name}${b.comment ? ` | ${b.comment}` : ''}`;
    let result;
    try {
      result = await submitDocument({
        type: 'INTERNAL_TRANSFER',
        storeFrom: doc.storeFrom!,
        storeTo: doc.storeTo!,
        items: items.map((it) => ({ product_id: it.product_id, product_name: it.product_name, quantity: it.quantity })),
        comment: finalComment,
      }, creds);
    } catch (e) {
      await releasePendingTransfer(id, doc.status);
      throw e;
    }
    if (!result.success) {
      await releasePendingTransfer(id, doc.status);
      return Response.json({ error: result.error || 'iiko failed' }, { status: 502 });
    }
    await updatePendingTransfer(id, 'accepted');
    await logAction({
      filialId: doc.filialId, tgId: session.tgId, userName: session.name,
      documentNumber: result.documentNumber,
      details: { store_from_name: doc.storeFromName, store_to_name: doc.storeToName, items, comment: finalComment },
    });
    return Response.json({ success: true, documentNumber: result.documentNumber });
  }

  if (action === 'reject_by_receiver') {
    await updatePendingTransfer(id, 'rejected', { receiverComment: receiverComment || '' });
    return Response.json({ success: true });
  }

  if (action === 'modify_by_receiver') {
    await updatePendingTransfer(id, 'pending_creator', { items, receiverComment: receiverComment || '' });
    return Response.json({ success: true });
  }

  if (action === 'approve_by_creator') {
    if (!(await claimPendingTransfer(id, doc.status))) {
      return Response.json({ error: 'Документ уже обработан' }, { status: 409 });
    }
    const { web: creds } = await resolveIikoCreds(doc.filialId);
    const prepared = items
      .map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: it.received_quantity != null ? Number(it.received_quantity) : Number(it.quantity),
      }))
      .filter((it) => it.quantity > 0);
    const finalComment = `Принял: ${session.name}${doc.receiverComment ? ` | ${doc.receiverComment}` : ''}`;
    let result;
    try {
      result = await submitDocument({
        type: 'INTERNAL_TRANSFER',
        storeFrom: doc.storeFrom!,
        storeTo: doc.storeTo!,
        items: prepared,
        comment: finalComment,
      }, creds);
    } catch (e) {
      await releasePendingTransfer(id, doc.status);
      throw e;
    }
    if (!result.success) {
      await releasePendingTransfer(id, doc.status);
      return Response.json({ error: result.error || 'iiko failed' }, { status: 502 });
    }
    await updatePendingTransfer(id, 'accepted');
    await logAction({
      filialId: doc.filialId, tgId: session.tgId, userName: session.name,
      documentNumber: result.documentNumber,
      details: { store_from_name: doc.storeFromName, store_to_name: doc.storeToName, items: prepared, comment: finalComment, receiver_comment: doc.receiverComment },
    });
    return Response.json({ success: true, documentNumber: result.documentNumber });
  }

  if (action === 'reject_by_creator') {
    await updatePendingTransfer(id, 'rejected');
    return Response.json({ success: true });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}
