import { db, schema } from '@/db/client';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function detectDevice(userAgent: string): 'mobile' | 'tablet' | 'desktop' {
  const ua = userAgent.toLowerCase();
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

interface RawEvent {
  siteId?: string;
  site_id?: string;
  eventType?: string;
  event_type?: string;
  visitorId?: string;
  visitor_id?: string;
  sessionId?: string;
  session_id?: string;
  pagePath?: string;
  page_path?: string;
  itemId?: string;
  item_id?: string;
  itemName?: string;
  item_name?: string;
  itemCategory?: string;
  item_category?: string;
  itemPrice?: number | string;
  item_price?: number | string;
  referrer?: string;
  deviceType?: string;
  device_type?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(req: Request) {
  try {
    let bodyText = '';
    const contentType = req.headers.get('content-type') || '';
    let payload: unknown;

    if (contentType.includes('application/json')) {
      payload = await req.json();
    } else {
      bodyText = await req.text();
      try {
        payload = JSON.parse(bodyText);
      } catch {
        payload = null;
      }
    }

    if (!payload || typeof payload !== 'object') {
      return Response.json({ error: 'Invalid JSON payload' }, { status: 400, headers: CORS_HEADERS });
    }

    const ua = req.headers.get('user-agent') || '';
    const fallbackDevice = detectDevice(ua);

    // Поддержка как одного события, так и пачки ({ events: [...] })
    const rawEvents: RawEvent[] = Array.isArray((payload as { events?: unknown }).events)
      ? (payload as { events: RawEvent[] }).events
      : Array.isArray(payload)
      ? (payload as RawEvent[])
      : [payload as RawEvent];

    const toInsert = rawEvents
      .filter((e) => {
        const site = (e.siteId || e.site_id || '').trim();
        const type = (e.eventType || e.event_type || '').trim();
        return site.length > 0 && type.length > 0;
      })
      .map((e) => {
        const site = (e.siteId || e.site_id || 'unknown').toLowerCase().trim();
        const type = (e.eventType || e.event_type || 'pageview').toLowerCase().trim();
        const visitor = (e.visitorId || e.visitor_id || crypto.randomUUID()).trim();
        const session = (e.sessionId || e.session_id || '').trim() || null;
        const page = (e.pagePath || e.page_path || '/').trim();
        const id = (e.itemId || e.item_id || '').trim() || null;
        const name = (e.itemName || e.item_name || '').trim() || null;
        const category = (e.itemCategory || e.item_category || '').trim() || null;
        const priceRaw = e.itemPrice ?? e.item_price;
        const price = priceRaw !== undefined && priceRaw !== null ? String(priceRaw) : null;
        const ref = (e.referrer || req.headers.get('referer') || '').trim() || null;
        const device = (e.deviceType || e.device_type || fallbackDevice) as 'mobile' | 'tablet' | 'desktop';
        const meta = e.metadata && typeof e.metadata === 'object' ? e.metadata : {};

        return {
          siteId: site,
          eventType: type,
          visitorId: visitor,
          sessionId: session,
          pagePath: page,
          itemId: id,
          itemName: name,
          itemCategory: category,
          itemPrice: price,
          referrer: ref,
          deviceType: device,
          userAgent: ua.slice(0, 500),
          metadata: meta,
        };
      });

    if (toInsert.length > 0) {
      // Пакетная вставка
      await db.insert(schema.menuAnalyticsEvents).values(toInsert);
    }

    return Response.json({ ok: true, count: toInsert.length }, { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    console.error('[menu-analytics:track] Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
