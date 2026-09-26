import { db, schema } from '@/db/client';
import { and, eq, gte, lte, desc, sql } from 'drizzle-orm';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { presetPeriod, todayTashkent } from '@/lib/period';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const preset = url.searchParams.get('preset') || '30d';
    const filialParam = url.searchParams.get('filialId');
    const statusParam = url.searchParams.get('status');

    let from = url.searchParams.get('from') || '';
    let to = url.searchParams.get('to') || '';

    if (!from || !to) {
      const p = presetPeriod(preset);
      from = p.from;
      to = p.to;
    }

    const filialIds = await getCurrentFilialIds();
    const effectiveFilialId = filialParam ? Number(filialParam) : filialIds[0] || 1;

    // 1. Список бронирований
    const conditions = [
      gte(schema.banquetBookings.eventDate, from),
      lte(schema.banquetBookings.eventDate, to),
    ];

    if (effectiveFilialId && !isNaN(effectiveFilialId)) {
      conditions.push(eq(schema.banquetBookings.filialId, effectiveFilialId));
    }

    if (statusParam && statusParam !== 'all') {
      conditions.push(eq(schema.banquetBookings.status, statusParam));
    }

    const bookings = await db
      .select()
      .from(schema.banquetBookings)
      .where(and(...conditions))
      .orderBy(desc(schema.banquetBookings.eventDate), desc(schema.banquetBookings.eventTime));

    // 2. Сводная аналитика по банкетам
    const filialFilter = effectiveFilialId ? sql`AND filial_id = ${effectiveFilialId}` : sql``;

    const statsRes = await db.execute<{
      total_count: string;
      total_guests: string;
      total_deposits: string;
      total_estimate: string;
      completed_count: string;
      cancelled_count: string;
      confirmed_count: string;
    }>(sql`
      SELECT
        count(*)::text as total_count,
        coalesce(sum(guest_count), 0)::text as total_guests,
        coalesce(sum(CASE WHEN deposit_status = 'paid' THEN deposit_amount ELSE 0 END), 0)::text as total_deposits,
        coalesce(sum(total_estimate), 0)::text as total_estimate,
        count(*) FILTER (WHERE status = 'completed')::text as completed_count,
        count(*) FILTER (WHERE status = 'cancelled')::text as cancelled_count,
        count(*) FILTER (WHERE status = 'confirmed')::text as confirmed_count
      FROM banquet_bookings
      WHERE event_date >= ${from}::date
        AND event_date <= ${to}::date
        ${filialFilter}
    `);

    const sRow = statsRes.rows[0] || {
      total_count: '0',
      total_guests: '0',
      total_deposits: '0',
      total_estimate: '0',
      completed_count: '0',
      cancelled_count: '0',
      confirmed_count: '0',
    };

    const totalCount = Number(sRow.total_count) || 0;
    const totalGuests = Number(sRow.total_guests) || 0;
    const totalDeposits = Number(sRow.total_deposits) || 0;
    const totalEstimate = Number(sRow.total_estimate) || 0;
    const completedCount = Number(sRow.completed_count) || 0;
    const cancelledCount = Number(sRow.cancelled_count) || 0;
    const confirmedCount = Number(sRow.confirmed_count) || 0;
    const avgGuestsPerBanquet = totalCount > 0 ? (totalGuests / totalCount).toFixed(1) : '0';

    // 3. Распределение по поводам (Occasions)
    const occasionsRes = await db.execute<{ occasion_title: string; count: string; guests: string }>(sql`
      SELECT
        coalesce(occasion_title, 'Другое') as occasion_title,
        count(*)::text as count,
        coalesce(sum(guest_count), 0)::text as guests
      FROM banquet_bookings
      WHERE event_date >= ${from}::date
        AND event_date <= ${to}::date
        ${filialFilter}
      GROUP BY occasion_title
      ORDER BY count DESC
    `);

    // 4. Популярность столов и зон
    const tablesRes = await db.execute<{ zone: string; table_number: string; count: string; guests: string }>(sql`
      SELECT
        coalesce(zone, 'Основной зал') as zone,
        table_number,
        count(*)::text as count,
        coalesce(sum(guest_count), 0)::text as guests
      FROM banquet_bookings
      WHERE event_date >= ${from}::date
        AND event_date <= ${to}::date
        ${filialFilter}
      GROUP BY zone, table_number
      ORDER BY count DESC
      LIMIT 10
    `);

    // 5. Динамика по дням (Timeline)
    const timelineRes = await db.execute<{ day: string; count: string; guests: string; deposits: string }>(sql`
      SELECT
        to_char(event_date, 'YYYY-MM-DD') as day,
        count(*)::text as count,
        coalesce(sum(guest_count), 0)::text as guests,
        coalesce(sum(deposit_amount), 0)::text as deposits
      FROM banquet_bookings
      WHERE event_date >= ${from}::date
        AND event_date <= ${to}::date
        ${filialFilter}
      GROUP BY day
      ORDER BY day ASC
    `);

    // 6. Активность сотрудников (кто сколько принял броней)
    const employeesRes = await db.execute<{ employee_name: string; count: string; deposits: string }>(sql`
      SELECT
        employee_name,
        count(*)::text as count,
        coalesce(sum(deposit_amount), 0)::text as deposits
      FROM banquet_bookings
      WHERE event_date >= ${from}::date
        AND event_date <= ${to}::date
        ${filialFilter}
      GROUP BY employee_name
      ORDER BY count DESC
      LIMIT 10
    `);

    return Response.json({
      bookings,
      stats: {
        totalCount,
        totalGuests,
        totalDeposits,
        totalEstimate,
        completedCount,
        cancelledCount,
        confirmedCount,
        avgGuestsPerBanquet,
      },
      occasions: occasionsRes.rows.map((r) => ({
        title: r.occasion_title,
        count: Number(r.count) || 0,
        guests: Number(r.guests) || 0,
      })),
      topTables: tablesRes.rows.map((r) => ({
        zone: r.zone,
        table: r.table_number,
        count: Number(r.count) || 0,
        guests: Number(r.guests) || 0,
      })),
      timeline: timelineRes.rows.map((r) => ({
        day: r.day,
        count: Number(r.count) || 0,
        guests: Number(r.guests) || 0,
        deposits: Number(r.deposits) || 0,
      })),
      employees: employeesRes.rows.map((r) => ({
        name: r.employee_name,
        count: Number(r.count) || 0,
        deposits: Number(r.deposits) || 0,
      })),
      from,
      to,
      filialId: effectiveFilialId,
    }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error('[bookings:GET] Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const filialId = Number(body?.filialId) || 1;
    const restaurantName = String(body?.restaurantName || 'The Lokmaco').trim();
    const eventDate = String(body?.eventDate || '').trim();
    const eventTime = String(body?.eventTime || '').trim();
    const endTime = body?.endTime ? String(body.endTime).trim() : null;
    const guestCount = Math.max(1, Number(body?.guestCount) || 1);
    const tableNumber = String(body?.tableNumber || '').trim();
    const zone = String(body?.zone || 'Основной зал').trim();
    const guestName = String(body?.guestName || '').trim();
    const guestPhone = String(body?.guestPhone || '').trim();
    const employeeName = String(body?.employeeName || '').trim();

    if (!eventDate || !eventTime || !tableNumber || !guestName || !guestPhone || !employeeName) {
      return Response.json(
        { error: 'Заполните все обязательные поля: Дата, Время, Стол, Имя гостя, Телефон, Имя сотрудника' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const occasion = String(body?.occasion || 'birthday').trim();
    const occasionTitle = String(body?.occasionTitle || 'День рождения').trim();
    const depositAmount = String(Number(body?.depositAmount) || 0);
    const depositStatus = String(body?.depositStatus || (Number(depositAmount) > 0 ? 'paid' : 'pending')).trim();
    const depositMethod = String(body?.depositMethod || 'cash').trim();
    const totalEstimate = String(Number(body?.totalEstimate) || 0);
    const status = String(body?.status || 'confirmed').trim();
    const specialRequests = body?.specialRequests ? String(body.specialRequests).trim() : null;
    const notes = body?.notes ? String(body.notes).trim() : null;
    const preorderItems = Array.isArray(body?.preorderItems) ? body.preorderItems : [];

    const [inserted] = await db
      .insert(schema.banquetBookings)
      .values({
        filialId,
        restaurantName,
        eventDate,
        eventTime,
        endTime,
        guestCount,
        tableNumber,
        zone,
        guestName,
        guestPhone,
        employeeName,
        occasion,
        occasionTitle,
        depositAmount,
        depositStatus,
        depositMethod,
        totalEstimate,
        status,
        specialRequests,
        preorderItems,
        notes,
      })
      .returning();

    return Response.json({ ok: true, booking: inserted }, { status: 201, headers: CORS_HEADERS });
  } catch (err) {
    console.error('[bookings:POST] Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
