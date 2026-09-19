# Lokmaco v2 — техническая архитектура

> В начале каждого ответа в чате Асилю (владелец проекта) пиши «Асиль».
> Не добавляй `Co-Authored-By: Claude …` в коммиты этого проекта, если явно не попросил.

## 1. Что это

Внутренний веб-инструмент сети ресторанов **Lokmaco** (Fergana + Pipls Samarkand). Заменяет и достраивает то, что раньше делали в Telegram-боте и в интерфейсе iiko: закрытие смены кассиром, приход накладной с фотоотчётом, перемещения между складами, приготовление, списание, услуги, аналитика продаж/зарплат/ликвидности, инвентаризация основных средств через QR-наклейки и печать акта ИНВ-3. Пишет документы напрямую в iiko двумя способами (XML API и iikoWeb JSON), деплой — Vercel, база — Supabase Postgres, общая с легаси-сайтом (`web_lokmaco3`).

## 2. Стек

| Слой | Что | Версия/детали |
|---|---|---|
| Язык | TypeScript strict, немного JS в легаси | `tsconfig.json` |
| Фреймворк | Next.js 14 App Router, React 18 | `next@14.2.18` |
| БД | PostgreSQL 16, реальный хост — Supabase (общий с легаси) | `pg@8.13` |
| ORM | Drizzle | `drizzle-orm@0.36`, `drizzle-kit@0.28` |
| Аутентификация | Собственный JWT (HS256) в httpOnly-cookie + WebAuthn passkey | `@simplewebauthn/browser@13`, `server@11` |
| Хостинг | Vercel, регион `bom1` (Мумбаи) | `vercel.json` |
| CI/CD | GitHub push → авто-деплой Vercel | ветка `v2-rewrite` (репо `origin`), `main` (репо `v2origin`) — вторая триггерит Vercel |
| Файлы | Supabase Storage, приватный бакет `invoices` | доступ через прокси `/api/uploads/[...path]` |
| Внешние API | iiko Server XML API, iikoWeb JSON API, OpenRouter (Gemini 2.5 Flash), Telegram Bot API, Google Apps Script | см. раздел 7 |
| Скан QR | `jsqr` (везде) + `BarcodeDetector` (только Chromium) | `jsqr@1.4` |
| QR-печать | `qrcode` (SVG) | `qrcode@1.5` |
| Локальная разработка | `postgres://<user>@localhost:5432/lokmaco_v2` (Homebrew PG 16). Юзер `Asil` admin, код `1234`, филиал id=1 Fergana | `npm run dev -- -p 3100` |

## 3. Файловая структура

