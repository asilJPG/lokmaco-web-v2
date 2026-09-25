import { requireSession } from '@/lib/auth-session';
import { db } from '@/db/client';
import { sql } from 'drizzle-orm';
import { presetPeriod, todayTashkent } from '@/lib/period';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await requireSession();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const siteParam = (url.searchParams.get('site') || 'all').toLowerCase().trim();
  const preset = url.searchParams.get('preset') || '30d';

  let from = url.searchParams.get('from') || '';
  let to = url.searchParams.get('to') || '';

  if (!from || !to) {
    const p = presetPeriod(preset);
    from = p.from;
    to = p.to;
  }

  // Границы дат по ташкентскому времени (UTC+5)
  const fromTz = `${from} 00:00:00+05`;
  const toTz = `${to} 23:59:59.999+05`;

  try {
    // 1. Условие по сайту
    const siteFilter = siteParam !== 'all' ? sql`AND site_id = ${siteParam}` : sql``;

    // 2. Сводные метрики
    const summaryRes = await db.execute<{
      total_pageviews: string;
      unique_visitors: string;
      total_item_clicks: string;
      total_events: string;
      mobile_events: string;
    }>(sql`
      SELECT
        count(*) FILTER (WHERE event_type = 'pageview') as total_pageviews,
        count(DISTINCT visitor_id) as unique_visitors,
        count(*) FILTER (WHERE event_type IN ('item_click', 'item_view')) as total_item_clicks,
        count(*) as total_events,
        count(*) FILTER (WHERE device_type = 'mobile') as mobile_events
      FROM menu_analytics_events
      WHERE created_at >= ${fromTz}::timestamptz
        AND created_at <= ${toTz}::timestamptz
        ${siteFilter}
    `);

    const summaryRow = summaryRes.rows[0] || {
      total_pageviews: '0',
      unique_visitors: '0',
      total_item_clicks: '0',
      total_events: '0',
      mobile_events: '0',
    };

    const totalPageviews = Number(summaryRow.total_pageviews) || 0;
    const uniqueVisitors = Number(summaryRow.unique_visitors) || 0;
    const totalItemClicks = Number(summaryRow.total_item_clicks) || 0;
    const totalEvents = Number(summaryRow.total_events) || 0;
    const mobileEvents = Number(summaryRow.mobile_events) || 0;
    const mobileShare = totalEvents > 0 ? Math.round((mobileEvents / totalEvents) * 100) : 0;
    const avgViewsPerVisitor = uniqueVisitors > 0 ? (totalPageviews / uniqueVisitors).toFixed(1) : '0';

    // 3. Динамика по дням (Timeline)
    const timelineRes = await db.execute<{
      day: string;
      pageviews: string;
      visitors: string;
      item_clicks: string;
    }>(sql`
      SELECT
        to_char(created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') as day,
        count(*) FILTER (WHERE event_type = 'pageview') as pageviews,
        count(DISTINCT visitor_id) as visitors,
        count(*) FILTER (WHERE event_type IN ('item_click', 'item_view')) as item_clicks
      FROM menu_analytics_events
      WHERE created_at >= ${fromTz}::timestamptz
        AND created_at <= ${toTz}::timestamptz
        ${siteFilter}
      GROUP BY day
      ORDER BY day ASC
    `);

    // Заполняем пропуски в датах, чтобы график был непрерывным
    const dayMap = new Map<string, { pageviews: number; visitors: number; itemClicks: number }>();
    for (const r of timelineRes.rows) {
      dayMap.set(r.day, {
        pageviews: Number(r.pageviews) || 0,
        visitors: Number(r.visitors) || 0,
        itemClicks: Number(r.item_clicks) || 0,
      });
    }

    const timeline: { day: string; pageviews: number; visitors: number; itemClicks: number }[] = [];
    const curDate = new Date(`${from}T00:00:00Z`);
    const endDate = new Date(`${to}T00:00:00Z`);

    // Ограничитель до 366 дней во избежание бесконечных циклов
    let maxSteps = 366;
    while (curDate <= endDate && maxSteps-- > 0) {
      const y = curDate.getUTCFullYear();
      const m = String(curDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(curDate.getUTCDate()).padStart(2, '0');
      const dayStr = `${y}-${m}-${d}`;
      const entry = dayMap.get(dayStr) || { pageviews: 0, visitors: 0, itemClicks: 0 };
      timeline.push({ day: dayStr, ...entry });
      curDate.setUTCDate(curDate.getUTCDate() + 1);
    }

    // 4. Топ просматриваемых блюд (Top Items / Dishes)
    const itemsRes = await db.execute<{
      item_name: string;
      item_category: string | null;
      price: string | null;
      clicks: string;
      unique_clicks: string;
    }>(sql`
      SELECT
        item_name,
        item_category,
        max(item_price) as price,
        count(*) as clicks,
        count(DISTINCT visitor_id) as unique_clicks
      FROM menu_analytics_events
      WHERE event_type IN ('item_click', 'item_view')
        AND item_name IS NOT NULL
        AND item_name != ''
        AND created_at >= ${fromTz}::timestamptz
        AND created_at <= ${toTz}::timestamptz
        ${siteFilter}
      GROUP BY item_name, item_category
      ORDER BY clicks DESC
      LIMIT 100
    `);

    const topItems = itemsRes.rows.map((r) => {
      const clicks = Number(r.clicks) || 0;
      const share = totalItemClicks > 0 ? Math.round((clicks / totalItemClicks) * 1000) / 10 : 0;
      return {
        itemName: r.item_name,
        category: r.item_category || 'Без категории',
        price: r.price ? Number(r.price) : null,
        clicks,
        uniqueClicks: Number(r.unique_clicks) || 0,
        sharePercent: share,
      };
    });

    // 5. Категории меню (Category Breakdown)
    const categoriesRes = await db.execute<{
      category: string;
      clicks: string;
    }>(sql`
      SELECT
        coalesce(nullif(item_category, ''), 'Другое / без категории') as category,
        count(*) as clicks
      FROM menu_analytics_events
      WHERE event_type IN ('item_click', 'item_view')
        AND created_at >= ${fromTz}::timestamptz
        AND created_at <= ${toTz}::timestamptz
        ${siteFilter}
      GROUP BY category
      ORDER BY clicks DESC
      LIMIT 30
    `);

    const topCategories = categoriesRes.rows.map((r) => {
      const clicks = Number(r.clicks) || 0;
      const share = totalItemClicks > 0 ? Math.round((clicks / totalItemClicks) * 1000) / 10 : 0;
      return {
        category: r.category,
        clicks,
        sharePercent: share,
      };
    });

    // 6. Устройства (Devices)
    const devicesRes = await db.execute<{
      device: string;
      count: string;
    }>(sql`
      SELECT
        coalesce(nullif(device_type, ''), 'desktop') as device,
        count(*) as count
      FROM menu_analytics_events
      WHERE created_at >= ${fromTz}::timestamptz
        AND created_at <= ${toTz}::timestamptz
        ${siteFilter}
      GROUP BY device
      ORDER BY count DESC
    `);

    const devices = devicesRes.rows.map((r) => {
      const count = Number(r.count) || 0;
      const share = totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0;
      return {
        device: r.device,
        count,
        sharePercent: share,
      };
    });

    // 7. Список сайтов и активность
    const sitesRes = await db.execute<{
      site_id: string;
      events_count: string;
    }>(sql`
      SELECT
        site_id,
        count(*) as events_count
      FROM menu_analytics_events
      GROUP BY site_id
      ORDER BY events_count DESC
    `);

    const knownSites = [
      { id: 'lokmaco', name: 'Lokmaco' },
      { id: 'luma_garden', name: 'Luma Garden' },
    ];

    const detectedSitesMap = new Map<string, string>();
    for (const ks of knownSites) detectedSitesMap.set(ks.id, ks.name);
    for (const sr of sitesRes.rows) {
      if (!detectedSitesMap.has(sr.site_id)) {
        detectedSitesMap.set(
          sr.site_id,
          sr.site_id.charAt(0).toUpperCase() + sr.site_id.slice(1).replace(/[-_]/g, ' ')
        );
      }
    }

    const sites = Array.from(detectedSitesMap.entries()).map(([id, name]) => {
      const row = sitesRes.rows.find((s) => s.site_id === id);
      return {
        id,
        name,
        eventsCount: row ? Number(row.events_count) : 0,
      };
    });

    // 8. Последние 20 событий (Live Feed)
    const recentRes = await db.execute<{
      id: string;
      site_id: string;
      event_type: string;
      page_path: string | null;
      item_name: string | null;
      item_category: string | null;
      device_type: string | null;
      created_at: string;
    }>(sql`
      SELECT
        id,
        site_id,
        event_type,
        page_path,
        item_name,
        item_category,
        device_type,
        to_char(created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI:SS') as created_at
      FROM menu_analytics_events
      WHERE created_at >= ${fromTz}::timestamptz
        AND created_at <= ${toTz}::timestamptz
        ${siteFilter}
      ORDER BY id DESC
      LIMIT 25
    `);

    const recentEvents = recentRes.rows.map((r) => ({
      id: r.id,
      siteId: r.site_id,
      eventType: r.event_type,
      pagePath: r.page_path,
      itemName: r.item_name,
      itemCategory: r.item_category,
      deviceType: r.device_type,
      createdAt: r.created_at,
    }));

    return Response.json({
      site: siteParam,
      from,
      to,
      summary: {
        totalPageviews,
        uniqueVisitors,
        totalItemClicks,
        totalEvents,
        mobileShare,
        avgViewsPerVisitor,
      },
      timeline,
      topItems,
      topCategories,
      devices,
      sites,
      recentEvents,
    });
  } catch (err) {
    console.error('[menu-analytics:get] Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Database query error' },
      { status: 500 }
    );
  }
}
