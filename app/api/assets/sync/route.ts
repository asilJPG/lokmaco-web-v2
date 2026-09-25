import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { resolveIikoCreds } from '@/lib/filial-iiko';
import { withIikoSession, iikoGet, type IikoCreds } from '@/lib/iiko';
import { baseInvNumber } from '@/lib/inv-number';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EQUIPMENT_GROUP = 'caa82432-fe8b-4eb0-988b-c0bffd04fc6b';

type IikoGroup = { id: string; name?: string };
type IikoProduct = { id: string; name: string; code?: string; num?: string; parent?: string; category?: string; deleted?: boolean; estimatedPurchasePrice?: number };
type Purchase = { date: string | null; price: number; sum: number; amount: number };

export async function POST() {
  const session = await requireSession();
  if (!['admin', 'manager', 'accountant'].includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'no filial' }, { status: 400 });

  const { xml: creds } = await resolveIikoCreds(filialIds[0]);
  const equipment = await withIikoSession(async (token) => collectEquipment(token, creds), creds);

  if ('error' in equipment) return Response.json({ error: equipment.error }, { status: 502 });

  // ⚠️ Сверка ищет и добавляет **только по текущему филиалу**: чужие
  // фергантские EQ-номера не должны заводить дубликаты у Самарканда, и
  // наоборот. iiko-креды у нас тоже per-filial (resolveIikoCreds выше).
  const existing = await db.select().from(schema.assets)
    .where(eq(schema.assets.filialId, filialIds[0]));
  const byInv = new Map(existing.filter((a) => a.invNumber).map((a) => [a.invNumber, a]));
  const bySerial = new Map(existing.filter((a) => a.serialNumber).map((a) => [a.serialNumber as string, a]));
  // ⚠️ Разбитая партия лежит как EQ-00745-01…04, а из iiko приходит EQ-00745 —
  // по полному номеру она не находится, и сверка каждый раз заводила бы
  // позицию заново. Поэтому ищем ещё и по базовому номеру.
  const byBase = new Map<string, typeof existing[number]>();
  for (const a of existing) {
    const base = baseInvNumber(a.invNumber);
    if (base && !byBase.has(base)) byBase.set(base, a);
  }

  let added = 0;
  let updated = 0;

  for (const p of equipment.products) {
    const purchases = (equipment.purchases[p.id] || []).slice()
      .sort((a, b) => (b.date || '1970-01-01').localeCompare(a.date || '1970-01-01'));
    const last = purchases[0];

    const invNumber = p.num ? `EQ-${p.num.padStart(4, '0')}` : p.code ? `EQ-${p.code}` : `EQ-${p.id.slice(0, 6).toUpperCase()}`;
    const initialCost = last?.price || last?.sum || p.estimatedPurchasePrice || 0;
    const commissioningDate = last?.date || new Date().toISOString().split('T')[0];

    // В таблице нет колонки под iiko-id, поэтому сверяемся по инвентарному
    // номеру (он детерминирован) и по коду iiko, который лежит в serial_number.
    const found = byInv.get(invNumber) || byBase.get(invNumber) || (p.code ? bySerial.get(p.code) : undefined);

    if (found) {
      const patch: Partial<typeof schema.assets.$inferInsert> = {};
      if ((!found.initialCost || Number(found.initialCost) === 0) && initialCost > 0) patch.initialCost = String(initialCost);
      if (!found.commissioningDate && commissioningDate) patch.commissioningDate = commissioningDate;
      if (Object.keys(patch).length > 0) {
        await db.update(schema.assets).set({ ...patch, updatedAt: new Date() }).where(eq(schema.assets.id, found.id));
        updated++;
      }
    } else {
      await db.insert(schema.assets).values({
        filialId: filialIds[0],
        invNumber,
        name: p.name,
        category: 'Оборудование',
        location: 'Кухня / Ресторан',
        responsiblePerson: 'Материально-ответственное лицо',
        quantity: last?.amount || 1,
        initialCost: String(initialCost),
        commissioningDate,
        status: 'in_use',
        serialNumber: p.code || '',
        notes: `Импортировано из iiko (ID: ${p.id}${p.code ? ', Код: ' + p.code : ''})`,
      });
      added++;
    }
  }

  await db.insert(schema.botActions).values({
    filialId: filialIds[0], tgId: session.tgId, userName: session.name,
    actionType: 'assets_sync_iiko', documentNumber: 'iiko', details: { added, updated, found: equipment.products.length },
  });

  return Response.json({
    success: true,
    message: `Синхронизировано из iiko: создано ${added} шт, обновлено ${updated} шт.`,
    data: { totalFound: equipment.products.length, added, updated },
  });
}

async function collectEquipment(token: string, creds: IikoCreds): Promise<{ products: IikoProduct[]; purchases: Record<string, Purchase[]> } | { error: string }> {
  const groups = await iikoGet<IikoGroup[]>('v2/entities/products/group/list', token, creds);
  const equipGroups = new Set<string>([EQUIPMENT_GROUP]);
  for (const g of groups || []) {
    const n = (g.name || '').toLowerCase();
    if (n.includes('оборудование') || n.includes('инвентарь')) equipGroups.add(g.id);
  }

  const products = await iikoGet<IikoProduct[]>('v2/entities/products/list?includeDeleted=false', token, creds);
  if (!Array.isArray(products)) return { error: 'Не удалось получить список товаров из iiko' };

  const equipment = products.filter((p) =>
    !p.deleted && (equipGroups.has(p.parent || '') || equipGroups.has(p.category || '') || (p.name || '').toLowerCase().includes('оборудовани'))
  );

  // Цену и дату ввода в эксплуатацию берём из приходных накладных за 3 года.
  const year = new Date().getFullYear();
  const res = await fetch(`${creds.server}/resto/api/documents/export/incomingInvoice?key=${token}&from=${year - 2}-01-01&to=${year}-12-31`, {
    headers: { Accept: 'application/xml' },
  });
  const xml = res.ok ? await res.text() : '';

  const purchases: Record<string, Purchase[]> = {};
  const docRe = /<document>([\s\S]*?)<\/document>/g;
  let doc: RegExpExecArray | null;
  while ((doc = docRe.exec(xml)) !== null) {
    const dateMatch = doc[1].match(/<dateIncoming>(.*?)<\/dateIncoming>/) || doc[1].match(/<date>(.*?)<\/date>/);
    const date = dateMatch ? dateMatch[1].split('T')[0] : null;
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let item: RegExpExecArray | null;
    while ((item = itemRe.exec(doc[1])) !== null) {
      const prod = item[1].match(/<product>(.*?)<\/product>/);
      if (!prod) continue;
      const price = parseFloat(item[1].match(/<price>(.*?)<\/price>/)?.[1] || '0');
      const sum = parseFloat(item[1].match(/<sum>(.*?)<\/sum>/)?.[1] || '0');
      const amount = parseFloat(item[1].match(/<amount>(.*?)<\/amount>/)?.[1] || '1');
      (purchases[prod[1]] ||= []).push({ date, price: price || (amount > 0 ? sum / amount : sum), sum, amount });
    }
  }

  return { products: equipment, purchases };
}