```
web_lokmaco_v2/
├── app/
│   ├── login/                          # экран входа: код + Face ID
│   ├── tag/[code]/                     # публичная страница по QR-наклейке (без сессии)
│   ├── (dashboard)/                    # обёртка с боковым меню и мобильной оболочкой
│   │   └── dashboard/
│   │       ├── page.tsx                # главная: сводка за вчера + быстрые действия
│   │       ├── layout.tsx              # `.app-shell`, сайдбар, мобильная шторка филиала
│   │       ├── assistant/              # чат с Claude через `/api/agent/chat`
│   │       ├── admin/{users,filials}/  # пользователи и филиалы (роль admin)
│   │       ├── analytics/              # хаб + вкладки: обзор/ОПиУ/ABC/ликвидность/закупки/официанты
│   │       ├── attendance/             # явки
│   │       ├── assets/                 # опись ОС + инвентаризация (см. раздел 5.assets)
│   │       ├── balances/               # остатки по складам iiko
│   │       ├── cashier/                # закрытие смены (документ в iiko + запись в bot_actions)
│   │       ├── documents/              # список документов iiko (INCOMING_INVOICE/TRANSFER/...)
│   │       ├── finance/                # лендинг «Финансы»
│   │       ├── history/[id]/           # история смен + карточка смены
│   │       ├── iiko-analytics/         # низкоуровневые OLAP-выборки
│   │       ├── inbox/                  # входящие перемещения (принять/отклонить)
│   │       ├── inventory/              # инвентаризация склада iiko (INVENTORY)
│   │       ├── invoice/                # приход накладной с фото товара и накладной
│   │       ├── menu-analytics/         # аналитика меню
│   │       ├── operations/             # операции (лендинг)
│   │       ├── pnl/                    # ОПиУ по кассе
│   │       ├── production/             # акт приготовления (PRODUCTION_DOCUMENT)
│   │       ├── profile/                # WebAuthn passkey менеджмент
│   │       ├── reconciliation/         # ежемесячная сверка касса↔iiko
│   │       ├── safe/                   # движения по сейфу
│   │       ├── services/               # акт приёма услуг (INCOMING_SERVICE)
│   │       ├── tax-report/             # налоговый отчёт
│   │       ├── transfer/               # перемещение (INTERNAL_TRANSFER)
│   │       ├── wages/                  # зарплаты
│   │       ├── warehouse/              # лендинг «Склад»
│   │       └── writeoff/               # списание (WRITEOFF_DOCUMENT)
│   └── api/                            # см. раздел 5, «API-роуты»
├── components/                         # клиентские компоненты
│   ├── nav.tsx                         # десктопное дерево меню
│   ├── mobile-chrome.tsx               # мобильный tabbar + topbar + шторка филиалов
│   ├── command-palette.tsx             # ⌘K поиск разделов
│   ├── filial-switcher.tsx             # десктопный переключатель филиала
│   ├── sortable.tsx                    # `useSort` + `SortTh` — сортировка таблиц (общий)
│   ├── stack-table.tsx                 # обёртка таблицы: на мобилке карточки, `data-label` из шапки
│   ├── store-select.tsx                # выпадающий список складов (использует `lib/stores-client.ts`)
│   ├── supplier-select.tsx             # поставщики
│   ├── product-picker.tsx              # выбор товара с поиском
│   ├── period-picker.tsx               # день/неделя/месяц
│   ├── charts.tsx                      # sparklines для сводок
│   ├── inline-search.tsx               # быстрый фильтр по списку
│   ├── pagination.tsx                  # общий пагинатор
│   ├── copy-button.tsx                 # кнопка копировать
│   ├── logout-button.tsx               # выход + переход на /login
│   ├── admin-expense-form.tsx          # форма расхода кассира
│   ├── employee-wages-table.tsx        # таблица зарплат
│   └── revenue-sparkline.tsx           # мини-график выручки
├── lib/                                # ядро, не Next-специфичное
│   ├── auth.ts                         # HS256 подпись сессии (SessionPayload)
│   ├── auth-session.ts                 # cookie `session_token`, getSession/require/set/clear
│   ├── access.ts                       # матрица ролей ↔ разделы (единая точка правды)
│   ├── users.ts                        # чтения из `bot_users`, `user_filials`, `user_passkeys`
│   ├── admin-users.ts                  # CRUD пользователей
│   ├── current-filial.ts               # `getUserFilialIds`/`getCurrentFilialIds` + куки + кэш
│   ├── crypto.ts                       # AES-256-GCM для кред-полей филиала
│   ├── rate-limit.ts                   # лимит попыток входа в `login_attempts` (IP + глобально)
│   ├── iiko.ts                         # iiko XML API (auth/get/getText/postXml)
│   ├── iiko-web.ts                     # iikoWeb JSON API (login + `iikoWebFetch` через http1)
│   ├── iiko-web-docs.ts                # submitDocument (INTERNAL_TRANSFER/INVENTORY/PRODUCTION_DOCUMENT/INCOMING_INVOICE) + submitServiceAct (INCOMING_SERVICE)
│   ├── http1.ts                        # node:https-транспорт (iikoWeb отвечает 500 на undici)
│   ├── filial-iiko.ts                  # `resolveIikoCreds` — креды из `filials` с fallback на env
│   ├── iiko-cache.ts                   # общий кэш iiko-ответов: память + БД `iiko_cache`
│   ├── iiko-nomenclature.ts            # чтение номенклатуры и MeasureUnit
│   ├── stores-client.ts                # клиентский кэш складов (модульный + sessionStorage + in-flight)
│   ├── liquidity.ts                    # OLAP + балансы для «Ликвидности»
│   ├── sales-overview.ts               # OLAP «Обзор»
│   ├── menu-analytics.ts               # ABC-анализ блюд
│   ├── pnl.ts                          # формула ОПиУ (из легаси, не переизобретать)
│   ├── tax-report.ts                   # налоговый отчёт
│   ├── wages.ts                        # зарплаты
│   ├── safe.ts                         # операции сейфа
│   ├── cashier.ts                      # закрытие смены
│   ├── pending-transfer.ts             # подтверждения перемещений
│   ├── ingredient-prices.ts            # цены ингредиентов
│   ├── invoice-match.ts                # матчинг позиций накладной к номенклатуре iiko (jaccard + фасовка)
│   ├── parse-invoice-photo.ts          # OpenRouter (vision): фото накладной → items
│   ├── purchases-digest.ts             # фотоотчёт закупа в Telegram (сразу + вечерняя сводка)
│   ├── telegram.ts                     # sendMessage/sendPhoto/sendPhotoAlbum + `TG_INVOICE_CHAT_ID`
│   ├── storage.ts                      # Supabase Storage: путь `<filial>/<дата>/<uuid>-<kind>.<ext>`
│   ├── audio.ts                        # `looksLikeSpeech` — не пускать шум в модель
│   ├── log-action.ts                   # запись в `bot_actions`
│   ├── period.ts                       # `todayTashkent` / `fmtDate` / диапазоны периодов
│   ├── tashkent.ts                     # UTC+5 без DST, штампы для iiko
│   ├── inv-number.ts                   # `baseInvNumber`/`unitInvNumber`/`unitSuffix`/`unitLabel`
│   ├── asset-tags.ts                   # `TAG_PREFIX=LKM-`, нормализация кода из URL
│   ├── inv3-export.ts                  # печатная форма ИНВ-3 (HTML/Excel/print) + подписи + сумма прописью
│   ├── number-to-words.ts              # RU-прописью для сумм (миллион/тысяча + женский род)
│   ├── use-draft.ts                    # хук localStorage-черновиков
│   └── search-params.ts                # утилиты для query-string
├── db/
│   ├── client.ts                       # `db` (Drizzle+pg), пул на globalThis, max 5 соединений
│   ├── schema.ts                       # все таблицы
│   ├── migrations/                     # drizzle-kit generate
│   └── sql/                            # ручные DDL, применяются вручную (см. раздел 6)
│       ├── 20260810_asset_audits.sql
│       ├── 20260905_asset_audit_act.sql
│       └── 20260912_assets_filial.sql
├── scripts/
│   └── migrate-from-supabase.ts        # разовый импорт из старой Supabase-базы
├── middleware.ts                       # заслон: 401 на любой /api/* без валидной сессии; PUBLIC_API исключения
├── next.config.js                      # bodySizeLimit 10mb для serverActions, reactStrictMode
├── vercel.json                         # regions=bom1, cron `/api/telegram/purchases` в 18:00 UTC
├── context.md                          # живая заметка «что и почему»: **читать целиком перед задачей**
├── docs/ARCHITECTURE.md                # этот файл
├── app/globals.css                     # весь дизайн, без Tailwind
└── package.json                        # скрипты: dev/build/db:generate/db:push/db:migrate-from-supabase
```

## 4. Переменные окружения

**Файл**: `.env` (не `.env.local`). ⚠️ Асиль **запретил** редактировать `.env` из инструментов — только руками через панель Vercel или в его редакторе.

