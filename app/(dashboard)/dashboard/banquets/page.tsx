import { requireSession } from '@/lib/auth-session';
import { requireAccess } from '@/lib/access';
import { BanquetsClient } from './banquets-client';

export const metadata = {
  title: 'Бронь и банкеты | Аналитика',
  description: 'Управление бронированиями столов, банкетами и сквозная банкетная аналитика',
};

export const dynamic = 'force-dynamic';

export default async function BanquetsPage() {
  const session = await requireSession();
  requireAccess(session.role, 'banquets', '/dashboard');

  return <BanquetsClient />;
}
