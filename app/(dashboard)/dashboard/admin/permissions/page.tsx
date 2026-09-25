import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { listUsers } from '@/lib/admin-users';
import { SECTIONS_CATALOG } from '@/lib/user-permissions';
import { PermissionsClient } from './permissions-client';

export const metadata = { title: 'Права доступа' };
export const dynamic = 'force-dynamic';

export default async function PermissionsPage() {
  const session = await getSession();
  if (session?.role.split(':')[0] !== 'admin') redirect('/dashboard');

  const users = await listUsers();

  return (
    <div className="grid">
      <div>
        <h1 className="page-title">Выборочные права доступа</h1>
        <p className="page-subtitle">
          Включайте и отключайте галочками доступ к отдельным вкладкам для каждого сотрудника.
        </p>
      </div>
      <Suspense fallback={<div className="card"><div className="empty-state">Загрузка прав доступа…</div></div>}>
        <PermissionsClient initialUsers={users} catalog={SECTIONS_CATALOG} />
      </Suspense>
    </div>
  );
}
