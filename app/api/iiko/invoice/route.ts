import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { resolveIikoCreds } from '@/lib/filial-iiko';
import { submitDocument } from '@/lib/iiko-web-docs';
import { logAction } from '@/lib/log-action';
import { sendInvoicePhotos } from '@/lib/purchases-digest';
import { PHOTO_KINDS, type PhotoKind } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// Список ролей и ограничение по складу — дословно из легаси
// (app/api/iiko/invoice/route.js): роут пишет документ в iiko, и без проверки
// приход мог оформить любой залогиненный.
const ALLOWED_ROLES = ['admin', 'director', 'supplier', 'accountant'];

export async function POST(req: Request) {
  const session = await requireSession();
  const [baseRole, userStoreId] = session.role.split(':');
  if (!ALLOWED_ROLES.includes(baseRole)) {
    return Response.json({ error: 'Доступ запрещен для вашей роли' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'no filial' }, { status: 400 });
  const filialId = filialIds[0];

  const b = await req.json();
  if (!b.supplier_id || !b.store_id || !Array.isArray(b.items) || b.items.length === 0) {
    return Response.json({ error: 'supplier_id, store_id, items required' }, { status: 400 });
  }
  if (userStoreId && b.store_id !== userStoreId) {
    return Response.json({ error: 'Вы можете оформлять приходы только на свой склад' }, { status: 403 });
  }

  // Фото приходят уже загруженными (см. /api/uploads) — сюда попадают только
  // пути в хранилище. Проверяем форму, чтобы в историю не уехал произвольный
  // текст из тела запроса.
  const photos = (Array.isArray(b.photos) ? b.photos : [])
    .filter((p: unknown): p is { path: string; kind: PhotoKind; product_id?: string; product_name?: string } =>
      !!p && typeof p === 'object'
      && typeof (p as { path?: unknown }).path === 'string'
      && PHOTO_KINDS.includes((p as { kind?: PhotoKind }).kind as PhotoKind))
    .slice(0, 60)
    .map((p: { path: string; kind: PhotoKind; product_id?: string; product_name?: string }) => ({
      path: p.path,
      kind: p.kind,
      ...(p.kind === 'item'
        ? { product_id: String(p.product_id || ''), product_name: String(p.product_name || '') }
        : {}),
    }));

  // ⚠️ Снимок накладной обязателен — проверяем ДО отправки в iiko. Приход без
  // бумаги потом ничем не подтвердить, а отменить уже проведённый документ
  // куда дороже, чем не дать его создать.
  if (!photos.some((p: { kind: PhotoKind }) => p.kind === 'invoice')) {
    return Response.json({ error: 'Приложите фотографию накладной поставщика' }, { status: 400 });
  }

  const { web: creds } = await resolveIikoCreds(filialId);
  const result = await submitDocument({
    type: 'INCOMING_INVOICE',
    supplier: b.supplier_id,
    storeId: b.store_id,
    items: b.items,
    comment: b.comment || `Создал: ${session.name}`,
  }, creds);

  if (!result.success) return Response.json({ error: result.error || 'iiko failed' }, { status: 502 });

  // Чего не хватило — считаем и записываем в момент проведения, а не выводим
  // потом на лету: состав позиций может измениться, а отметка «фото не было»
  // должна остаться такой, какой была.
  const withPhoto = new Set(
    photos.filter((p: { kind: PhotoKind; product_id?: string }) => p.kind === 'item' && p.product_id)
      .map((p: { product_id?: string }) => p.product_id)
  );
  const itemsWithoutPhoto = (b.items as { product_id?: string; product_name?: string }[])
    .filter((it) => !withPhoto.has(String(it.product_id || '')))
    .map((it) => it.product_name || 'Товар');

  const details = {
    supplier_id: b.supplier_id,
    supplier_name: b.supplier_name,
    store_id: b.store_id,
    store_name: b.store_name,
    items: b.items,
    comment: b.comment || '',
    photos,
    has_invoice_photo: true,
    items_without_photo: itemsWithoutPhoto,
    photos_complete: itemsWithoutPhoto.length === 0,
  };

  const actionId = await logAction({
    filialId,
    tgId: session.tgId,
    userName: session.name,
    actionType: 'invoice',
    documentNumber: result.documentNumber,
    details,
  });

  // Фотоотчёт уходит сразу: смысл снимков в том, чтобы их увидели, пока машина
  // ещё у входа. Не получилось — не беда и точно не повод отдавать ошибку:
  // документ уже в iiko, а вечерняя сводка заберёт этот приход (она смотрит на
  // ту же отметку `tg_sent_at`, которую ставит удачная отправка).
  let tgSent = false;
  if (actionId !== null) {
    try {
      tgSent = await sendInvoicePhotos({
        id: actionId,
        userName: session.name,
        documentNumber: result.documentNumber ?? null,
        createdAt: new Date(),
        details,
      });
    } catch (e) {
      console.error('[invoice] фотоотчёт не ушёл в Telegram', result.documentNumber, e);
    }
  }

  return Response.json({ success: true, documentNumber: result.documentNumber, tg_sent: tgSent });
}
