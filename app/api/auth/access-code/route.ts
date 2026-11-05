import { checkLoginLimit, clearLoginFailures, noteLoginFailure } from '@/lib/rate-limit';
import { setSessionCookie } from '@/lib/auth-session';
import { getUserByAccessCode, getUsablePasskeys, getUserFilials, updateLastLogin } from '@/lib/users';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  const limit = await checkLoginLimit(ip);
  if (!limit.allowed) {
    return Response.json(
      { error: `Слишком много попыток. Подождите ${Math.ceil(limit.retryAfterMs / 1000)} сек.` },
      { status: 429 }
    );
  }

  const { code } = await req.json();
  if (!code || String(code).length < 4) {
    await noteLoginFailure(ip);
    return Response.json({ error: 'Пароль должен содержать от 4 символов' }, { status: 400 });
  }

  const user = await getUserByAccessCode(String(code));
  if (!user) {
    await noteLoginFailure(ip);
    return Response.json({ error: 'Неверный пароль' }, { status: 401 });
  }

  // Директора обязаны входить по Face ID / Touch ID — но только если ключ
  // заведён именно на этом домене. Ключи со старого сайта на новом не работают
  // (WebAuthn привязан к домену), и блокировка по ним заперла бы аккаунт совсем.
  const [baseRole] = (user.role || '').split(':');
  if (baseRole === 'director') {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost';
    const passkeys = await getUsablePasskeys(user.id, host.split(':')[0]);
    if (passkeys.length > 0) {
      await noteLoginFailure(ip);
      return Response.json({ error: 'Используйте Face ID / Touch ID' }, { status: 403 });
    }
  }

  const filialIds = await getUserFilials(user.id);
  await setSessionCookie({ id: user.id, tgId: user.tgId, name: user.name, role: user.role, filialIds });
  await updateLastLogin(user.id, 'access_code').catch(() => {});
  await clearLoginFailures(ip).catch(() => {});

  return Response.json({
    success: true,
    user: { id: user.id, name: user.name, role: user.role, filialIds },
  });
}
