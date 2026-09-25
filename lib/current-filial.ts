import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getSession } from './auth-session';

const COOKIE = 'current_filial';

/**
 * Кэш членства в филиалах на минуту.
 *
 * Список читается из базы на каждый запрос к API, а таких запросов на одной
 * странице десятки. Минута — компромисс: добавленный филиал появляется почти
 * сразу, а лишних кругов до пулера нет.
 */
const CACHE_MS = 60_000;
const cache = new Map<number, { ids: number[]; at: number }>();

/**
 * Филиалы пользователя — **из базы**, а не из токена сессии.
 *
 * ⚠️ В JWT список попадает в момент входа и живёт неделю. Из-за этого филиал,
 * добавленный сотруднику в «Пользователях», у него не появлялся: на одном
 * компьютере (где успели перелогиниться) переключатель был, на другом — нет,
 * и выглядело это как поломка сайта. Токен переподписать нельзя — он у
 * человека в куке, поэтому членство читаем живьём.
 *
 * Роль по-прежнему из токена: она меняется редко и её смена требует перелога
 * осознанно.
 */
export async function getUserFilialIds(): Promise<number[]> {
  const session = await getSession();
  if (!session) return [];

  const hit = cache.get(session.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ids;

  try {
    const rows = await db
      .select({ filialId: schema.userFilials.filialId })
      .from(schema.userFilials)
      .where(eq(schema.userFilials.userId, session.id));
    const ids = rows.map((r) => r.filialId);
    let value = ids.length > 0 ? ids : (session.filialIds || []);
    const baseRole = session.role.split(':')[0];
    if (value.length === 0 && ['admin', 'director', 'accountant'].includes(baseRole)) {
      const allFilials = await db.select({ id: schema.filials.id }).from(schema.filials);
      value = allFilials.map((f) => f.id);
    }
    cache.set(session.id, { ids: value, at: Date.now() });
    return value;
  } catch {
    const baseRole = (session?.role || '').split(':')[0];
    if ((!session.filialIds || session.filialIds.length === 0) && ['admin', 'director', 'accountant'].includes(baseRole)) {
      return [1, 2];
    }
    return session.filialIds || [];
  }
}

/** Сбросить кэш членства — зовётся после правки пользователя в админке. */
export function invalidateUserFilials(userId?: number): void {
  if (userId === undefined) cache.clear();
  else cache.delete(userId);
}

export async function getCurrentFilialIds(): Promise<number[]> {
  const allowed = await getUserFilialIds();
  if (allowed.length === 0) return [];
  const raw = cookies().get(COOKIE)?.value;
  if (raw && raw !== 'all') {
    const id = Number(raw);
    if (allowed.includes(id)) return [id];
  }
  return allowed;
}

export async function getCurrentFilialId(): Promise<number | 'all'> {
  const allowed = await getUserFilialIds();
  if (allowed.length === 0) return 'all';
  const raw = cookies().get(COOKIE)?.value;
  if (raw && raw !== 'all') {
    const id = Number(raw);
    if (allowed.includes(id)) return id;
  }
  return allowed.length === 1 ? allowed[0] : 'all';
}

export function setCurrentFilialCookie(value: number | 'all') {
  cookies().set(COOKIE, String(value), {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600,
  });
}
