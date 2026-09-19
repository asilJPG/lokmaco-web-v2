-- Карта размещения основных средств (ОС).
--
-- Таблица `asset_floor_plans` хранит загруженные планы этажей/залов филиала.
-- Колонки `floor_plan_id`, `floor_plan_x`, `floor_plan_y` в таблице `assets`
-- задают координаты маркера оборудования (в долях 0..1 от ширины и высоты изображения плана).
--
-- ⚠️ База общая с легаси-сайтом: все DDL с IF NOT EXISTS, DEFAULT и nullable,
-- чтобы легаси-инсерты не ломались.

CREATE TABLE IF NOT EXISTS asset_floor_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  image_url text NOT NULL DEFAULT '',
  image_path text NOT NULL DEFAULT '',
  width integer NOT NULL DEFAULT 0,
  height integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asset_floor_plans_filial_idx ON asset_floor_plans (filial_id);

ALTER TABLE assets ADD COLUMN IF NOT EXISTS floor_plan_id uuid;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS floor_plan_x numeric;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS floor_plan_y numeric;

CREATE INDEX IF NOT EXISTS assets_floor_plan_idx ON assets (floor_plan_id);
