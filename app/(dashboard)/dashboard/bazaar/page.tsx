import { getSession } from '@/lib/auth-session';
import { redirect } from 'next/navigation';
import { baseRole } from '@/lib/access';
import BazaarClient from './bazaar-client';

export const metadata = { title: 'Сверка закупа' };
export const dynamic = 'force-dynamic';

export default async function BazaarPage() {
  const session = await getSession();
  if (!session) redirect('/');
  const role = baseRole(session.role);
  if (role !== 'admin' && role !== 'accountant' && role !== 'director') {
    redirect('/dashboard');
  }

  return (
    <div className="grid">
      <h1 className="page-title">Сверка закупа на базаре</h1>
      <p className="page-subtitle">Детектор невнесённых накладных</p>
      <BazaarClient isAdmin={role === 'admin'} />
    </div>
  );
}