| Переменная | Обяз. | Что | Где используется |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `postgres://…@aws-1-ap-south-1.pooler.supabase.com:6543/postgres` — **только Transaction pooler**, direct-подключение для новых проектов больше не резолвится | `db/client.ts` |
| `JWT_SECRET` | ✅ | 32+ байта, HS256 подпись cookie `session_token` | `lib/auth.ts` |
| `SUPABASE_URL` | ✅ | `https://<ref>.supabase.co` | `lib/storage.ts` |
| `SUPABASE_KEY` | ✅ | `anon`-ключ (JWT `eyJ…`). ⚠️ Если в панели скопирована **маска из точек**, fetch падает «Cannot convert argument to ByteString» — `lib/storage.ts:48` проверяет | `lib/storage.ts` |
| `SUPABASE_SERVICE_KEY` | ⚙️ | service_role — предпочтителен, если появится; тогда storage-политики можно снести | `lib/storage.ts` |
| `IIKO_CRED_KEY` | ✅ | 32 байта base64 — AES-256-GCM для `iiko_password_enc`/`iiko_web_password_enc` в `filials`. Без него креды филиала расшифровать нельзя, откат на env-креды | `lib/crypto.ts` |
| `IIKO_SERVER` | fallback | `https://the-lokmako.iiko.it` (Fergana). Используется, если у филиала не заданы свои | `lib/iiko.ts:getDefaultCreds` |
| `IIKO_LOGIN` | fallback | login iiko XML | `lib/iiko.ts` |
| `IIKO_PASSWORD` | fallback | пароль в открытом виде (SHA-1 на стороне iiko) | `lib/iiko.ts` |
| `IIKO_WEB_URL` | fallback | `https://the-lokmako.iikoweb.ru` | `lib/iiko-web.ts` |
| `IIKO_WEB_LOGIN` | fallback | login iikoWeb | `lib/iiko-web.ts` |
| `IIKO_WEB_PASSWORD` | fallback | пароль iikoWeb | `lib/iiko-web.ts` |
| `IIKO_STORE_NUM` | fallback | `170243` — номер основного склада для iikoWeb-документов | `lib/iiko-web-docs.ts` |
| `IIKO_CONCEPTION_ID` | fallback | UUID концепции (совпадает у обоих филиалов) | `lib/iiko-web-docs.ts` |
| `IIKO_CONTAINER_ID` | fallback | UUID единицы для строк документов | `lib/iiko-web-docs.ts` |
| `IIKO_KITCHEN_PREP_STORE` | fallback | `2e9688bb-…` — счёт кухни для акта приготовления. ⚠️ **Существует только в Fergana**, в Samarkand нет | `lib/iiko-web-docs.ts` |
| `IIKO_DEPARTMENT` | fallback | `a9eef1fa-…0012` — подразделение для акта услуг. ⚠️ **Fergana-only** | `lib/iiko-web-docs.ts` |
| `IIKO_SERVICE_CREDIT_ACCOUNT` | fallback | счёт для акта услуг | `lib/iiko-web-docs.ts` |
| `IIKO_SERVICE_UNIT` | fallback | UUID «шт» для акта услуг | `lib/iiko-web-docs.ts` |
| `IIKO_REJECT_UNAUTHORIZED` | ⚙️ | `0` отключает TLS-верификацию (не использовать в проде) | `lib/http1.ts` |
| `OPENROUTER_API_KEY` | ✅ | sk-or-… для распознавания голоса, фото накладной, ассистента | `lib/parse-invoice-photo.ts`, `app/api/transcribe/route.ts`, `app/api/agent/chat/route.ts` |
| `OPENROUTER_MODEL` | ⚙️ | по умолчанию `google/gemini-2.5-flash` | тексто-парсер |
| `OPENROUTER_VISION_MODEL` | ⚙️ | по умолчанию `google/gemini-2.5-flash` | фото накладной |
| `OPENROUTER_AUDIO_MODEL` | ⚙️ | по умолчанию `google/gemini-2.5-flash` | распознавание речи |
| `ANTHROPIC_API_KEY` | ⚙️ | ключ Anthropic для ассистента (`/api/agent/chat`), если используется вместо OpenRouter | `app/api/agent/chat/route.ts` |
| `TG_BOT_TOKEN` | ✅ | `<id>:<token>` — токен бота `broiwillwakeup_bot` | `lib/telegram.ts` |
| `TG_INVOICE_CHAT_ID` | ✅ | chat_id группы для фотоотчёта закупа. **Обязательно чистить кавычки и пробелы** — Telegram отвечает `chat not found`, читается как «бота нет в чате» | `lib/telegram.ts:cleanEnv` |
| `TG_INVOICE_THREAD_ID` | ⚙️ | id темы, если это супергруппа с темами. Без него сообщение падает в «General» | `lib/telegram.ts:invoiceThreadId` |
| `TG_PURCHASES_CHAT_ID` | ⚙️ | легаси-fallback для чата закупа | `lib/telegram.ts` |
| `TG_CHAT_ID` | ⚙️ | самый общий fallback | `lib/telegram.ts` |
| `TG_INVOICE_CAPTION` | ⚙️ | `full` — включает подробную подпись (по умолчанию `short`, только «Приход» + дата) | `lib/purchases-digest.ts` |
| `GMAIL_SCRIPT_URL` | ⚙️ | секретный URL Google Apps Script для скана накладных с МФУ | `app/api/iiko/scans/refresh/route.ts` |
| `INBOUND_SCAN_SECRET` | ✅ | секрет для `/api/inbound/scan` — единственная защита публичного вебхука | `middleware.ts` PUBLIC_API |
| `CRON_SECRET` | ✅ | `Authorization: Bearer <secret>` для `/api/telegram/purchases` (Vercel cron) | тот же |
| `RP_NAME` | ⚙️ | человекочитаемое имя для WebAuthn RP (обычно «Lokmaco») | passkey роуты |
| `NODE_ENV` | автомат | `production` → cookie `secure`, `development` → нет | `lib/auth-session.ts` |

## 5. Модули и функции

### 5.1. Auth

`lib/auth.ts` — HS256 JWT вручную (без библиотек, на `crypto.subtle`).

- `SessionPayload = { id, tgId, name, role, filialIds[], exp }`. **7 дней жизни**. ⚠️ `role` и `filialIds` зашиты в токен на момент входа: смена роли в админке не подействует до перелогина. **Филиалы** из токена НЕ используются, всегда читаются живьём из `user_filials` (см. `lib/current-filial.ts`).
- `signSession(payload)`, `verifySession(token)`. `timingSafeEqual` — сравнение подписи побайтово через XOR.

`lib/auth-session.ts` — обёртка над cookie `session_token`.

- `getSession()`, `requireSession()` — читает куку через `cookies()`.
- `setSessionCookie(payload)` — `httpOnly=true`, `secure` в проде, `sameSite=lax`, `maxAge=7*24*3600`, `path=/`.
- `clearSessionCookie()`.

`lib/access.ts` — единственная матрица ролей ↔ разделы.

- `Section` union type: `'home' | 'cashier' | 'assets' | 'analytics.pl' | ...`.
- `ACCESS: Record<Section, readonly string[] | 'all'>`.
- `canAccess(role, section): boolean`. `requireAccess(role, section, fallback)` — редиректит на `fallback`.
- ⚠️ **Матрица снята дословно с легаси** (`components/LocmacoApp.jsx` функция `hasAccess`). Своих `if (role === …)` в компонентах и API быть не должно — иначе четыре списка расползутся.
- Матрица:
  - `director`: Остатки, Услуги, Документы, Явки, Сейф, Зарплаты, P&L, Налоговый, Аналитика (без Официантов)
  - `manager`: Опись ОС + Аналитика (Обзор+Официанты)
  - `cashier`: Закрыть смену, Остатки
  - `supplier/kitchen/prep_chef/bar/hall`: Подтверждения+Остатки+Перемещение + своё
  - Опись ОС: только admin+manager. **Директору не показывать** — так в легаси.

`lib/rate-limit.ts` — общий счётчик неудач входа.

- Таблица `login_attempts (key text PK, attempts int, reset_at timestamptz)`.
- Окно 5 минут. Считает по IP и глобально `__global__`.
- `checkLoginLimit(ip)`, `noteLoginFailure(ip)`, `clearLoginFailures(ip)`.
- Пороги: IP > 5, глобально > 50.

**`middleware.ts`** — заслон.

- `PUBLIC_API` (5 роутов): `/api/auth/passkey/login/options|verify`, `/api/auth/access-code`, `/api/inbound/scan`, `/api/telegram/purchases`. Каждая проверяет **свой** секрет.
- Всё остальное `/api/*` → 401 без сессии.
- Инжектит заголовки `x-user-id/role/name/tg-id/filials` (в текущей версии их не читают, но пусть).
- Не-API: `/login`, `/`, `/tag/*` — открыты; остальное — редирект на `/login`.

### 5.2. Филиалы

`lib/current-filial.ts` — самое хрупкое место.

