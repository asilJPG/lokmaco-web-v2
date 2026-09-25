import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { resolveIikoCreds } from '@/lib/filial-iiko';
import { submitServiceAct } from '@/lib/iiko-web-docs';
import { logAction } from '@/lib/log-action';

export const dynamic = 'force-dynamic';

// Услуга проводится настоящим «Актом приема услуг» (INCOMING_SERVICE), а не
// приходной накладной, как раньше. Настоящий акт несёт счёт затрат сам
// (revenueAccount + account в строке), поэтому в комментарий его больше не
// дублируем. Товар-услуга выбирается пользователем из номенклатуры типа
// SERVICE; «Транспорт расходы» остался дефолтом для обратной совместимости.
const SUPPLIER_DEFAULT = 'f94a2411-4e2a-4d0a-a3c5-f5a4d4e0042d'; // Представительские
const SERVICE_PRODUCT = '69aab99f-deeb-4bf1-804b-0b13373910a0'; // Транспорт расходы

export async function POST(req: Request) {
  const session = await requireSession();
  const [baseRole, userStoreId] = session.role.split(':');
  const canManageAll = baseRole === 'admin' || baseRole === 'director' || baseRole === 'accountant';
  if (!['admin', 'director', 'supplier', 'accountant'].includes(baseRole)) {
    return Response.json({ error: 'Доступ запрещен для вашей роли' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'no filial' }, { status: 400 });
  const filialId = filialIds[0];

  const b = await req.json();
  const storeId: string = b.store_id || userStoreId || '';
  if (!canManageAll && userStoreId && storeId !== userStoreId) {
    return Response.json({ error: 'Вы можете оформлять акты только на свой склад' }, { status: 403 });
  }
  if (!storeId || !b.account_id || !b.sum) {
    return Response.json({ error: 'Не все обязательные поля заполнены' }, { status: 400 });
  }
  const sum = parseFloat(b.sum) || 0;
  if (sum <= 0) return Response.json({ error: 'Сумма услуги должна быть больше нуля' }, { status: 400 });

  // Роль «поставщик» всегда пишется на «Представительские», выбор ей недоступен.
  const supplierId = baseRole === 'supplier' ? SUPPLIER_DEFAULT : (b.supplier_id || SUPPLIER_DEFAULT);
  const supplierName = baseRole === 'supplier' ? 'Представительские' : (b.supplier_name || 'Представительские');

  const productId: string = b.product_id || SERVICE_PRODUCT;
  const comment = `${b.comment || ''} (Создал: ${session.name}) (Сгенерировано через сайт)`.trim();

  const { web: creds } = await resolveIikoCreds(filialId);
  const result = await submitServiceAct({
    supplier: supplierId,
    accountId: b.account_id,
    productId,
    productName: b.product_name || '',
    sum,
    comment,
  }, creds);

  const details = {
    supplier_id: supplierId, supplier_name: supplierName,
    store_id: storeId, store_name: b.store_name || '',
    account_id: b.account_id, account_name: b.account_name || '',
    product_id: productId, product_name: b.product_name || '',
    sum, comment,
  };

  await logAction({
    filialId,
    tgId: session.tgId,
    userName: session.name,
    actionType: 'services',
    documentNumber: result.success ? (result.documentNumber || 'Автоматический') : 'СБОЙ',
    details,
  });

  if (!result.success) {
    return Response.json({ error: result.error || 'iiko отклонил документ' }, { status: 502 });
  }
  return Response.json({ success: true, documentNumber: result.documentNumber });
}
