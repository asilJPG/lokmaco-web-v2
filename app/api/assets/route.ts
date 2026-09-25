import { and, eq, desc, inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { baseInvNumber, unitSuffix } from '@/lib/inv-number';

export const dynamic = 'force-dynamic';

const CAN_EDIT = ['admin', 'manager', 'accountant'];

async function logAssetAction(actionType: string, documentNumber: string, details: Record<string, unknown>, session: { tgId: number | null; name: string }) {
  const ids = await getCurrentFilialIds();
  if (ids.length === 0) return;
  await db.insert(schema.botActions).values({
    filialId: ids[0], tgId: session.tgId, userName: session.name, actionType, documentNumber, details,
  });
}

export async function GET(req: Request) {
  const session = await requireSession();
  if (!CAN_EDIT.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const location = sp.get('location');
  const status = sp.get('status');
  const search = (sp.get('search') || '').toLowerCase().trim();

  // ⚠️ Каждая ветка — от текущего филиала. У легаси одна Fergana, у v2 два, и
  // Самарканд не должен видеть фергантские наклейки, места и оборудование.
  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ data: [], tags: [], locations: [] });

  let rows = await db.select().from(schema.assets)
    .where(inArray(schema.assets.filialId, filialIds))
    .orderBy(desc(schema.assets.createdAt));

  if (location && location !== 'all') rows = rows.filter((a) => a.location === location);
  if (status && status !== 'all') rows = rows.filter((a) => a.status === status);
  if (search) {
    rows = rows.filter((a) =>
      (a.name || '').toLowerCase().includes(search) ||
      (a.invNumber || '').toLowerCase().includes(search) ||
      (a.responsiblePerson || '').toLowerCase().includes(search) ||
      (a.serialNumber || '').toLowerCase().includes(search)
    );
  }

  // Наклейки и места отдаём вместе со списком: сканеру нужен разбор кода
  // наклейки в карточку, а грузить их отдельным запросом с телефона — лишний
  // круг ожидания перед обходом.
  const [tags, locations] = await Promise.all([
    db.select().from(schema.assetTags).where(inArray(schema.assetTags.filialId, filialIds)),
    db.select().from(schema.assetLocations)
      .where(inArray(schema.assetLocations.filialId, filialIds))
      .orderBy(schema.assetLocations.sortOrder, schema.assetLocations.name),
  ]);

  return Response.json({ data: rows, tags, locations });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!CAN_EDIT.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const b = await req.json();
  if (!b.name || !b.location || !b.responsible_person) {
    return Response.json({ error: 'Укажите наименование, место эксплуатации и МОЛ' }, { status: 400 });
  }

  // Инвентарный номер можно не вводить — соберём сами.
  //
  // ⚠️ Два сегмента, а не три. Прежний `INV-<место>-<число>` давал `INV-1-5375`
  // и `INV-INV-2147` (место кириллицей срезалось в пустоту), а трёхсегментный
  // номер читается как «экземпляр партии»: разные предметы слипались в одну
  // строку списка. Место в номере всё равно бесполезно — оно меняется, а номер
  // остаётся.
  let invNumber = String(b.inv_number || '').trim();
  if (!invNumber) {
    invNumber = `INV-${Math.floor(10000 + Math.random() * 90000)}`;
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });

  const [created] = await db.insert(schema.assets).values({
    filialId: filialIds[0],
    invNumber,
    name: String(b.name).trim(),
    category: b.category || 'Оборудование',
    location: String(b.location).trim(),
    responsiblePerson: String(b.responsible_person).trim(),
    quantity: parseInt(b.quantity) || 1,
    initialCost: String(parseFloat(b.initial_cost) || 0),
    commissioningDate: b.commissioning_date || new Date().toISOString().split('T')[0],
    status: b.status || 'in_use',
    serialNumber: b.serial_number ? String(b.serial_number).trim() : '',
    notes: b.notes ? String(b.notes).trim() : '',
    photoUrl: b.photo_url || '',
    locationId: b.location_id || null,
    // ⚠️ Заведённого руками в справочнике iiko нет по определению — без этого
    // признака сверка уводила бы такую карточку в архив на первом же проходе.
    source: 'manual',
  }).returning();

  await logAssetAction('asset_create', created.invNumber, { name: created.name, location: created.location, responsible_person: created.responsiblePerson }, session);
  return Response.json({ success: true, data: created });
}