- **Не читать из JWT!** ⚠️ Список в токене фиксируется при входе на неделю — филиал, добавленный сегодня, не появится до перелогина.
- `getUserFilialIds()` — читает `user_filials` живьём. **Кэш 60 сек** в памяти по `session.id`. Сбрасывается из админки (`invalidateUserFilials(userId)`).
- `getCurrentFilialIds()` — фильтр по cookie `current_filial`. Если кука пустая или `all`, возвращает **все филиалы пользователя** (это по дизайну «Все филиалы»).
- `getCurrentFilialId()` — `number | 'all'` (для UI).
- `setCurrentFilialCookie(value)`.

`app/api/current-filial/route.ts` — POST `{id: number|'all'}`.

- Ключ в теле — **`id`, не `filialId`**. `Number(undefined)` → NaN → 403 «Этот филиал вам не назначен».

⚠️ **Тем же дефектом были заражены семь роутов** (закрытие смены, админрасходы, `/api/uploads`, приём перемещения, «Операции») — все переведены на `getUserFilialIds()`.

### 5.3. iiko API

**iiko XML** (`lib/iiko.ts`):
- Токен: `GET /resto/api/auth?login=<>&pass=<sha1(pass)>` → строка. Живёт 30 мин, но мы делаем logout после каждого блока.
- `iikoGet`/`iikoGetText`/`iikoPostXml` — таймаут 45 с, User-Agent обязателен (иначе 500).
- `withIikoSession(fn, creds)` — auth → fn(token) → logout. Ошибку внутри fn НЕ повторяем: середина цепочки create→save дала бы дубль документа.
- Endpoints: `corporation/stores`, `corporation/departments`, `v2/entities/list?rootType=MeasureUnit|Account|Conception|Store`, `v2/entities/products/list`, `v2/entities/products/group/list`, `v2/documents/incomingInvoice|internalTransfer|inventory|productionDocument|writeoff/import` (POST XML), `v2/reports/olap` (OLAP), `v2/cashshifts/list`.
- Кэш: `iiko_cache` (память + БД), TTL 30 мин для справочников.

**iikoWeb JSON** (`lib/iiko-web.ts` + `lib/iiko-web-docs.ts`):
- ⚠️ **Только через `lib/http1.ts`** — undici (глобальный fetch) отвечает 500 на любой запрос к iikoweb.ru. Проверено: content-length, accept-encoding, connection, тело как Buffer, form-urlencoded — всё падало. `node:https` отвечает 200. iiko XML с fetch работает нормально.
- Login: `POST /api/auth/login` или `/api/auth` с `{login,password}`. Куки из `Set-Cookie` собираем в одну строку.
- Кэш куки на 10 мин по паре `url|login` (`withIikoWebSession`).
- Юзер-агент = браузерный Chrome 120, иначе 500.
- Документы: `POST /api/documents/create` → `documentNumber`, `GET /api/documents/get/<id>?type=<TYPE>`, `POST /api/documents/save/<id>` (status DRAFT → PROCESSED).
- Типы: `INTERNAL_TRANSFER`, `INVENTORY`, `PRODUCTION_DOCUMENT`, `INCOMING_INVOICE`, `INCOMING_SERVICE` (акт услуг — **настоящий тип**, не приходная накладная с одной строкой, как было в легаси).

**`lib/filial-iiko.ts:resolveIikoCreds(filialId)`** — читает `filials.iiko_*_enc`, расшифровывает через `lib/crypto.ts:decrypt`, при пустоте падает на env-креды. Кэш 5 мин; сбрасывается со страницы филиалов. **Единая точка входа** для всех роутов, пишущих документы.

### 5.4. Матчер накладной

`lib/invoice-match.ts` (совместно с `lib/parse-invoice-photo.ts` и `app/api/iiko/parse/route.ts`).

- `matchItems(items, products)` — Jaccard по значимым словам + вхождение по длинам. `MIN_SCORE = 0.4`. Ниже — `product_id=''`, имя остаётся как в накладной; лучше пустое, чем чужое.
- `NOISE` — фасовка и единицы (`1л`, `400gr`, `шт`) не учитываются в сравнении.
- `applyPacks` — пересчёт «5 коробка × 24 = 120 шт» по `containers` из карточки iiko. Пересчёт делаем сами; модель называет только `pack`.
- `extractItems` — устойчивый парсер JSON-ответа (пробует три варианта: как есть, `{...}`, `[...]`).
- `parseInvoicePhoto` — OpenRouter multimodal `max_tokens: 4000` (иначе усечение), промпт содержит `packsHint(products)`.

### 5.5. Опись ОС и инвентаризация

**Клиент**: `app/(dashboard)/dashboard/assets/*.tsx`.

- `assets-client.tsx` — карточный и табличный виды, переключатель в `localStorage:lokmaco_assets_view`.
- `inventory-scan.tsx` — камера в трёх режимах:
  - `audit` — засчитать в обход;
  - `bind` — привязать наклейку (`targetUnitId` из списка → `pinnedId`);
  - `info` — «Что это»: показать карточку **и ничего не писать**.
- `act-modal.tsx` — акт ИНВ-3: недостача/излишки/совпало, правка реквизитов inline, кнопки «Скачать HTML/Excel», «🖨 Печать», «CSV», удаление акта.
- `audits-modal.tsx` — история обходов с фильтрами по датам, правка и удаление любого обхода.
- `batch-cost-modal.tsx` — одна цена на партию, перезаписывает всех.
- `tags-modal.tsx` — пачка QR (лист A4, 4 колонки, ≈44 мм). Печать через `document.body.classList.add('printing-tags')` + `@media print`; QR **встроенный SVG**, не `<img>` (браузер декодирует асинхронно, `window.print()` уходит сразу).
- `asset-modals.tsx` — форма карточки: 4 поля наверху + «Подробности».

**Камера** (`inventory-scan.tsx:400–530`):
- `navigator.mediaDevices.getUserMedia({video:{facingMode, width:{ideal:1920}, height:{ideal:1080}}})`. `ideal`, не `exact` — иначе на ноутбуке нет задней камеры и падает.
- Декодер: `BarcodeDetector` (Chromium) или `jsQR`. jsQR читает **центр кадра 72% без сжатия**, каждый третий кадр — целиком до 800px.
- ⚠️ Прежний путь «весь кадр → 640px» на iPhone 480p давал 2–3 px/модуль QR — ниже порога jsQR. Штатная камера айфона снимает в полном разрешении, поэтому «сайт не читает, айфон читает».
- Ошибки переведены по `e.name`: `NotAllowedError` → «Разреши камеру», `NotReadableError`, `NotFoundError`, `OverconstrainedError`, `SecurityError`. Прежде отказ был **невидим** — чёрный экран.
- `resolve(raw)` — принимает и код `LKM-XXXX` (из URL `…/tag/LKM-0001`), и **инв. номер** (стикер предмета несёт `…/tag/INV-INV-2147`). Молчание запрещено: непонятный QR → «не найдено в базе».

**API**: `app/api/assets/*/route.ts`.

