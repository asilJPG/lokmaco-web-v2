import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';

/**
 * Ручки, куда сессии не будет по определению.
 *
 * Первые три — вход: сессия там как раз и выдаётся. Две последние вызываются
 * не человеком, а машиной: почтовый провайдер приносит скан, планировщик
 * Vercel запускает рассылку. Куки у них нет, и middleware отбивал бы их 401
 * до самого роута. ⚠️ Каждая из них обязана проверять СВОЙ секрет
 * (`INBOUND_SCAN_SECRET`, `CRON_SECRET`) — без сессии это единственная защита.
 */
const PUBLIC_API = new Set([
  '/api/auth/passkey/login/options',
  '/api/auth/passkey/login/verify',
  '/api/auth/access-code',
  '/api/inbound/scan',
  '/api/telegram/purchases',
  '/api/analytics/menu/track',
  '/api/menu-analytics/track',
  '/api/bookings',
  '/api/bookings/public',
]);

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (path.startsWith('/api/')) {
    // CORS OPTIONS preflight
    if (req.method === 'OPTIONS') return NextResponse.next();
    if (PUBLIC_API.has(path) || path.startsWith('/api/bookings/public')) return NextResponse.next();
    const session = await verifySession(req.cookies.get('session_token')?.value);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const h = new Headers(req.headers);
    h.set('x-user-id', String(session.id));
    h.set('x-user-role', session.role);
    h.set('x-user-name', encodeURIComponent(session.name));
    h.set('x-user-tg-id', String(session.tgId ?? ''));
    h.set('x-user-filials', session.filialIds.join(','));
    return NextResponse.next({ request: { headers: h } });
  }

  // ⚠️ `/tag/<код>` и `/booking` открыты без входа:
  // Сотрудники оформляют банкет по прямой ссылке со смартфона/планшета без логина.
  if (path === '/login' || path === '/' || path.startsWith('/tag/') || path.startsWith('/booking') || path.startsWith('/reserve')) return NextResponse.next();

  const session = await verifySession(req.cookies.get('session_token')?.value);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
