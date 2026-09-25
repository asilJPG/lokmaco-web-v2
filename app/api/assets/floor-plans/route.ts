import { and, desc, inArray, isNotNull, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';

export const dynamic = 'force-dynamic';

const CAN_EDIT = ['admin', 'manager', 'accountant'];

export async function GET() {
  const session = await requireSession();
  if (!CAN_EDIT.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ plans: [] });

  const [plans, counts] = await Promise.all([
    db.select().from(schema.assetFloorPlans)
      .where(inArray(schema.assetFloorPlans.filialId, filialIds))
      .orderBy(desc(schema.assetFloorPlans.createdAt)),
    db.select({
      floorPlanId: schema.assets.floorPlanId,
      count: sql<number>`count(*)::int`,
    })
      .from(schema.assets)
      .where(and(
        inArray(schema.assets.filialId, filialIds),
        isNotNull(schema.assets.floorPlanId),
      ))
      .groupBy(schema.assets.floorPlanId),
  ]);

  const countMap = new Map<string, number>();
  for (const c of counts) {
    if (c.floorPlanId) countMap.set(c.floorPlanId, c.count);
  }

  const result = plans.map((p) => ({
    ...p,
    pinnedCount: countMap.get(p.id) || 0,
  }));

  return Response.json({ plans: result });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!CAN_EDIT.includes(session.role.split(':')[0])) {
    return Response.json({ error: 'Доступ только для администратора и менеджера' }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim();
  const planType = b.plan_type === 'drawing' ? 'drawing' : 'image';

  if (!name) {
    return Response.json({ error: 'Укажите название плана' }, { status: 400 });
  }

  let imageUrl = '';
  let imagePath = '';
  let width = 1200;
  let height = 800;
  let drawingData: schema.DrawingData | null = null;

  if (planType === 'drawing') {
    drawingData = b.drawing_data || {
      canvasWidth: 1200,
      canvasHeight: 800,
      shapes: [],
    };
    width = drawingData?.canvasWidth || 1200;
    height = drawingData?.canvasHeight || 800;
  } else {
    imageUrl = String(b.image_url || '').trim();
    imagePath = String(b.image_path || '').trim();
    width = Math.max(0, parseInt(b.width, 10) || 0);
    height = Math.max(0, parseInt(b.height, 10) || 0);

    if (!imageUrl || !imagePath) {
      return Response.json({ error: 'Загрузите изображение плана' }, { status: 400 });
    }
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'Филиал не выбран' }, { status: 400 });
  const filialId = filialIds[0];

  const [created] = await db.insert(schema.assetFloorPlans).values({
    filialId,
    name,
    imageUrl,
    imagePath,
    width,
    height,
    planType,
    drawingData: drawingData as any,
  }).returning();

  await db.insert(schema.botActions).values({
    filialId,
    tgId: session.tgId,
    userName: session.name,
    actionType: 'asset_floor_plan_create',
    documentNumber: created.name,
    details: { id: created.id, name: created.name, planType, width, height, imagePath },
  });

  return Response.json({ success: true, data: { ...created, pinnedCount: 0 } });
}