- `/api/assets` — GET (по филиалам), POST, PUT (`action: 'audit' | 'set_cost' | undefined`), DELETE. `spreadCostOverBatch` при удалении экземпляра партии раскладывает его стоимость по оставшимся.
- `/api/assets/split` — POST `{id, count?, add?}`. `count` — разбить, `add` — дописать. Стоимость раскладывается заново (см. `context.md`).
- `/api/assets/tags` — GET/POST/PATCH/DELETE. ⚠️ **Нумерация `LKM-XXXX` глобальна на всю базу** (первичный ключ), не per-filial.
- `/api/assets/locations` — CRUD, per-filial.
- `/api/assets/sync` — GET, сверка с iiko. Ищет по `invNumber`/`baseInvNumber`/`serialNumber`. Обновляет `initialCost` только если было 0. Заводит новые с `source='iiko'`, `filialId = current`.
- `/api/assets/audits` — GET (история + открытый), POST (начать), PATCH (закрыть или `action: 'update_meta'` для правки шапки), DELETE (бросить). ⚠️ **Ненайденное считает сервер** при закрытии, не браузер. Снимок несёт `cost` и `code`: акт подписан и не должен пересчитываться при правке карточки.

### 5.6. Хранилище файлов

`lib/storage.ts`:
- Приватный бакет `invoices` в Supabase Storage.
- Путь: `<filialId>/<yyyy-mm-dd>/<uuid>-<kind>.<ext>`. `kind` ∈ `goods|invoice|item|collage`.
- `isPathAllowed(path, filialIds)` — regex + первый сегмент проверяется в списке филиалов.
- Все fetch: `cache: 'no-store'`. Иначе Next кэширует внутри роутов, и удалённое фото продолжает отдаваться.
- ⚠️ `SUPABASE_KEY` — anon; под бакет заведены три политики `lokmaco_invoices_anon_(insert|select|delete)` с `bucket_id='invoices'`.

`/api/uploads` — POST multipart (kind, file) → путь. `MAX_PHOTO_BYTES=3MB`, типы `jpeg|webp|png`.
`/api/uploads/[...path]` — прокси GET/DELETE. Проверяет `isPathAllowed`.

### 5.7. Telegram

`lib/telegram.ts`:
- `token()` — `TG_BOT_TOKEN` из env.
- `purchasesChatId()` — `TG_INVOICE_CHAT_ID` → `TG_PURCHASES_CHAT_ID` → `TG_CHAT_ID` (первое непустое).
- `invoiceThreadId()` — id темы супергруппы. Без него сообщение падает в «General».
- `cleanEnv(name)` — чистит кавычки/пробелы. Раньше `chat not found` из-за них ловили часами.
- `sendMessage(chatId, text)` — HTML parse_mode.
- `sendPhoto(chatId, photo, caption)` — одиночник.
- `sendPhotoAlbum(chatId, photos, caption)` — ⚠️ **`sendMediaGroup` требует 2–10 вложений**. Одиночку шлём через `sendPhoto`. Больше 10 режем на пачки, подпись только у первой.
- `esc(s)` — HTML-экранирование.

`lib/purchases-digest.ts`:
- `sendInvoicePhotos(row)` — фотоотчёт по одному приходу, ставит `details.tg_sent_at`.
- `sendPurchasesDigest(filialIds, day)` — вечерняя сводка (не отправляет уже отправленное).
- Порядок вложений: сначала `invoice`, потом `collage`, если коллажа нет — `item|goods`.

**Cron**: `/api/telegram/purchases` в 18:00 UTC (23:00 по Ташкенту) — `Authorization: Bearer $CRON_SECRET`.

### 5.8. Расчёты

- `lib/pnl.ts` — формула ежемесячной сверки. ⚠️ **Ровно как в легаси**. iiko отдаёт выручку за день целиком (без разбивки по PayTypes). «Наличные −» = `payments.cash + payments.encashment + total_expenses`. Первая версия v2 (`analytics/cash-reconciliation`, удалена) сверяла по типам оплаты — миллионы расхождения.
- `lib/wages.ts` — зарплаты.
- `lib/safe.ts` — сейф.
- `lib/tax-report.ts` — налоговый отчёт.
- `lib/liquidity.ts` — балансы + OLAP (движение остатков).
- `lib/menu-analytics.ts` — ABC по блюдам.

### 5.9. Клиентские хелперы

- `components/sortable.tsx` — `useSort`, `SortTh`. Первый клик = **убывание** (в отчётах ищут «у кого больше»). `valueRef` внутри — иначе пересортировка на каждом рендере.
- `components/stack-table.tsx` — обёртка любой таблицы. На `≤768px` каждая ячейка получает `data-label` из `thead th` через `MutationObserver`. Стек в столбик через CSS.
- `lib/stores-client.ts` — общий кэш складов на вкладку: три этажа (модульный кэш → in-flight promise → sessionStorage). Проп `initial` разрешает страницу рендерить со списком без промежуточного «Загрузка…».
- `components/mobile-chrome.tsx` — мобильный tabbar снизу (4 раздела + «Ещё» шторкой), topbar сверху с филиалом и аватаром. `@media (max-width: 768px)` скрывает `.app-sidebar` целиком.

## 6. Схема БД

Реальный хост — Supabase. Локально — Postgres 16 Homebrew.
**База общая с легаси** (`web_lokmaco3`): часть таблиц читают/пишут оба сайта.

⚠️ **Правило**: перед DDL проверять все легаси-пути (`../web_lokmaco3/lib/supabase.js`, `../web_lokmaco3/app/api/**/route.js`) — легаси-инсерт не должен упасть. Отсюда `DEFAULT`-ы на новых колонках.

