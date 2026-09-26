import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!id || isNaN(id)) return Response.json({ error: 'Неверный ID' }, { status: 400 });

    const [booking] = await db.select().from(schema.banquetBookings).where(eq(schema.banquetBookings.id, id));
    if (!booking) return Response.json({ error: 'Бронь не найдена' }, { status: 404 });

    return Response.json({ booking }, { headers: CORS_HEADERS });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!id || isNaN(id)) return Response.json({ error: 'Неверный ID' }, { status: 400 });

    const body = await req.json();
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.status !== undefined) updateData.status = String(body.status);
    if (body.cancelReason !== undefined) updateData.cancelReason = String(body.cancelReason);
    if (body.depositStatus !== undefined) updateData.depositStatus = String(body.depositStatus);
    if (body.depositAmount !== undefined) updateData.depositAmount = String(body.depositAmount);
    if (body.depositMethod !== undefined) updateData.depositMethod = String(body.depositMethod);
    if (body.totalEstimate !== undefined) updateData.totalEstimate = String(body.totalEstimate);
    if (body.tableNumber !== undefined) updateData.tableNumber = String(body.tableNumber);
    if (body.zone !== undefined) updateData.zone = String(body.zone);
    if (body.guestCount !== undefined) updateData.guestCount = Number(body.guestCount);
    if (body.guestName !== undefined) updateData.guestName = String(body.guestName);
    if (body.guestPhone !== undefined) updateData.guestPhone = String(body.guestPhone);
    if (body.eventDate !== undefined) updateData.eventDate = String(body.eventDate);
    if (body.eventTime !== undefined) updateData.eventTime = String(body.eventTime);
    if (body.endTime !== undefined) updateData.endTime = body.endTime ? String(body.endTime) : null;
    if (body.occasion !== undefined) updateData.occasion = String(body.occasion);
    if (body.occasionTitle !== undefined) updateData.occasionTitle = String(body.occasionTitle);
    if (body.specialRequests !== undefined) updateData.specialRequests = body.specialRequests ? String(body.specialRequests) : null;
    if (body.notes !== undefined) updateData.notes = body.notes ? String(body.notes) : null;
    if (body.preorderItems !== undefined) updateData.preorderItems = body.preorderItems;

    const [updated] = await db
      .update(schema.banquetBookings)
      .set(updateData)
      .where(eq(schema.banquetBookings.id, id))
      .returning();

    if (!updated) return Response.json({ error: 'Бронь не найдена' }, { status: 404 });

    return Response.json({ ok: true, booking: updated }, { headers: CORS_HEADERS });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!id || isNaN(id)) return Response.json({ error: 'Неверный ID' }, { status: 400 });

    await db.delete(schema.banquetBookings).where(eq(schema.banquetBookings.id, id));

    return Response.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500, headers: CORS_HEADERS });
  }
}
