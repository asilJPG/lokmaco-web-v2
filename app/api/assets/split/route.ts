import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { baseInvNumber, unitInvNumber, unitSuffix } from '@/lib/inv-number';

export const dynamic = 'force-dynamic';

const ALLOWED = ['admin', 'manager', 'accountant'];
const MAX_UNITS = 200;

/**
 * Разворот позиции «4 штуки» в четыре карточки — по одной на предмет.
 *
 * Иначе на вопрос «какой из четырёх столов пропал» ответить нечем: у одной
 * позиции с `quantity = 4` может быть только одна наклейка, и инвентаризация
 * покажет «стол на месте», даже если из четырёх остался один.
 *
 * ⚠️ В iiko при этом **ничего не меняется**: там остаётся одна номенклатура на
 * N штук, мы читаем её как есть. Разбивка живёт только на сайте. В списке
 * такие карточки тоже показываются одной строкой — «Стол · 4 шт».
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (!ALLOWED.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const id = String(b?.id || '');
  if (!id) return Response.json({ error: 'Не указана позиция' }, { status: 400 });

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });
  const [asset] = await db.select().from(schema.assets)
    .where(and(eq(schema.assets.id, id), inArray(schema.assets.filialId, filialIds)));
  if (!asset) return Response.json({ error: 'Позиция не найдена в этом филиале' }, { status: 404 });

  // Досчитать партию: разбили на 5, а их оказалось 6.
  if (b?.add) return addToBatch(asset, parseInt(String(b.add), 10) || 1, session);

  const n = parseInt(String(b?.count ?? asset.quantity ?? 0), 10);
  if (!Number.isFinite(n) || n < 2) return Response.json({ error: 'Количество должно быть 2 или больше' }, { status: 400 });
  if (n > MAX_UNITS) return Response.json({ error: `За раз можно разбить максимум на ${MAX_UNITS} штук` }, { status: 400 });

  const base = baseInvNumber(asset.invNumber || `EQ-${asset.id.slice(0, 6)}`);
  if (baseInvNumber(asset.invNumber) !== asset.invNumber) {
    return Response.json({ error: 'Эта позиция уже разбита на экземпляры' }, { status: 400 });
  }

  // Стоимость делим поровну, остаток от округления отдаём последнему
  // экземпляру: сумма по карточкам обязана сойтись с исходной до копейки,
  // иначе разбивка тихо меняет стоимость ОС на балансе.
  const total = Number(asset.initialCost) || 0;
  const per = Math.floor((total / n) * 100) / 100;
  const lastCost = Math.round((total - per * (n - 1)) * 100) / 100;

  const note = (i: number) => `Экземпляр ${i} из ${n}. Разбито из позиции ${asset.invNumber || asset.id}.${asset.notes ? ' ' + asset.notes : ''}`;

  // ⚠️ Первым экземпляром делаем саму исходную карточку, а не создаём её
  // заново: на ней уже может висеть наклейка и отметки инвентаризации, и
  // удаление источника всё это обнулило бы.
  //
  // ⚠️ `serial_number` при этом НЕ трогаем: там лежит код iiko, по которому
  // сверка узнаёт карточку. Легаси писал туда номер экземпляра — из-за этого
  // связь с номенклатурой терялась.
  await db.update(schema.assets).set({
    invNumber: unitInvNumber(base, 1, n),
    quantity: 1,
    initialCost: String(per),
    notes: note(1),
    updatedAt: new Date(),
  }).where(eq(schema.assets.id, id));

  const rest = Array.from({ length: n - 1 }, (_, k) => {
    const i = k + 2;
    return {
      filialId: asset.filialId,
      invNumber: unitInvNumber(base, i, n),
      name: asset.name,
      category: asset.category || 'Оборудование',
      location: asset.location || '',
      locationId: asset.locationId,
      responsiblePerson: asset.responsiblePerson || '',
      quantity: 1,
      initialCost: String(i === n ? lastCost : per),
      commissioningDate: asset.commissioningDate,
      status: asset.status || 'in_use',
      serialNumber: asset.serialNumber || '',
      notes: note(i),
      photoUrl: asset.photoUrl || '',
      source: asset.source,
    };
  });

  const created = await db.insert(schema.assets).values(rest).returning({ id: schema.assets.id, invNumber: schema.assets.invNumber });

  await db.insert(schema.botActions).values({
      filialId: asset.filialId, tgId: session.tgId, userName: session.name,
      actionType: 'asset_split', documentNumber: asset.invNumber || id,
      details: { source_id: id, name: asset.name, count: n, total_cost: total },
  });

  return Response.json({
    success: true,
    count: created.length + 1,
    message: `«${asset.name}» разбит на ${n} экземпляров — теперь у каждого своя наклейка`,
  });
}

/**
 * Дописать экземпляры в уже разбитую партию.
 *
 * Обычный случай: разбили на 5, пришли клеить — а их шесть. Раньше выхода не
 * было: разбивка отвечала «эта позиция уже разбита», и оставалось заводить
 * шестой предмет отдельной карточкой — с другим номером, вне партии, и обход
 * считал бы его чужим.
 *
 * ⚠️ Стоимость **перераспределяется по всей партии**, а не берётся с потолка:
 * сумма по карточкам обязана остаться прежней. Шестой стол не появился из
 * воздуха — его стоимость уже сидела в тех же деньгах, просто раскладывали их
 * на пятерых. Остаток от округления, как и при разбивке, уходит последнему.
 */
