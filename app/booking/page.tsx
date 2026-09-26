import { Metadata } from 'next';
import { BookingForm } from './booking-form';

export const metadata: Metadata = {
  title: 'Быстрая бронь столов и банкетов',
  description: 'Форма оформления бронирования столов и банкетов для сотрудников',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function BookingPage() {
  return <BookingForm />;
}
