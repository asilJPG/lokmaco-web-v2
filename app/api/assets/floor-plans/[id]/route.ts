import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { deletePhoto } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const CAN_EDIT = ['admin', 'manager', 'accountant'];

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!CAN_EDIT.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });

  const [plan] = await db.select().from(schema.assetFloorPlans)
    .where(and(eq(schema.assetFloorPlans.id, params.id), inArray(schema.assetFloorPlans.filialId, filialIds)));

  if (!plan) return Response.json({ error: 'План не найден' }, { status: 404 });

  const pinnedAssets = await db.select().from(schema.assets)
    .where(and(eq(schema.assets.floorPlanId, plan.id), inArray(schema.assets.filialId, filialIds)));

  return Response.json({ plan, assets: pinnedAssets });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!CAN_EDIT.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const patch: Partial<typeof schema.assetFloorPlans.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (b.name !== undefined) {
    const name = String(b.name || '').trim();
    if (!name) return Response.json({ error: 'Название плана не может быть пустым' }, { status: 400 });
    patch.name = name;
  }

  if (b.drawing_data !== undefined) {
    patch.drawingData = b.drawing_data;
    if (b.drawing_data?.canvasWidth) patch.width = b.drawing_data.canvasWidth;
    if (b.drawing_data?.canvasHeight) patch.height = b.drawing_data.canvasHeight;
  }

  const [updated] = await db.update(schema.assetFloorPlans)
    .set(patch)
    .where(and(eq(schema.assetFloorPlans.id, params.id), inArray(schema.assetFloorPlans.filialId, filialIds)))
    .returning();

  if (!updated) return Response.json({ error: 'План не найден' }, { status: 404 });

  await db.insert(schema.botActions).values({
    filialId: updated.filialId,
    tgId: session.tgId,
    userName: session.name,
    actionType: 'asset_floor_plan_update',
    documentNumber: updated.name,
    details: { id: updated.id, name: updated.name, hasDrawing: !!b.drawing_data },
  });

  return Response.json({ success: true, plan: updated });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!CAN_EDIT.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });

  const [plan] = await db.select().from(schema.assetFloorPlans)
    .where(and(eq(schema.assetFloorPlans.id, params.id), inArray(schema.assetFloorPlans.filialId, filialIds)));

  if (!plan) return Response.json({ error: 'План не найден' }, { status: 404 });

  // 1. Снимаем привязку с оборудования на этом плане
  await db.update(schema.assets)
    .set({ floorPlanId: null, floorPlanX: null, floorPlanY: null, updatedAt: new Date() })
    .where(and(eq(schema.assets.floorPlanId, plan.id), inArray(schema.assets.filialId, filialIds)));

  // 2. Удаляем запись плана
  await db.delete(schema.assetFloorPlans).where(eq(schema.assetFloorPlans.id, plan.id));

  // 3. Пробуем удалить файл из storage
  if (plan.imagePath) {
    try {
      await deletePhoto(plan.imagePath);
    } catch (e) {
      console.warn('[floor-plan] не удалось удалить изображение из storage:', e);
    }
  }

  await db.insert(schema.botActions).values({
    filialId: plan.filialId,
    tgId: session.tgId,
    userName: session.name,
    actionType: 'asset_floor_plan_delete',
    documentNumber: plan.name,
    details: { id: plan.id, name: plan.name, imagePath: plan.imagePath },
  });

  return Response.json({ success: true });
}
