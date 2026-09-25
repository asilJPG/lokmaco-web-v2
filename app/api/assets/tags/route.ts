import { and, asc, desc, eq, inArray, isNull, like } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { normalizeTagCode, TAG_PREFIX } from '@/lib/asset-tags';

export const dynamic = 'force-dynamic';

// Роли — дословно из легаси (app/api/iiko/assets/tags/route.js).
const ALLOWED = ['admin', 'manager', 'accountant'];
const MAX_BATCH = 500;

function denied(role: string): boolean {
  return !ALLOWED.includes(role.split(':')[0]);
}

async function log(actionType: string, documentNumber: string, details: Record<string, unknown>, session: { tgId: number | null; name: string }) {
  const ids = await getCurrentFilialIds();
  if (ids.length === 0) return;
  await db.insert(schema.botActions).values({
    filialId: ids[0], tgId: session.tgId, userName: session.name, actionType, documentNumber, details,
  });
}

/** Наклейка вместе с карточкой, к которой привязана — только своего филиала. */
async function tagWithAsset(code: string, filialIds: number[]) {
  const [row] = await db
    .select({ tag: schema.assetTags, asset: schema.assets })
    .from(schema.assetTags)
    .leftJoin(schema.assets, eq(schema.assets.id, schema.assetTags.assetId))
    .where(and(eq(schema.assetTags.code, code), inArray(schema.assetTags.filialId, filialIds)));
  return row;
}

export async function GET(req: Request) {
  const session = await requireSession();
  if (denied(session.role)) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ success: true, data: [], stats: { total: 0, free: 0 } });

  const sp = new URL(req.url).searchParams;
  const code = sp.get('code');

  if (code) {
    const norm = normalizeTagCode(code);
    if (!norm) return Response.json({ error: 'Некорректный код наклейки' }, { status: 400 });
    const row = await tagWithAsset(norm, filialIds);
    if (!row) return Response.json({ error: 'Наклейка не найдена', code: norm }, { status: 404 });
    return Response.json({ success: true, tag: { ...row.tag, asset: row.asset } });
  }

  const batch = sp.get('batch');
  const onlyFree = sp.get('free') === '1';
  const where = [
    inArray(schema.assetTags.filialId, filialIds),
    batch ? eq(schema.assetTags.batch, batch) : undefined,
    onlyFree ? isNull(schema.assetTags.assetId) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({ tag: schema.assetTags, asset: schema.assets })
    .from(schema.assetTags)
    .leftJoin(schema.assets, eq(schema.assets.id, schema.assetTags.assetId))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(schema.assetTags.code));

  const data = rows.map((r) => ({ ...r.tag, asset: r.asset }));
  return Response.json({
    success: true,
    data,
    stats: { total: data.length, free: data.filter((t) => !t.assetId).length },
  });
}

/** Печать новой пачки: заводим пустые коды, продолжая общую нумерацию. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (denied(session.role)) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const n = parseInt(b?.count, 10);
  if (!Number.isFinite(n) || n < 1) return Response.json({ error: 'Укажите количество наклеек' }, { status: 400 });
  if (n > MAX_BATCH) return Response.json({ error: `За раз можно напечатать не больше ${MAX_BATCH}` }, { status: 400 });

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });

  // ⚠️ Нумерация продолжается от последнего кода **по всей базе**, а не
  // только по своему филиалу: код `LKM-0001` — первичный ключ, и два филиала
  // не могут иметь свой независимый `LKM-0007`. В зале окажется две
  // одинаковые наклейки.
  const [last] = await db
    .select({ code: schema.assetTags.code })
    .from(schema.assetTags)
    .where(like(schema.assetTags.code, `${TAG_PREFIX}%`))
    .orderBy(desc(schema.assetTags.code))
    .limit(1);
  const lastNum = last ? parseInt(last.code.slice(TAG_PREFIX.length), 10) || 0 : 0;

  const batch = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rows = Array.from({ length: n }, (_, i) => ({
    code: `${TAG_PREFIX}${String(lastNum + i + 1).padStart(4, '0')}`,
    batch,
    filialId: filialIds[0],
  }));

  const created = await db.insert(schema.assetTags).values(rows).returning();
  await log('asset_tags_create', batch, { count: n, from: rows[0].code, to: rows[rows.length - 1].code }, session);
  return Response.json({ success: true, batch, tags: created });
}

/**
 * Привязка наклейки к единице оборудования (и заодно к месту) — то самое
 * действие «подошёл, отсканировал, выбрал что это».
 */
export async function PATCH(req: Request) {
  const session = await requireSession();
  if (denied(session.role)) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const code = normalizeTagCode(b?.code);
  if (!code) return Response.json({ error: 'Некорректный код наклейки' }, { status: 400 });

  const row = await tagWithAsset(code, filialIds);
  if (!row) return Response.json({ error: 'Такой наклейки нет в системе' }, { status: 404 });

  if (b.unbind) {
    await db.update(schema.assetTags)
      .set({ assetId: null, boundAt: null, boundBy: null })
      .where(eq(schema.assetTags.code, code));
    await log('asset_tag_unbind', code, { was_asset_id: row.tag.assetId }, session);
    return Response.json({ success: true, unbound: true });
  }

  const assetId = String(b.asset_id || '');
  if (!assetId) return Response.json({ error: 'Не выбрано оборудование' }, { status: 400 });

  // ⚠️ Перепривязка на другую единицу — осознанное действие, требует флага:
  // иначе случайный скан занятой наклейки молча переклеил бы учёт.
  if (row.tag.assetId && row.tag.assetId !== assetId && !b.force) {
    return Response.json(
      { error: 'Наклейка уже привязана к другому оборудованию', conflict: true, current: row.asset },
      { status: 409 }
    );
  }

  await db.update(schema.assetTags)
    .set({ assetId, boundAt: new Date(), boundBy: session.name })
    .where(eq(schema.assetTags.code, code));

  // Место меняем тем же действием: чаще всего его и уточняют при оклейке.
  if (b.location_id !== undefined) {
    await db.update(schema.assets)
      .set({ locationId: b.location_id || null, updatedAt: new Date() })
      .where(eq(schema.assets.id, assetId));
  }

  await log('asset_tag_bind', code, {
    asset_id: assetId, location_id: b.location_id || null, rebound_from: row.tag.assetId || null,
  }, session);
  return Response.json({ success: true });
}

/** Удаление наклейки. Привязанную не трогаем — сначала отвязать. */
export async function DELETE(req: Request) {
  const session = await requireSession();
  if (denied(session.role)) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });

  const sp = new URL(req.url).searchParams;

  if (sp.get('free') === '1') {
    const res = await db.delete(schema.assetTags)
      .where(and(isNull(schema.assetTags.assetId), inArray(schema.assetTags.filialId, filialIds)))
      .returning({ code: schema.assetTags.code });
    await log('asset_tags_delete', 'free', { removed: res.length }, session);
    return Response.json({ success: true, removed: res.length });
  }

  const code = normalizeTagCode(sp.get('code'));
  if (!code) return Response.json({ error: 'Не указан код наклейки' }, { status: 400 });

  const row = await tagWithAsset(code, filialIds);
  if (!row) return Response.json({ error: 'Наклейка не найдена' }, { status: 404 });
  if (row.tag.assetId) {
    return Response.json({ error: 'Наклейка привязана к оборудованию — сначала отвяжите её' }, { status: 400 });
  }

  await db.delete(schema.assetTags).where(eq(schema.assetTags.code, code));
  await log('asset_tags_delete', code, {}, session);
  return Response.json({ success: true });
}
