-- Добавление колонки permissions для выборочной настройки прав доступа к вкладкам
ALTER TABLE bot_users ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;

COMMENT ON COLUMN bot_users.permissions IS 'Выборочные права доступа к разделам и вкладкам (массив строк Section[]). NULL означает использование стандартных прав роли.';
