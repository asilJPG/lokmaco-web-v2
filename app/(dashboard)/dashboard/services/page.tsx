import { requireAccess } from '@/lib/access';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { ServicesClient } from './services-client';

export const metadata = { title: 'Услуги' };
export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const session = await getSession();
  const [baseRole, storeId] = (session?.role || '').split(':');
  requireAccess(session?.role, 'services', '/dashboard/warehouse');

  return (
    <div className="grid">
      <div>
        <h1 className="page-title">Услуги</h1>
        <p className="page-subtitle">Акт на услугу без товара: доставка, транспорт, разовые расходы.</p>
      </div>
      <ServicesClient isAdmin={baseRole === 'admin' || baseRole === 'director' || baseRole === 'accountant'} fixedStoreId={storeId || null} />
    </div>
  );
}
