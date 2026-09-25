import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';

export const dynamic = 'force-dynamic';

// Роли — дословно из легаси (app/api/iiko/assets/locations/route.js).
const ALLOWED = ['admin', 'manager', 'accountant'];

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

/** Сколько карточек числится в каждом месте — по нему же решаем, можно ли удалить. */
async function countByLocation(filialIds: number[]): Promise<Record<string, number>> {
  const rows = await db
    .select({ id: schema.assets.locationId, n: sql<number>`count(*)::int` })
    .from(schema.assets)
    .where(inArray(schema.assets.filialId, filialIds))
    .groupBy(schema.assets.locationId);
  const out: Record<string, number> = {};
  for (const r of rows) if (r.id) out[r.id] = Number(r.n);
  return out;
}

export async function GET() {
  const session = await requireSession();
  if (denied(session.role)) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ success: true, data: [] });
  const [locations, counts] = await Promise.all([
    db.select().from(schema.assetLocations)
      .where(inArray(schema.assetLocations.filialId, filialIds))
      .orderBy(asc(schema.assetLocations.sortOrder), asc(schema.assetLocations.name)),
    countByLocation(filialIds),
  ]);
  return Response.json({ success: true, data: locations.map((l) => ({ ...l, assets_count: counts[l.id] || 0 })) });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (denied(session.role)) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const name = String(b?.name || '').trim();
  if (!name) return Response.json({ error: 'Укажите название места' }, { status: 400 });

  try {
    const filialIds = await getCurrentFilialIds();
    if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });
    const [row] = await db.insert(schema.assetLocations).values({
      filialId: filialIds[0],
      name, note: String(b?.note || '').trim(), sortOrder: Number(b?.sort_order) || 0,
    }).returning();
    await log('asset_location_create', name, { name }, session);
    return Response.json({ success: true, location: row });
  } catch (e) {
    // Название уникально без учёта регистра и пробелов по краям — иначе «Бар»
    // и «бар » расползутся в две разные папки.
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('asset_locations_name_uniq')) {
      return Response.json({ error: 'Такое место уже есть' }, { status: 400 });
    }
    return Response.json({ error: 'Не удалось создать место' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await requireSession();
  if (denied(session.role)) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  if (!b?.id) return Response.json({ error: 'Не указан id места' }, { status: 400 });

  const patch: Partial<typeof schema.assetLocations.$inferInsert> = {};
  if (b.name !== undefined) {
    const clean = String(b.name).trim();
    if (!clean) return Response.json({ error: 'Название не может быть пустым' }, { status: 400 });
    patch.name = clean;
  }
  if (b.note !== undefined) patch.note = String(b.note).trim();
  if (b.sort_order !== undefined) patch.sortOrder = Number(b.sort_order) || 0;
  if (Object.keys(patch).length === 0) return Response.json({ success: true, unchanged: true });

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });
  await db.update(schema.assetLocations).set(patch)
    .where(and(eq(schema.assetLocations.id, b.id), inArray(schema.assetLocations.filialId, filialIds)));
  return Response.json({ success: true });
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (denied(session.role)) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'Не указан id места' }, { status: 400 });

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });

  // ⚠️ Место с оборудованием не удаляем: карточки остались бы без привязки,
  // а человек бы этого не заметил.
  const counts = await countByLocation(filialIds);
  if (counts[id]) {
    return Response.json(
      { error: `В этом месте числится оборудование (${counts[id]} шт.). Сначала перенесите его.` },
      { status: 400 }
    );
  }

  await db.delete(schema.assetLocations)
    .where(and(eq(schema.assetLocations.id, id), inArray(schema.assetLocations.filialId, filialIds)));
  return Response.json({ success: true });
}