| Таблица | Общая с легаси? | Ключ | Что |
|---|---|---|---|
| `bot_users` | ✅ (пишет легаси) | `id` | Сотрудники. `tg_id bigint UNIQUE`, `name`, `role`, `access_code`, `last_login_at`, `last_login_method` |
| `user_filials` | v2 | `(user_id, filial_id)` | Кто в каких филиалах. FK на `users.id`/`filials.id` CASCADE |
| `user_passkeys` | ✅ | `id uuid` | WebAuthn ключи. `credential_id text UNIQUE`, `public_key`, `counter bigint`, `rp_id text NULL` (у легаси всегда NULL — ключ привязан к домену через host на момент регистрации) |
| `filials` | v2 | `id` serial | Точки. `name`, `iiko_server/login/password_enc`, `iiko_web_url/login/password_enc`, `iiko_org_id`, `timezone` (default `Asia/Tashkent`). ⚠️ В проде: `1 = Fergana`, `2 = Pipls samarkand` |
| `bot_actions` | ✅ (пишет и легаси) | `id bigserial` | Общий лог документов: `filial_id`, `tg_id`, `user_name`, `action_type` (`cash|invoice|transfer|inventory|production|writeoff|services|asset_audit|asset_split|asset_batch_cost|assets_sync_iiko|asset_tags_create|asset_tag_bind|asset_tag_unbind|asset_tags_delete|asset_location_create|asset_create|asset_update|asset_delete|LOGIN_PASSKEY|LOGIN_ACCESS_CODE`), `document_number`, `details jsonb`, `created_at`. Индексы: `(filial_id, action_type, created_at)`, `(created_at)` |
| `cash_reports` | v2 | `id bigserial` | Отчёты кассира: `reported_cash`, `iiko_cash`, `difference` (bigint) |
| `pending_transfers` | v2 | `id uuid` | Незакрытые перемещения (создатель — принимающий). Статусы `pending|accepted|rejected` |
| `assets` | ✅ (легаси инсертит без `filial_id`) | `id uuid` | Опись ОС: `inv_number`, `name`, `category`, `location text` (легаси-текст), `location_id uuid` (наш справочник), `responsible_person`, `quantity`, `initial_cost numeric`, `commissioning_date date`, `status` (`in_use|repair|in_stock|written_off|sold|archived`), `serial_number` (код iiko), `notes`, `photo_url`, `source` (`iiko|manual`), `filial_id int NOT NULL DEFAULT 1` (см. `20260912_assets_filial.sql`), `last_inventoried_at`, `created_at`, `updated_at`. Индекс `(filial_id)` |
| `asset_locations` | ✅ | `id uuid` | Места: `name`, `note`, `sort_order`, `filial_id int NOT NULL DEFAULT 1` |
| `asset_tags` | ✅ | `code text PK` (`LKM-XXXX`) | Наклейки: `asset_id uuid NULL` (свободна), `batch text`, `bound_at`, `bound_by`, `filial_id int NOT NULL DEFAULT 1`. ⚠️ `code` глобален — нумерация продолжается по всей базе |
| `asset_audits` | v2 | `id uuid` | Обход как документ: `filial_id`, `location_id`, `started_by`, `started_at`, `finished_at`, `act_date date`, `performed_by text`, `scanned jsonb`, `missing jsonb`, `surplus jsonb`, `note`. `scanned`/`missing`/`surplus` — снимки `{id, inv_number, name, code, cost}` |
| `login_attempts` | v2 | `key text PK` | Rate limit: `attempts int`, `reset_at timestamptz` |
| `iiko_cache` | v2 | `(key, filial_id)` | Общий кэш ответов iiko: `payload jsonb`, `updated_at` |
| `scan_inbox` | v2 | `id bigserial` | Сканы накладных с МФУ: `filial_id`, `from_email`, `subject`, `photo_path`, `parsed jsonb`, `parse_error`, `status` (`new|used|dismissed`), `created_at`, `handled_at`, `handled_by` |

### Ручные DDL

Применяются вручную, не через drizzle-kit (потому что база общая с легаси):
- `db/sql/20260810_asset_audits.sql` — создание `asset_audits`.
- `db/sql/20260905_asset_audit_act.sql` — колонки `act_date`, `performed_by`, `surplus`.
- `db/sql/20260912_assets_filial.sql` — `filial_id` в `assets`/`asset_tags`/`asset_locations` (NOT NULL DEFAULT 1).

Правило: **применить к локалке → к проду тем же путём** (`node -e` с pg или psql). Проверить вставкой через drizzle с той же схемой, тестовую строку удалить.

## 7. Внешние API

### 7.1. iiko XML API (Server)

- База: `https://the-lokmako.iiko.it` (Fergana), `https://pipls-samarkand.iiko.it` (Samarkand). Хранится в `filials.iiko_server`.
- Авторизация: `GET /resto/api/auth?login=<login>&pass=<sha1(password)>` → 200 text/plain с токеном.
- Кука: `Cookie: key=<token>` на всех запросах.
- Logout: `GET /resto/api/logout?key=<token>`.
- Endpoints (используются): `corporation/stores`, `corporation/departments`, `v2/entities/list?rootType=<>`, `v2/entities/products/list`, `v2/entities/products/group/list`, `v2/documents/<TYPE>/import`, `v2/reports/olap`, `v2/cashshifts/list`.
- Особенности:
  - `User-Agent` браузерный обязателен, иначе 500.
  - Таймаут 45 с; повисший сервер съедает Vercel-лимит.
  - Пароль сохраняется как SHA-1 на стороне iiko.

### 7.2. iikoWeb JSON API

- База: `https://the-lokmako.iikoweb.ru`.
- ⚠️ **Транспорт**: `node:https` через `lib/http1.ts`. Global fetch (undici) → **500 на всё**.
- Login: `POST /api/auth/login` (или `/api/auth`) с `{login,password}` → 200 + `Set-Cookie`.
- Документы: `POST /api/documents/create` → `{data:{id,documentNumber}}`, `GET /api/documents/get/<id>?type=<TYPE>`, `POST /api/documents/save/<id>` (status DRAFT → PROCESSED).
- Типы:
  - `INTERNAL_TRANSFER` — перемещение (`storageFrom`, `storageTo`, `items[]`).
  - `INVENTORY` — акт инвентаризации склада.
  - `PRODUCTION_DOCUMENT` — акт приготовления. `accountFrom = accountTo = KITCHEN_PREP_STORE`.
  - `INCOMING_INVOICE` — приход накладной.
  - `INCOMING_SERVICE` — акт услуг. `revenueAccount` на документе, `department`, `revenueCreditAccount`, `store`.
- Формат строки: `{product, amount, count, containerId, unitName, isDeleted}`. Для акта услуг у строки ещё `account`, `sum`.
- Кэш кук: 10 мин по паре `url|login`.
- ⚠️ Ошибку `withIikoWebSession(fn)` наружу отдаём как есть и НЕ повторяем (в середине cycle create→save дал бы второй документ).
- ⚠️ Три id — **Fergana-only**: `IIKO_DEPARTMENT`, `IIKO_KITCHEN_PREP_STORE`, `IIKO_STORE_NUM`. В Samarkand они не существуют. **Не переносить в env** — в карточку филиала колонками с fallback (не сделано, TODO).

### 7.3. OpenRouter

- База: `https://openrouter.ai/api/v1/chat/completions`.
- Auth: `Authorization: Bearer $OPENROUTER_API_KEY`.
- Модель по умолчанию: `google/gemini-2.5-flash`.
- ⚠️ **`max_tokens: 4000`** — без него ответ-JSON усекается посередине.
- Multimodal: image_url data URL или прямой URL (мы кладём data URL из base64).
- Транскрибация: multipart через `image_url` (в Gemini аудио идёт как медиа).
- ⚠️ **`looksLikeSpeech(bytes)`** — проверка перед вызовом модели: коэффициент вариации энергии по кадрам > 0.35. Иначе на чистом синусе Gemini уверенно выдумывает накладную.

### 7.4. Telegram Bot API

- База: `https://api.telegram.org/bot$TG_BOT_TOKEN`.
- Endpoints: `/sendMessage`, `/sendPhoto` (multipart), `/sendMediaGroup` (multipart).
- ⚠️ **`sendMediaGroup` требует 2–10** вложений. Одиночник → `sendPhoto`. Больше 10 → пачки по 10, подпись только у первой.
- ⚠️ `caption` у альбома видит только первое фото. Собираем весь текст в одну подпись, режем до 1024 байт.
- ⚠️ `chat_id` может приехать с кавычками/пробелами → `chat not found` (читается как «бота нет»). Всегда через `cleanEnv()`.
- Темы супергрупп: без `message_thread_id` сообщение падает в «General».

