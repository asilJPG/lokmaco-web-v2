/**
 * Supabase Storage — приватный бакет для фотографий прихода.
 *
 * Работаем напрямую по REST, без @supabase/supabase-js: единственное, что нам
 * нужно, — три запроса (PUT/GET/DELETE объекта), ради них тащить SDK в бандл
 * незачем, а весь остальной проект и так ходит в Supabase голым fetch-ем
 * (см. _legacy/lib/supabase.js).
 *
 * ⚠️ Бакет `invoices` СОЗДАН приватным, и держать его таким принципиально:
 * на фото накладной видны поставщик, суммы и подписи. Наружу файлы отдаёт
 * только наш прокси `/api/uploads/<путь>`, который проверяет сессию и филиал.
 *
 * ⚠️ Ключ: в .env лежит `SUPABASE_KEY` роли `anon`, service_role-ключа нет.
 * Поэтому под бакет заведены три политики на `storage.objects`
 * (`lokmaco_invoices_anon_insert|select|delete`), суженные до
 * `bucket_id = 'invoices'` — ничего другого в проекте этим ключом не достать.
 * Как только появится service_role-ключ, достаточно положить его в
 * `SUPABASE_SERVICE_KEY`: код предпочтёт его, и политики можно снести.
 */

export const INVOICE_BUCKET = 'invoices';

/**
 * Что именно на фото. Ключ объекта заканчивается этим словом — видно по имени файла.
 *
 * `item` — снимок одной позиции: доказательство, что именно этот товар привезли
 * и в таком виде. `goods` — общий снимок «что привезли», им пользовались до
 * появления пофрагментных фото; в интерфейсе он больше не предлагается, но
 * старые записи в истории его содержат, и подпись для них нужна.
 */
export type PhotoKind = 'goods' | 'invoice' | 'item' | 'collage' | 'floor_plan';

export const PHOTO_KINDS: PhotoKind[] = ['goods', 'invoice', 'item', 'collage', 'floor_plan'];

export const PHOTO_LABELS: Record<PhotoKind, string> = {
  goods: 'Фото товара',
  invoice: 'Фото накладной',
  item: 'Фото позиции',
  collage: 'Позиции одним листом',
  floor_plan: 'План помещения',
};

// Клиент жмёт фото до ~1600px/jpeg 0.8 (обычно 150–400 КБ). 3 МБ — потолок
// с большим запасом: всё, что больше, значит сжатие на клиенте не отработало.
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
// Планы помещений могут быть детализированными схемами до 10 МБ.
export const MAX_FLOOR_PLAN_BYTES = 10 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/webp', 'image/png', 'image/svg+xml'];

function creds(): { url: string; key: string } {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_KEY не заданы');

  // ⚠️ Ключ уходит в HTTP-заголовок, а туда можно только латиницу. Если в нём
  // окажется что-то ещё, fetch падает с «Cannot convert argument to a
  // ByteString» — сообщение, по которому причину не угадать. Так уже было:
  // из интерфейса скопировали не сам ключ, а маску из точек «••••».
  if (/[^\x20-\x7E]/.test(key)) {
    throw new Error(
      'SUPABASE_KEY содержит недопустимые символы — похоже, скопирована маска (точки), а не сам ключ. ' +
      'Настоящий ключ начинается на «eyJ» и состоит из латиницы, цифр, точек, дефисов и подчёркиваний.'
    );
  }
  return { url, key };
}

function headers(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/png': 'png',
  'image/svg+xml': 'svg',
};

/**
 * Путь объекта: `<filialId>/<дата>/<uuid>-<kind>.<ext>`.
 * Филиал первым сегментом — не для красоты: по нему прокси решает, можно ли
 * пользователю смотреть файл, не заглядывая в БД.
 */
export function buildPhotoPath(filialId: number, kind: PhotoKind, contentType: string, dateIso: string): string {
  const ext = EXT[contentType] || 'jpg';
  return `${filialId}/${dateIso}/${crypto.randomUUID()}-${kind}.${ext}`;
}

/** Путь принадлежит одному из филиалов пользователя? Заодно отсекает `..` и абсолютные пути. */
export function isPathAllowed(path: string, filialIds: number[]): boolean {
  if (!/^\d+\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}-(goods|invoice|item|collage|floor_plan)\.(jpg|webp|png|svg)$/.test(path)) return false;
  return filialIds.includes(Number(path.split('/')[0]));
}

export async function uploadPhoto(path: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void> {
  const { url, key } = creds();
  const res = await fetch(`${url}/storage/v1/object/${INVOICE_BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...headers(key), 'Content-Type': contentType, 'cache-control': '31536000' },
    body: body as BodyInit,
  });
  if (!res.ok) throw new Error(`Storage upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function downloadPhoto(path: string): Promise<{ body: ReadableStream<Uint8Array> | null; contentType: string } | null> {
  const { url, key } = creds();
  // cache: 'no-store' обязателен: Next кэширует fetch внутри роутов, и удалённое
  // фото продолжало бы отдаваться из кэша — поймано на живой проверке.
  const res = await fetch(`${url}/storage/v1/object/${INVOICE_BUCKET}/${path}`, {
    headers: headers(key),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return { body: res.body, contentType: res.headers.get('content-type') || 'application/octet-stream' };
}

export async function deletePhoto(path: string): Promise<boolean> {
  const { url, key } = creds();
  const res = await fetch(`${url}/storage/v1/object/${INVOICE_BUCKET}/${path}`, {
    method: 'DELETE',
    headers: headers(key),
    cache: 'no-store',
  });
  return res.ok;
}

/** Ссылка, по которой фото показывается в интерфейсе. Прямых ссылок в Supabase не даём. */
export function photoUrl(path: string): string {
  return `/api/uploads/${path}`;
}
