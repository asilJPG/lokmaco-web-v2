import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export type AdminUserRow = {
  id: number;
  name: string;
  role: string;
  accessCode: string | null;
  tgId: number | null;
  lastLoginAt: Date | null;
  filialIds: number[];
  passkeyCount: number;
  permissions?: string[] | null;
};

export async function listUsers(): Promise<AdminUserRow[]> {
  const users = await db.select().from(schema.users).orderBy(schema.users.id);
  if (users.length === 0) return [];

  const userIds = users.map((u) => u.id);
  const links = await db
    .select({ userId: schema.userFilials.userId, filialId: schema.userFilials.filialId })
    .from(schema.userFilials)
    .where(inArray(schema.userFilials.userId, userIds));
  const linkMap = new Map<number, number[]>();
  for (const l of links) {
    const arr = linkMap.get(l.userId) || [];
    arr.push(l.filialId);
    linkMap.set(l.userId, arr);
  }

  const counts = (await db.execute(sql`
    select user_id, count(*)::int as c from user_passkeys where user_id in (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)}) group by user_id
  `)) as unknown as { rows: { user_id: number; c: number }[] };
  const passkeyMap = new Map<number, number>();
  for (const r of counts.rows) passkeyMap.set(r.user_id, Number(r.c));

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    accessCode: u.accessCode,
    tgId: u.tgId,
    lastLoginAt: u.lastLoginAt,
    filialIds: linkMap.get(u.id) || [],
    passkeyCount: passkeyMap.get(u.id) || 0,
    permissions: (u.permissions as string[] | null) ?? null,
  }));
}

export async function listFilials() {
  return db.select().from(schema.filials).orderBy(schema.filials.id);
}

export async function createUser(input: {
  name: string;
  role: string;
  accessCode: string | null;
  tgId: number | null;
  filialIds: number[];
}) {
  const [user] = await db.insert(schema.users).values({
    name: input.name,
    role: input.role,
    accessCode: input.accessCode,
    tgId: input.tgId ?? Date.now(),
  }).returning({ id: schema.users.id });

  if (input.filialIds.length > 0) {
    await db.insert(schema.userFilials).values(
      input.filialIds.map((filialId) => ({ userId: user.id, filialId }))
    );
  }
  return user;
}

export async function updateUser(id: number, patch: Partial<{ name: string; role: string; accessCode: string | null; tgId: number | null; filialIds: number[] }>) {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.accessCode !== undefined) update.accessCode = patch.accessCode;
  // ⚠️ Последний рубеж: `bot_users.tg_id` NOT NULL. Null сюда роняет весь
  // апдейт, включая привязку филиалов, которая идёт следом.
  if (patch.tgId !== undefined && patch.tgId !== null) update.tgId = patch.tgId;
  if (Object.keys(update).length > 0) {
    await db.update(schema.users).set(update).where(eq(schema.users.id, id));
  }
  if (patch.filialIds) {
    await db.delete(schema.userFilials).where(eq(schema.userFilials.userId, id));
    if (patch.filialIds.length > 0) {
      await db.insert(schema.userFilials).values(patch.filialIds.map((filialId) => ({ userId: id, filialId })));
    }
  }
}

export async function deleteUser(id: number) {
  await db.delete(schema.users).where(eq(schema.users.id, id));
}
