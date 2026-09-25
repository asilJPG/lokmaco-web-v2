-- Таблица событий веб-аналитики электронных меню (Lokmaco, Luma Garden и др.)
CREATE TABLE IF NOT EXISTS menu_analytics_events (
  id BIGSERIAL PRIMARY KEY,
  site_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  session_id TEXT,
  page_path TEXT,
  item_id TEXT,
  item_name TEXT,
  item_category TEXT,
  item_price NUMERIC,
  referrer TEXT,
  device_type TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS menu_events_site_created_idx ON menu_analytics_events (site_id, created_at);
CREATE INDEX IF NOT EXISTS menu_events_site_type_created_idx ON menu_analytics_events (site_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS menu_events_site_item_created_idx ON menu_analytics_events (site_id, item_name, created_at);
CREATE INDEX IF NOT EXISTS menu_events_visitor_created_idx ON menu_analytics_events (visitor_id, created_at);
