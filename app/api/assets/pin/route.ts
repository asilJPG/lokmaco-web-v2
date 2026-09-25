import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';

export const dynamic = 'force-dynamic';

const CAN_EDIT = ['admin', 'manager', 'accountant'];

export async function PATCH(req: Request) {
  const session = await requireSession();
  if (!CAN_EDIT.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const assetId = String(b.assetId || b.id || '').trim();
  if (!assetId) {
    return Response.json({ error: 'Укажите id оборудования' }, { status: 400 });
  }

  const floorPlanId = b.floorPlanId ? String(b.floorPlanId).trim() : null;

  if (floorPlanId) {
    // Проверяем, что план принадлежит активному филиалу
    const [plan] = await db.select().from(schema.assetFloorPlans)
      .where(and(eq(schema.assetFloorPlans.id, floorPlanId), inArray(schema.assetFloorPlans.filialId, filialIds)));
    if (!plan) return Response.json({ error: 'План не найден в вашем филиале' }, { status: 404 });

    const rawX = Number(b.x);
    const rawY = Number(b.y);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      return Response.json({ error: 'Координаты x и y должны быть числами от 0 до 1' }, { status: 400 });
    }
    const x = Math.max(0, Math.min(1, Math.round(rawX * 10000) / 10000));
    const y = Math.max(0, Math.min(1, Math.round(rawY * 10000) / 10000));

    const [updated] = await db.update(schema.assets)
      .set({
        floorPlanId,
        floorPlanX: String(x),
        floorPlanY: String(y),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.assets.id, assetId), inArray(schema.assets.filialId, filialIds)))
      .returning();

    if (!updated) return Response.json({ error: 'Оборудование не найдено' }, { status: 404 });

    await db.insert(schema.botActions).values({
      filialId: updated.filialId,
      tgId: session.tgId,
      userName: session.name,
      actionType: 'asset_pin',
      documentNumber: updated.invNumber,
      details: { assetId, floorPlanId, planName: plan.name, x, y },
    });

    return Response.json({ success: true, asset: updated });
  } else {
    // Снятие с карты
    const [updated] = await db.update(schema.assets)
      .set({
        floorPlanId: null,
        floorPlanX: null,
        floorPlanY: null,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.assets.id, assetId), inArray(schema.assets.filialId, filialIds)))
      .returning();

    if (!updated) return Response.json({ error: 'Оборудование не найдено' }, { status: 404 });

    await db.insert(schema.botActions).values({
      filialId: updated.filialId,
      tgId: session.tgId,
      userName: session.name,
      actionType: 'asset_unpin',
      documentNumber: updated.invNumber,
      details: { assetId },
    });

    return Response.json({ success: true, asset: updated });
  }
}
