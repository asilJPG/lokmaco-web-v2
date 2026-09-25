import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getSession } from './auth-session';
import { Section } from './access';

export * from './permissions-catalog';

const CACHE_MS = 60_000;
const permissionsCache = new Map<number, { permissions: Section[] | null; at: number }>();

/**
 * Читает индивидуальные права пользователя из БД (с 60-сек кэшем).
 * Если permissions == null — используются стандартные права роли.
 */
export async function getUserPermissions(userId?: number): Promise<Section[] | null> {
  let targetId = userId;
  if (!targetId) {
    const session = await getSession();
    if (!session) return null;
    targetId = session.id;
  }

  const hit = permissionsCache.get(targetId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.permissions;

  try {
    const [row] = await db
      .select({ permissions: schema.users.permissions })
      .from(schema.users)
      .where(eq(schema.users.id, targetId));
    
    const perms = Array.isArray(row?.permissions) ? (row.permissions as Section[]) : null;
    permissionsCache.set(targetId, { permissions: perms, at: Date.now() });
    return perms;
  } catch {
    return null;
  }
}

/** Сбросить кэш прав (вызывается сразу после сохранения) */
export function invalidateUserPermissions(userId?: number): void {
  if (userId === undefined) permissionsCache.clear();
  else permissionsCache.delete(userId);
}

/** Сохранить индивидуальные права пользователя в БД */
export async function saveUserPermissions(userId: number, permissions: Section[] | null): Promise<void> {
  await db
    .update(schema.users)
    .set({ permissions: permissions ? (permissions as unknown as string[]) : null })
    .where(eq(schema.users.id, userId));

  invalidateUserPermissions(userId);
}