### 7.5. Google Apps Script (Gmail-форвардер)

- Секретный URL из env `GMAIL_SCRIPT_URL`. Скрипт лежит в аккаунте Асиля, файл `scripts/gmail-scan-forwarder.gs` (в этом репо — эталон).
- Запрос: `has:attachment newer_than:2d in:anywhere`. **Без `-label:`** — Gmail label per-thread, а принтер шлёт всё одной темой.
- Дедуп per-message в `PropertiesService` (`lokmaco_seen_messages`, 7 дней).
- Триггер: 1 мин (минимум Google). Плюс кнопка «Проверить почту» на странице прихода → `/api/iiko/scans/refresh` → GMAIL_SCRIPT_URL.
- Скрипт POST-ит на `/api/inbound/scan?secret=$INBOUND_SCAN_SECRET` multipart с вложением.

### 7.6. Supabase Storage

- REST: `https://<ref>.supabase.co/storage/v1/object/invoices/<path>`.
- Auth: `apikey` + `Authorization: Bearer <key>` (оба одинаковые для anon).
- Методы: POST (upload), GET (download), DELETE.
- Приватный бакет; наружу — только через прокси `/api/uploads/<path>` с проверкой филиала.

### 7.7. Anthropic (опционально)

- База: `https://api.anthropic.com/v1/messages`.
- Модель: последняя из семейства Claude Opus (см. код `app/api/agent/chat/route.ts`).
- Используется для ассистента; можно поменять на OpenRouter, если `ANTHROPIC_API_KEY` не задан.

## 8. Бизнес-логика (сценарии)

### 8.1. Вход

1. Открытие `/login` → форма кода.
2. `POST /api/auth/access-code {code}`:
   - `checkLoginLimit(ip)` → 429, если > 5.
   - `getUserByAccessCode(code)` из `bot_users`. Минимум 4 символа. Легаси-совместимо.
   - Если `role='director'` и на этом домене есть passkey (`getUsablePasskeys` фильтрует по хосту) — отбить 403 «Используйте Face ID». Ключи со старого сайта работают только там, где созданы.
   - `getUserFilials(id)`, `setSessionCookie({id,tgId,name,role,filialIds})`, `updateLastLogin`, `clearLoginFailures`.
3. Или passkey: `/api/auth/passkey/login/options` → `startAuthentication` в браузере → `/verify`.

### 8.2. Смена филиала

1. Клик в шторке → `POST /api/current-filial {id: 2}`.
2. `getUserFilialIds()` (кэш минуту) проверяет право.
3. `setCurrentFilialCookie(2)` → cookie `current_filial=2` maxAge 30 дней.
4. `router.refresh()` — SSR перечитывается с новой кукой.

### 8.3. Закрытие смены

1. `dashboard/cashier` → форма: выручка по типам оплат, расходы, зарплаты сотрудников, инкассация, комментарий.
2. `POST /api/cashier/submit`:
   - `getCurrentFilialIds()`, `resolveIikoCreds(filialId)`.
   - Создаёт документы в iiko (расходы/списания), считает `total_sales/total_expenses/difference`.
   - `logAction('cash', ...)` → `bot_actions`.
3. История доступна в `dashboard/history`.

### 8.4. Приход накладной

1. `dashboard/invoice` → форма: поставщик, склад, обязательное **фото накладной** (`InvoicePhotos`), позиции руками через `product-picker`, на каждой позиции опциональная кнопка «фото товара» (`ItemPhoto`).
2. Фото жмётся до 1600px клиентом → `POST /api/uploads` (multipart) → путь.
3. `POST /api/iiko/invoice`:
   - Проверка роли (`admin|director|supplier`) и склада (`role='bar:<storeId>'`).
   - ⚠️ **Фото накладной обязательно** — проверка до отправки в iiko.
   - `submitDocument({type:'INCOMING_INVOICE', ...})` (iikoWeb).
   - `logAction('invoice', ...)` с `photos`, `items_without_photo`, `photos_complete`.
   - `sendInvoicePhotos(row)` **сразу** (не ждём) — если не ушло, вечерний cron доберёт по `tg_sent_at`.
4. Cron 18:00 UTC → `sendPurchasesDigest(filialIds, today)` → рассылка того, что не отправилось.

### 8.5. Оклейка ОС

1. `dashboard/assets` → раскрыть партию → 📷 у экземпляра без наклейки.
2. Открывается сканер в режиме `bind` с `targetUnitId`; на кадре «→ №N из M».
3. Скан наклейки → `PATCH /api/assets/tags {code, asset_id}` → `boundAt`, `boundBy` заполняются.
4. Оптимистичный UX; «✓ сохранено» — только после ответа сервера.
5. Партия? Прицел переезжает на следующий неоклеенный. Одиночка? Камера закрывается через 1.2 с.

### 8.6. Инвентаризация

1. `dashboard/assets` → «📷 Обход».
2. Форма: дата инвентаризации, кто проводит, место (или «Всё»). `POST /api/assets/audits {location_id, act_date, performed_by}` → `assetAudit.id`.
3. Сканирование — буферизуется в `localStorage:asset-audit-<id>`.
4. «Закрыть обход» → `PATCH /api/assets/audits {id, scanned:[ids]}`:
   - Сервер считает `scope` = `assets` этого филиала - archived - (locationId ? only that : all).
   - `scanned = scope ∩ scannedSet`, `missing = scope \ scannedSet`, `surplus = scannedSet \ scope`.
   - Снимок: `{id, inv_number, name, code = serial_number, cost = initial_cost}`.
   - `lastInventoriedAt = now()` у всех отсканированных.
   - `logAction('asset_audit', ...)`.
5. Модалка акта открывается автоматически.
6. Печать/скачивание: `downloadInv3HtmlFile`, `downloadInv3ExcelFile`, `printInv3Window` (ИНВ-3), `downloadCsv` (простой).
7. Правка реквизитов inline: `PATCH /api/assets/audits {id, action:'update_meta', act_date, performed_by, note, location_id}`.
8. Удаление: `DELETE /api/assets/audits?id=<>`.

### 8.7. Ежемесячная сверка

`dashboard/reconciliation` → выбор месяца → OLAP + `cash_reports` за период → формула `lib/pnl.ts`. Ровно как в легаси (см. предупреждение).

## 9. Деплой

- **Vercel**, регион `bom1` (Мумбаи). Ближе всего к Ташкенту, латентность до Supabase (ap-south) ~30 мс.
- Ветки: локальный `main` в `web_lokmaco_v2` не используется; работаем в `v2-rewrite`, пушим в **два ремоута**:
  - `origin` (`github.com/asilJPG/lokmaco-web-v2.git`) → ветка `v2-rewrite` (не подключена к Vercel).
  - `v2origin` (`github.com/asilJPG/lokmaco-web-v2.git`) → `v2-rewrite:main` — эта ветка триггерит Vercel.
