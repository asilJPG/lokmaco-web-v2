import { requireSession } from '@/lib/auth-session';
import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';
import { SECTIONS_CATALOG, ALL_CONFIGURABLE_SECTIONS, saveUserPermissions } from '@/lib/user-permissions';
import { Section } from '@/lib/access';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireSession();
  const baseRole = session.role.split(':')[0];
  if (baseRole !== 'admin') {
    return Response.json({ error: 'Доступ запрещён' }, { status: 403 });
  }

  const users = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
      permissions: schema.users.permissions,
    })
    .from(schema.users)
    .orderBy(schema.users.id);

  return Response.json({
    users,
    catalog: SECTIONS_CATALOG,
    allSections: ALL_CONFIGURABLE_SECTIONS,
  });
}

export async function POST(req: Request) {
  const session = await requireSession();
  const baseRole = session.role.split(':')[0];
  if (baseRole !== 'admin') {
    return Response.json({ error: 'Доступ запрещён' }, { status: 403 });
  }

  const body = await req.json();
  const userId = Number(body?.userId);
  if (!userId || isNaN(userId)) {
    return Response.json({ error: 'Не указан ID пользователя' }, { status: 400 });
  }

  let permissions: Section[] | null = null;
  if (Array.isArray(body?.permissions)) {
    // Валидируем только известные секции
    const valid = new Set<string>(ALL_CONFIGURABLE_SECTIONS);
    permissions = body.permissions.filter((p: unknown): p is Section => typeof p === 'string' && valid.has(p));
  } else if (body?.permissions === null) {
    // null означает «сбросить до стандартных прав роли»
    permissions = null;
  } else {
    return Response.json({ error: 'Неверный формат permissions' }, { status: 400 });
  }

  await saveUserPermissions(userId, permissions);

  return Response.json({ success: true, permissions });
}
