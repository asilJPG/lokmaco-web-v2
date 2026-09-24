import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { downloadPhoto, PHOTO_LABELS, type PhotoKind } from '@/lib/storage';
import { esc, purchasesChatId, sendMessage, sendPhotoAlbum, type OutgoingPhoto } from '@/lib/telegram';
import { fmtDate, todayTashkent } from '@/lib/period';
import { fmtDateTimeTashkent } from '@/lib/tashkent';

type Item = { product_name?: string; quantity?: number; price?: number; unit?: string };
export type InvoicePhoto = { path: string; kind: PhotoKind; product_name?: string };
type Details = {
  supplier_name?: string;
  store_name?: string;
  comment?: string;
  items?: Item[];
  photos?: InvoicePhoto[];
  items_without_photo?: string[];
  tg_sent_at?: string;
};

function money(n: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n));
}

function sumOf(items: Item[]): number {
  return items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0);
}

/**
 * Что писать под фотографиями.
 *
 * ⚠️ По умолчанию — **коротко**: «Приход» и дата. Так сделано в легаси
 * осознанно: сообщение уходит в общую рабочую группу, а поставщик, суммы и
 * состав закупа там показывать не нужно. Подробная подпись включается
 * `TG_INVOICE_CAPTION=full` — код её ниже сохранён целиком.
 */
function shortCaption(row: { createdAt?: Date | null }): string {
  const when = row.createdAt ? fmtDateTimeTashkent(row.createdAt) : '';
  return ['📦 <b>Приход</b>', esc(when)].filter(Boolean).join('\n');
}

function caption(row: { userName: string | null; documentNumber: string | null; details: Details; createdAt?: Date | null }): string {
  if ((process.env.TG_INVOICE_CAPTION || 'short') !== 'full') return shortCaption(row);
  const d = row.details;
  const items = Array.isArray(d.items) ? d.items : [];
  const lines = [
    `🚚 <b>Закуп</b> · ${esc(d.supplier_name || 'поставщик не указан')}`,
    `Склад: ${esc(d.store_name || '—')} · ${esc(row.userName || '—')}`,
    row.documentNumber ? `Документ ${esc(row.documentNumber)}` : '',
    '',
  ].filter(Boolean);

  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.price) || 0;
    lines.push(`• ${esc(it.product_name || '—')} — ${money(qty)} ${esc(it.unit || '')} × ${money(price)} = <b>${money(qty * price)}</b>`);
  }

  lines.push('', `<b>Итого: ${money(sumOf(items))} сум</b>`);
  if (d.comment) lines.push(`💬 ${esc(d.comment)}`);
  const without = Array.isArray(d.items_without_photo) ? d.items_without_photo : [];
  if (without.length > 0) lines.push(`⚠️ Без фото товара: ${esc(without.join(', '))}`);
  return lines.join('\n');
}

/**
 * Отправить фотоотчёт по одному приходу и пометить его отправленным.
 *
 * Зовётся сразу после проведения — чтобы в группе видели приход, пока машина
 * ещё у входа, — и повторно из вечерней сводки для тех, у кого мгновенная
 * отправка не прошла. Отметка `tg_sent_at` в самом документе не даёт прислать
 * одно и то же дважды.
 *
 * Порядок вложений: сначала накладная, потом позиции. Телеграм показывает
 * подпись только у первого фото альбома — и это должна быть накладная.
 */