- Команда пуша: `git push origin v2-rewrite && git push v2origin v2-rewrite:main`.
- **Домен**: `lokmaco-web-v2.vercel.app`. ⚠️ Passkey привязан к домену через `rpID` = хостнейм. **Смена домена = потеря Face ID у всех**. На 2026-08-12 было 12 ключей, 11 от старого сайта (`rp_id = NULL`) + 1 на v2.vercel.app.
- Секреты — в переменных окружения Vercel (см. раздел 4).
- Cron `/api/telegram/purchases` в 18:00 UTC = 23:00 по Ташкенту, `Authorization: Bearer $CRON_SECRET`.

**Легаси**: `web_lokmaco3` (репо `github.com/asilJPG/Lokmaco_web.git`), деплой отдельный на другой домен. **Общая база**. Правила совместимости — см. раздел 11.

**Локальный запуск**:
```bash
DATABASE_URL=postgres://$(whoami)@localhost:5432/lokmaco_v2 npm run dev -- -p 3100
```

## 10. Известные проблемы и ограничения

| Проблема | Обход/статус |
|---|---|
| `IIKO_DEPARTMENT`, `IIKO_KITCHEN_PREP_STORE`, `IIKO_STORE_NUM` — Fergana-only | Первый акт услуг/приготовление в Samarkand → 502. Нужен перенос в `filials` колонками с fallback. TODO |
| Passkey привязан к домену | При смене домена — регистрировать заново всем. Порядок: сначала домен, потом ключи |
| 7 клиентских путей игнорировали ответ сервера | (кассир, закрытие обхода, удаление фото прихода, скан use/dismiss, logout, удаление админрасхода) — плюс частичная непоправленная зона: логи в консоли есть, но пользователь не видит ошибок. TODO |
| Флешлайт `torch` только Chromium (Android) | На iPhone не показывается. Проверка через `getCapabilities().torch` |
| `BarcodeDetector` только Chromium | На iPhone фолбэк на `jsQR` — работает, чуть медленнее |
| `getUserMedia` только https | Локально работает на `localhost` (secure context). На IP-адресах — нет |
| iikoWeb requires `node:https` | Fixed через `lib/http1.ts` — не убирать |
| Матчер накладной может дать ложные попадания при `MIN_SCORE=0.4` | Всегда показывать пользователю `as_written` и `needs_review` |
| `TG_INVOICE_CHAT_ID` не установлен в проде на текущий момент — бот `broiwillwakeup_bot` не добавлен в группу закупа | Cron падает молча (`chat not found`). Прод не влияет на прочее, но фотоотчёт не уходит |
| Разбитая партия — необратима | Нельзя схлопнуть обратно. Explicit warning в UI |
| Стоимость 0 у 246 из 333 позиций (заведены руками) | Итоги акта заниженные. Кнопка «💰 Стоимость партии» решает при известной цене |
| Ручные DDL применяются вручную | Не через drizzle-kit — базa общая с легаси |
| В `assets` legacy пишет без `filial_id` → `DEFAULT 1` | Не убирать дефолт, пока легаси-сайт активен |

## 11. Важные правила

**Общие**
- Начинать ответы Асилю с «Асиль».
- `Co-Authored-By` в коммиты этого проекта **не добавлять**.
- Не редактировать `.env` из инструментов — только руками через Vercel/редактор.

**Базa (совместимость с легаси)**
- Перед любым DDL: `grep -rn "<table>" ../web_lokmaco3/lib/supabase.js ../web_lokmaco3/app/api/`. Легаси-инсерт не должен упасть.
- Новые колонки — с `DEFAULT`.
- Ручные SQL кладём в `db/sql/`, применяем через `psql` или `pg` тем же путём, что и сайт, тестовую вставку удаляем.
- Ключи `LKM-XXXX` в `asset_tags` — глобальные; нумерация продолжается по всей базе.

**Access-контроль**
- Единственная точка правды — `lib/access.ts`.
- В компонентах и API **не писать** свои `if (role === ...)`. Всегда `canAccess` / `requireAccess`.
- Скрыть пункт в меню недостаточно — страница открывается по прямой ссылке. Каждая страница зовёт `requireAccess(session?.role, '<section>', '<fallback>')`.
- Роль читаем **из сессии**, никогда из тела запроса.
- Филиалы — **живьём из `user_filials`**, не из JWT.
- Перед сужением ролей на разделе — спрашивать Асиля.

**iiko**
- Все fetch iiko отправляют браузерный User-Agent.
- iikoWeb — только через `lib/http1.ts`.
- Ошибку в середине `withIikoWebSession` НЕ повторяем.
- Кэш ответов iiko — в БД + память (`lib/iiko-cache.ts`), TTL 30 мин для справочников.
- Креды филиала расшифровываются через `IIKO_CRED_KEY` (AES-256-GCM). Пустой ключ → крах, не молчание.

**UI**
- Дизайн-система в `app/globals.css`, без Tailwind.
- CSS-переменные: `--surface`, `--surface-muted`, `--text`, `--text-muted`, `--text-faint`, `--border`, `--accent`, `--accent-soft`, `--success`, `--warning`, `--danger`. ⚠️ `--bg-card` и `--bg-pill` **не существуют** — старая копипаста, панели становятся прозрачными молча.
- Мобилка — не «сжатый десктоп». `.app-sidebar` скрыт целиком, снизу `MobileTabBar`, сверху `MobileTopBar`.
- Поля 16px/44px на мобилке (iOS зумит на фокусе меньшего шрифта).
- `.action-bar` на мобилке `position: fixed` внизу. **Внутри модального окна** используем `.modal-foot` (иначе кнопки висят поперёк формы).
- В таблицах — не прятать колонки; переливать в `xls__sub` под названием через `.only-narrow`/`.only-xs`.

**Клиентская логика**
- Ссылки из QR приходят как `.../tag/<CODE>` — `normalizeTagCode` вытаскивает `<CODE>`.
- `resolve(raw)` в сканере должен молчать только на пустой строке; иначе — `«Не найдено в базе»`.
- Кэши на клиенте: `lokmaco_assets_view`, `lokmaco_nav_open` (localStorage), `lokmaco:stores` (sessionStorage).
- Оптимистичный UX (сохранение сразу) в паре с честным подтверждением после ответа сервера («✓ сохранено» только по факту).
- Не выдумывать названия блюд, ингредиентов, поставщиков — только из iiko или ровно из макета.

**Работа с чатом**
- Перед задачей — прочитать `context.md` (200+ строк живой памяти проекта). Файл дописывать при каждом коммите с реальной находкой.
- Задачи «многосторонней инвентаризации» и «плана размещения ОС» — открытые (см. context.md, свежие записи).
- Работа в git worktree `../web_lokmaco_v2` (это, где мы сейчас); главный чекаут в `../web_lokmaco3`, там легаси. Не путать.
