-- Таблица бронирований столов и банкетов
CREATE TABLE IF NOT EXISTS banquet_bookings (
  id SERIAL PRIMARY KEY,
  filial_id INTEGER NOT NULL REFERENCES filials(id) ON DELETE CASCADE,
  restaurant_name TEXT NOT NULL DEFAULT 'The Lokmaco',
  event_date DATE NOT NULL,
  event_time TEXT NOT NULL,
  end_time TEXT,
  guest_count INTEGER NOT NULL DEFAULT 1,
  table_number TEXT NOT NULL,
  zone TEXT NOT NULL DEFAULT 'Основной зал',
  guest_name TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  occasion TEXT DEFAULT 'birthday',
  occasion_title TEXT DEFAULT 'День рождения',
  deposit_amount NUMERIC NOT NULL DEFAULT 0,
  deposit_status TEXT NOT NULL DEFAULT 'pending',
  deposit_method TEXT DEFAULT 'cash',
  total_estimate NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed',
  cancel_reason TEXT,
  special_requests TEXT,
  preorder_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS banquet_date_idx ON banquet_bookings(event_date);
CREATE INDEX IF NOT EXISTS banquet_filial_date_idx ON banquet_bookings(filial_id, event_date);
CREATE INDEX IF NOT EXISTS banquet_status_idx ON banquet_bookings(status);
