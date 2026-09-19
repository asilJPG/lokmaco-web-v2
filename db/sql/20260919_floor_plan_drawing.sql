-- Встроенный редактор схемы помещения (drawing)
--
-- Добавление колонок `drawing_data` (JSON-структура нарисованных фигур)
-- и `plan_type` ('image' | 'drawing') в таблицу `asset_floor_plans`.
--
-- ⚠️ База общая с легаси-сайтом: используем IF NOT EXISTS и DEFAULT.

ALTER TABLE asset_floor_plans
  ADD COLUMN IF NOT EXISTS drawing_data jsonb,
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'image';
