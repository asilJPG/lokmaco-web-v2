import { requireSession } from '@/lib/auth-session';
import { deletePhoto, downloadPhoto, isPathAllowed } from '@/lib/storage';
import { getUserFilialIds } from '@/lib/current-filial';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['admin', 'director', 'supplier', 'accountant'];

/**
 * Прокси к приватному бакету.
 *
 * Подписанные ссылки Supabase не используем намеренно: они живут дольше
 * запроса и утекают вместе со скриншотом или ссылкой в мессенджере. Здесь
 * каждый показ фото — это проверка куки сессии, а доступ режется по филиалу,
 * зашитому в первый сегмент пути.
 */
export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const session = await requireSession();
  const path = params.path.join('/');
  if (!isPathAllowed(path, await getUserFilialIds())) {
    return new Response('Not found', { status: 404 });
  }

  const file = await downloadPhoto(path);
  if (!file) return new Response('Not found', { status: 404 });

  return new Response(file.body, {
    headers: {
      'Content-Type': file.contentType,
      // private: фото не должно осесть в общем кэше CDN — бакет приватный.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}

/** Удаление — чтобы переснятое фото не оставляло мусор в бакете. */
export async function DELETE(_req: Request, { params }: { params: { path: string[] } }) {
  const session = await requireSession();
  const baseRole = session.role.split(':')[0];
  if (!ALLOWED_ROLES.includes(baseRole)) {
    return Response.json({ error: 'Доступ запрещен для вашей роли' }, { status: 403 });
  }
  const path = params.path.join('/');
  if (!isPathAllowed(path, await getUserFilialIds())) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const ok = await deletePhoto(path);
  return Response.json({ success: ok });
}