export async function sendInvoicePhotos(row: {
  id: number;
  userName: string | null;
  documentNumber: string | null;
  createdAt?: Date | null;
  details: Record<string, unknown>;
}): Promise<boolean> {
  const chatId = purchasesChatId();
  if (!chatId) return false;

  const d = row.details as Details;
  if (d.tg_sent_at) return true;

  const all = Array.isArray(d.photos) ? d.photos : [];
  // Порядок как в легаси: сначала накладная, потом коллажи позиций. Сами
  // снимки позиций в группу не идут — они уже внутри коллажей, иначе одна
  // накладная на 20 строк превращалась бы в двадцать сообщений. Если коллаж
  // не собрался (старый браузер, сбой canvas), позиции всё же отправляем:
  // лучше россыпь снимков, чем ничего.
  const collages = all.filter((p) => p.kind === 'collage');
  const ordered = [
    ...all.filter((p) => p.kind === 'invoice'),
    ...collages,
    ...(collages.length === 0 ? all.filter((p) => p.kind === 'item' || p.kind === 'goods') : []),
  ];
  if (ordered.length === 0) return false;

  const files: OutgoingPhoto[] = [];
  for (const p of ordered) {
    const file = await downloadPhoto(p.path);
    if (!file?.body) continue;
    const bytes = new Uint8Array(await new Response(file.body).arrayBuffer());
    files.push({
      bytes,
      contentType: file.contentType || 'image/jpeg',
      filename: `photo_${files.length + 1}.jpg`,
    });
  }
  if (files.length === 0) return false;

  // В альбом больше 10 снимков не влезает, а позиций в накладной бывает
  // больше: шлём пачками, подпись — только у первой, чтобы не дублировать
  // весь список товаров под каждым альбомом.
  let ok = false;
  for (let i = 0; i < files.length; i += 10) {
    const sent = await sendPhotoAlbum(chatId, files.slice(i, i + 10), i === 0 ? caption({ ...row, details: d }) : '');
    if (i === 0) ok = sent;
  }
  if (!ok) return false;

  await db
    .update(schema.botActions)
    .set({ details: { ...d, tg_sent_at: new Date().toISOString() } })
    .where(eq(schema.botActions.id, row.id));
  return true;
}

/**
 * Сводка закупа за смену в Telegram.
 *
 * Каждый приход уходит отдельным альбомом со своей подписью: руководителю
 * важно видеть «что купили» вместе с фотографиями именно этого прихода, а не
 * общую кучу снимков без привязки.
 *
 * Приходы без фотографий не пропускаем, а перечисляем текстом в конце — то,
 * что закуп оформили без фото, само по себе повод обратить внимание.
 */
export async function sendPurchasesDigest(
  filialIds: number[],
  day: string = todayTashkent()
): Promise<{ sent: number; skipped: number; noPhoto: number; error?: string }> {
  const chatId = purchasesChatId();
  if (!chatId) return { sent: 0, skipped: 0, noPhoto: 0, error: 'TG_CHAT_ID не задан' };
  if (filialIds.length === 0) return { sent: 0, skipped: 0, noPhoto: 0 };

  const dayExpr = sql`coalesce(${schema.botActions.details}->>'selected_date', to_char(${schema.botActions.createdAt} at time zone 'Asia/Tashkent', 'YYYY-MM-DD'))`;

  const rows = await db
    .select({
      id: schema.botActions.id,
      userName: schema.botActions.userName,
      documentNumber: schema.botActions.documentNumber,
      createdAt: schema.botActions.createdAt,
      details: schema.botActions.details,
    })
    .from(schema.botActions)
    .where(and(
      inArray(schema.botActions.filialId, filialIds),
      eq(schema.botActions.actionType, 'invoice'),
      sql`${dayExpr} = ${day}`
    ))
    .orderBy(schema.botActions.id);

  let sent = 0;
  let skipped = 0;
  const withoutPhoto: string[] = [];

  for (const row of rows) {
    const d = (row.details || {}) as Details;

    // Повторный запуск не должен слать то же ещё раз: отметку ставим в сам
    // документ. Планировщик может сработать дважды, и человек может нажать
    // «отправить» руками — в группе от этого дублей быть не должно.
    if (d.tg_sent_at) { skipped++; continue; }

    const photos = Array.isArray(d.photos) ? d.photos : [];
    if (photos.length === 0) {
      withoutPhoto.push(`• ${esc(d.supplier_name || '—')} — ${money(sumOf(d.items || []))} сум (${esc(row.userName || '—')})`);
      continue;
    }

    const ok = await sendInvoicePhotos({
      id: row.id,
      userName: row.userName,
      documentNumber: row.documentNumber,
      createdAt: row.createdAt,
      details: (row.details || {}) as Record<string, unknown>,
    });
    if (!ok) {
      withoutPhoto.push(`• ${esc(d.supplier_name || '—')} — фотоотчёт отправить не удалось`);
      continue;
    }
    sent++;
  }

  if (withoutPhoto.length > 0) {
    await sendMessage(
      chatId,
      [`⚠️ <b>Закуп без фотографий</b> за ${fmtDate(day)}:`, '', ...withoutPhoto, '', 'По таким приходам не проверить, что именно привезли.'].join('\n')
    );
  }

  return { sent, skipped, noPhoto: withoutPhoto.length };
}
