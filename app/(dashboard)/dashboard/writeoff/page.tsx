import { requireAccess } from '@/lib/access';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { WriteoffClient } from './writeoff-client';

export const metadata = { title: 'Списание' };
export const dynamic = 'force-dynamic';

export default async function WriteoffPage() {
  const session = await getSession();
  const [baseRole, storeId] = (session?.role || '').split(':');
  requireAccess(session?.role, 'writeoff', '/dashboard/warehouse');

  return (
    <div className="grid">
      <div>
        <h1 className="page-title">Списание</h1>
        <p className="page-subtitle">Акт списания в iiko: бой, порча, пищевые потери.</p>
      </div>
      <WriteoffClient isAdmin={baseRole === 'admin' || baseRole === 'accountant'} fixedStoreId={storeId || null} />
    </div>
  );
}