async function addToBatch(
  asset: typeof schema.assets.$inferSelect,
  add: number,
  session: { tgId: number | null; name: string }
) {
  if (!Number.isFinite(add) || add < 1) return Response.json({ error: 'Сколько экземпляров добавить?' }, { status: 400 });

  const base = baseInvNumber(asset.invNumber);
  const all = (await db.select().from(schema.assets).where(eq(schema.assets.filialId, asset.filialId)))
    .filter((a) => baseInvNumber(a.invNumber) === base && a.name === asset.name);
  if (all.length === 0) return Response.json({ error: 'Партия не найдена' }, { status: 404 });

  const total = all.length + add;
  if (total > MAX_UNITS) return Response.json({ error: `В партии не может быть больше ${MAX_UNITS} штук` }, { status: 400 });

  const sum = all.reduce((s, a) => s + (Number(a.initialCost) || 0), 0);
  const per = Math.floor((sum / total) * 100) / 100;
  const lastCost = Math.round((sum - per * (total - 1)) * 100) / 100;

  // Индексы могли пойти не подряд (карточку удаляли) — считаем от максимума,
  // иначе новый экземпляр занял бы номер, который уже печатали на наклейке.
  const maxIndex = all.reduce((m, a) => Math.max(m, unitSuffix(a.invNumber) ?? 0), 0);

  const rest = Array.from({ length: add }, (_, k) => {
    const i = maxIndex + k + 1;
    return {
      filialId: asset.filialId,
      invNumber: unitInvNumber(base, i, total),
      name: asset.name,
      category: asset.category || 'Оборудование',
      location: asset.location || '',
      locationId: asset.locationId,
      responsiblePerson: asset.responsiblePerson || '',
      quantity: 1,
      initialCost: String(i === total ? lastCost : per),
      commissioningDate: asset.commissioningDate,
      status: asset.status || 'in_use',
      serialNumber: asset.serialNumber || '',
      notes: `Экземпляр ${i} из ${total}. Дописан к партии ${base}.`,
      photoUrl: asset.photoUrl || '',
      source: asset.source,
    };
  });

  const created = await db.insert(schema.assets).values(rest).returning({ invNumber: schema.assets.invNumber });

  // Стоимость у старых карточек тоже пересчитываем — иначе сумма партии
  // выросла бы на пустом месте.
  for (const a of all) {
    const i = unitSuffix(a.invNumber) ?? 0;
    await db.update(schema.assets)
      .set({ initialCost: String(i === total ? lastCost : per), updatedAt: new Date() })
      .where(eq(schema.assets.id, a.id));
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length > 0) {
    await db.insert(schema.botActions).values({
      filialId: filialIds[0], tgId: session.tgId, userName: session.name,
      actionType: 'asset_split_add', documentNumber: base,
      details: { name: asset.name, added: add, total, total_cost: sum },
    });
  }

  return Response.json({
    success: true,
    count: created.length,
    message: `Добавлено: ${created.map((c) => c.invNumber).join(', ')}. В партии теперь ${total} шт, стоимость разложена заново — сумма не изменилась.`,
  });
}