export async function PUT(req: Request) {
  const session = await requireSession();
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'Missing asset id' }, { status: 400 });

  // Отметка «нашли при инвентаризации» доступна любой залогиненной роли:
  // обходят склад и сканируют стикеры не только админы.
  //
  // Отмечаем всю пачку одним запросом. Обход зала — это сотня-другая позиций;
  // запрос на каждую превращал сохранение в минуту ожидания на телефоне, и
  // любой обрыв связи посреди списка оставлял инвентаризацию наполовину
  // сохранённой.
  /**
   * Массовая правка стоимости партии.
   *
   * Асиль просил (12.09.2026): «одинаковых сорок штук, вбиваю одну сумму — она
   * встаёт каждому; исключение правлю после отдельно». Именно так — простая
   * перезапись всех. Роль проверяем ту же, что и обычную правку карточки, —
   * это редактирование, а не сверка.
   */
  if (b.action === 'set_cost') {
    if (!CAN_EDIT.includes(session.role.split(':')[0])) {
      return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
    }
    const ids: string[] = Array.isArray(b.ids) ? b.ids.map(String).filter(Boolean) : [];
    if (ids.length === 0) return Response.json({ error: 'Нет позиций для правки' }, { status: 400 });
    // Нельзя править чужой филиал даже прицельно по id: id клиентский.
    const fIds = await getCurrentFilialIds();
    if (fIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });
    const cost = Number(b.cost);
    if (!Number.isFinite(cost) || cost < 0) return Response.json({ error: 'Стоимость должна быть числом ≥ 0' }, { status: 400 });

    const now = new Date();
    await db.update(schema.assets)
      .set({ initialCost: String(cost), updatedAt: now })
      .where(and(inArray(schema.assets.id, ids), inArray(schema.assets.filialId, fIds)));
    await logAssetAction('asset_batch_cost', String(ids.length), { ids, cost }, session);
    return Response.json({ success: true, updated: ids.length });
  }

  if (b.action === 'audit') {
    const ids: string[] = Array.isArray(b.ids) ? b.ids.map(String).filter(Boolean) : (b.id ? [String(b.id)] : []);
    if (ids.length === 0) return Response.json({ error: 'Нечего отмечать' }, { status: 400 });
    const fIds2 = await getCurrentFilialIds();
    if (fIds2.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });

    const now = new Date();
    await db.update(schema.assets)
      .set({ lastInventoriedAt: now, updatedAt: now })
      .where(and(inArray(schema.assets.id, ids), inArray(schema.assets.filialId, fIds2)));
    await logAssetAction('asset_audit', String(ids.length), { action: 'inventory_audit', ids }, session);
    return Response.json({ success: true, marked: ids.length });
  }

  if (!CAN_EDIT.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const patch: Partial<typeof schema.assets.$inferInsert> = { updatedAt: new Date() };
  if (b.inv_number !== undefined) patch.invNumber = String(b.inv_number).trim();
  if (b.name !== undefined) patch.name = String(b.name).trim();
  if (b.category !== undefined) patch.category = b.category;
  if (b.location !== undefined) patch.location = String(b.location).trim();
  if (b.responsible_person !== undefined) patch.responsiblePerson = String(b.responsible_person).trim();
  if (b.quantity !== undefined) patch.quantity = parseInt(b.quantity) || 1;
  if (b.initial_cost !== undefined) patch.initialCost = String(parseFloat(b.initial_cost) || 0);
  if (b.commissioning_date !== undefined) patch.commissioningDate = b.commissioning_date || null;
  if (b.status !== undefined) patch.status = b.status;
  if (b.serial_number !== undefined) patch.serialNumber = String(b.serial_number || '').trim();
  if (b.notes !== undefined) patch.notes = String(b.notes || '').trim();
  if (b.photo_url !== undefined) patch.photoUrl = b.photo_url || '';
  if (b.location_id !== undefined) patch.locationId = b.location_id || null;

  const fIds3 = await getCurrentFilialIds();
  if (fIds3.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });
  await db.update(schema.assets).set(patch)
    .where(and(eq(schema.assets.id, b.id), inArray(schema.assets.filialId, fIds3)));
  await logAssetAction('asset_update', String(b.id), patch as Record<string, unknown>, session);
  return Response.json({ success: true });
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (!CAN_EDIT.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'Missing asset id' }, { status: 400 });

  const fIds = await getCurrentFilialIds();
  if (fIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });
  const [gone] = await db.select().from(schema.assets)
    .where(and(eq(schema.assets.id, id), inArray(schema.assets.filialId, fIds)));
  if (!gone) return Response.json({ error: 'Позиция не найдена в этом филиале' }, { status: 404 });
  await db.delete(schema.assets).where(eq(schema.assets.id, id));
  await logAssetAction('asset_delete', id, { status: 'deleted', inv_number: gone?.invNumber }, session);

  // Удалили лишний экземпляр партии — его стоимость возвращается остальным.
  // Иначе разбивка на шесть с последующим удалением шестого тихо уменьшала бы
  // стоимость ОС на балансе: сумма по карточкам обязана сходиться с исходной,
  // ровно как при разбивке и дописывании.
  const spread = gone ? await spreadCostOverBatch(gone) : null;
  return Response.json({ success: true, ...(spread ? { rebalanced: spread } : {}) });
}

/**
 * Разложить стоимость удалённого экземпляра по оставшимся в партии.
 *
 * Возвращает, сколько карточек пересчитано, или null — если удаляли не
 * экземпляр партии либо партия закончилась совсем.
 */
async function spreadCostOverBatch(gone: typeof schema.assets.$inferSelect): Promise<number | null> {
  if (unitSuffix(gone.invNumber) === null) return null;

  const base = baseInvNumber(gone.invNumber);
  const rest = (await db.select().from(schema.assets).where(eq(schema.assets.filialId, gone.filialId)))
    .filter((a) => baseInvNumber(a.invNumber) === base && a.name === gone.name);
  if (rest.length === 0) return null;

  const sum = rest.reduce((s, a) => s + (Number(a.initialCost) || 0), 0) + (Number(gone.initialCost) || 0);
  const per = Math.floor((sum / rest.length) * 100) / 100;
  const lastCost = Math.round((sum - per * (rest.length - 1)) * 100) / 100;

  // Остаток от округления — последнему по номеру, как и везде.
  const maxIndex = rest.reduce((m, a) => Math.max(m, unitSuffix(a.invNumber) ?? 0), 0);
  for (const a of rest) {
    const isLast = (unitSuffix(a.invNumber) ?? 0) === maxIndex;
    await db.update(schema.assets)
      .set({ initialCost: String(isLast ? lastCost : per), updatedAt: new Date() })
      .where(eq(schema.assets.id, a.id));
  }
  return rest.length;
}
