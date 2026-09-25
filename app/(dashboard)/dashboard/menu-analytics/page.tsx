import { requireSession } from '@/lib/auth-session';
import { MenuAnalyticsClient } from './menu-analytics-client';

export const metadata = {
  title: 'Аналитика меню (Lokmaco & Luma Garden)',
};

export default async function MenuAnalyticsPage() {
  await requireSession();

  return <MenuAnalyticsClient />;
}
