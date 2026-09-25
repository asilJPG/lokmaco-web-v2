import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { getCurrentFilialId, getUserFilialIds } from '@/lib/current-filial';
import { getUserPermissions } from '@/lib/user-permissions';
import { SidebarNav } from '@/components/nav';
import { FilialSwitcher } from '@/components/filial-switcher';
import { LogoutButton } from '@/components/logout-button';
import { CommandPalette } from '@/components/command-palette';
import { MobileTabBar, MobileTopBar } from '@/components/mobile-chrome';
import { and, inArray, or, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const baseRole = session.role.split(':')[0];
  const allowAll = baseRole === 'admin' || baseRole === 'director' || baseRole === 'accountant';

  // ⚠️ Членство в филиалах берём живым, а не из токена: список в JWT
  // фиксируется при входе и живёт неделю, поэтому добавленный сотруднику
  // филиал не появлялся до перелогина — на одной машине переключатель был,
  // на другой нет.
  const filialIds = await getUserFilialIds();

  // Загружаем филиалы, входящие заявки, текущий филиал и права доступа разом.
  const [filials, inboxRows, current, userPermissions] = await Promise.all([
    filialIds.length > 0
      ? db.select({ id: schema.filials.id, name: schema.filials.name })
          .from(schema.filials)
          .where(inArray(schema.filials.id, filialIds))
      : Promise.resolve([]),
    filialIds.length === 0
      ? Promise.resolve([{ c: 0 }])
      : db.select({ c: sql<number>`count(*)::int` })
          .from(schema.pendingTransfers)
          .where(and(
            inArray(schema.pendingTransfers.filialId, filialIds),
            or(
              eq(schema.pendingTransfers.status, 'pending_receiver'),
              eq(schema.pendingTransfers.status, 'pending_sender'),
              eq(schema.pendingTransfers.status, 'pending_creator')
            )!
          )),
    getCurrentFilialId(),
    getUserPermissions(session.id),
  ]);
  const inboxCount = Number(inboxRows[0]?.c || 0);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar__brand">
          <span className="app-sidebar__mark" aria-hidden="true">L</span>
          <span>Lokmaco</span>
        </div>
        <FilialSwitcher filials={filials} current={current} allowAll={allowAll} />
        <SidebarNav role={session.role} permissions={userPermissions} badges={{ inbox: inboxCount }} />
        <div className="cmdk-hint" data-print-hide style={{
          padding: '6px 12px 12px', fontSize: 11, color: 'var(--text-faint)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>Быстрый поиск</span>
          <kbd style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', background: 'var(--surface-muted)' }}>⌘K</kbd>
        </div>
        <div className="app-sidebar__user">
          <div>
            <div className="app-sidebar__user-name">{session.name}</div>
            <div>{session.role}</div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <MobileTopBar filials={filials} current={current} allowAll={allowAll} userName={session.name} />
      <main className="app-main">{children}</main>
      <MobileTabBar role={session.role} permissions={userPermissions} badges={{ inbox: inboxCount }} />
      <CommandPalette role={session.role} permissions={userPermissions} />
    </div>
  );
}
