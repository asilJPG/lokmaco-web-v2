import { requireSession } from '@/lib/auth-session';
import { getCurrentFilialIds } from '@/lib/current-filial';
import { tashkentDate } from '@/lib/tashkent';
import {
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  MAX_FLOOR_PLAN_BYTES,
  PHOTO_KINDS,
  buildPhotoPath,
  photoUrl,
  uploadPhoto,
  type PhotoKind,
} from '@/lib/storage';

export const dynamic = 'force-dynamic';

// admin, director, supplier загружают фото приходов; manager и admin загружают планы помещений.
const ALLOWED_ROLES = ['admin', 'director', 'supplier', 'manager'];

/**
 * Приём одной фотографии. Загружаем по одной, а не пачкой: на мобильном
 * интернете два отдельных запроса переживают обрыв гораздо лучше, чем один
 * толстый, и пользователь видит, какое именно фото уже долетело.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  const baseRole = session.role.split(':')[0];
  if (!ALLOWED_ROLES.includes(baseRole)) {
    return Response.json({ error: 'Доступ запрещен для вашей роли' }, { status: 403 });
  }

  const filialIds = await getCurrentFilialIds();
  if (filialIds.length === 0) return Response.json({ error: 'no filial' }, { status: 400 });
  const filialId = filialIds[0];

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: 'Ожидается multipart/form-data' }, { status: 400 });
  }

  const kind = String(form.get('kind') || '') as PhotoKind;
  if (!PHOTO_KINDS.includes(kind)) {
    return Response.json({ error: 'Неверный kind' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'Файл не передан' }, { status: 400 });

  const contentType = file.type || 'image/jpeg';
  if (!ALLOWED_PHOTO_TYPES.includes(contentType)) {
    return Response.json({ error: 'Только JPEG, WebP, PNG или SVG' }, { status: 415 });
  }
  const maxBytes = kind === 'floor_plan' ? MAX_FLOOR_PLAN_BYTES : MAX_PHOTO_BYTES;
  if (file.size > maxBytes) {
    return Response.json({
      error: kind === 'floor_plan'
        ? 'Файл слишком большой (максимум 10 МБ)'
        : 'Файл слишком большой — фото должно сжиматься на телефоне',
    }, { status: 413 });
  }

  const path = buildPhotoPath(filialId, kind, contentType, tashkentDate());
  try {
    await uploadPhoto(path, await file.arrayBuffer(), contentType);
  } catch (e) {
    console.error('[uploads] не удалось загрузить фото', e);
    return Response.json({ error: e instanceof Error ? e.message : 'Storage failed' }, { status: 502 });
  }

  return Response.json({ path, url: photoUrl(path), kind });
}
