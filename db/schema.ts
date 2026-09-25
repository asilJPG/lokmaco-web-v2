import { pgTable, serial, bigint, bigserial, text, integer, numeric, date, jsonb, timestamp, uuid, varchar, primaryKey, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const filials = pgTable('filials', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  iikoServer: text('iiko_server'),
  iikoOrgId: text('iiko_org_id'),
  iikoLogin: text('iiko_login'),
  iikoPasswordEnc: text('iiko_password_enc'),
  iikoWebUrl: text('iiko_web_url'),
  iikoWebLogin: text('iiko_web_login'),
  iikoWebPasswordEnc: text('iiko_web_password_enc'),
  timezone: text('timezone').notNull().default('Asia/Tashkent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('bot_users', {
  id: serial('id').primaryKey(),
  tgId: bigint('tg_id', { mode: 'number' }).notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  accessCode: text('access_code'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  lastLoginMethod: text('last_login_method'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userFilials = pgTable('user_filials', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  filialId: integer('filial_id').notNull().references(() => filials.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.filialId] }),
  byFilial: index('user_filials_filial_idx').on(t.filialId),
}));

export const userPasskeys = pgTable('user_passkeys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(),
  counter: bigint('counter', { mode: 'number' }).notNull().default(0),
  // Домен, на котором ключ зарегистрирован. WebAuthn-ключ работает только на
  // своём домене, а таблица общая с легаси-сайтом; у легаси-ключей здесь NULL.
  rpId: text('rp_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index('passkeys_user_idx').on(t.userId),
}));

export const botActions = pgTable('bot_actions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  filialId: integer('filial_id').notNull().references(() => filials.id),
  tgId: bigint('tg_id', { mode: 'number' }),
  userName: text('user_name'),
  actionType: text('action_type').notNull(),
  documentNumber: text('document_number'),
  details: jsonb('details').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byFilialType: index('bot_actions_filial_type_idx').on(t.filialId, t.actionType, t.createdAt),
  bySelectedDate: index('bot_actions_selected_date_idx').on(t.filialId, t.actionType),
  byCreated: index('bot_actions_created_idx').on(t.createdAt),
}));

export const cashReports = pgTable('cash_reports', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  filialId: integer('filial_id').notNull().references(() => filials.id),
  cashierTgId: bigint('cashier_tg_id', { mode: 'number' }),
  cashierName: text('cashier_name'),
  reportedCash: bigint('reported_cash', { mode: 'number' }).notNull().default(0),
  iikoCash: bigint('iiko_cash', { mode: 'number' }).notNull().default(0),
  difference: bigint('difference', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byFilialDate: index('cash_reports_filial_date_idx').on(t.filialId, t.createdAt),
}));

export const pendingTransfers = pgTable('pending_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  filialId: integer('filial_id').notNull().references(() => filials.id),
  creatorTgId: text('creator_tg_id').notNull(),
  creatorName: text('creator_name').notNull(),
  creatorRole: text('creator_role'),
  storeFrom: uuid('store_from').notNull(),
  storeFromName: text('store_from_name').notNull(),
  storeTo: uuid('store_to').notNull(),
  storeToName: text('store_to_name').notNull(),
  items: jsonb('items').notNull().default([]),
  comment: text('comment'),
  receiverComment: text('receiver_comment'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byFilialStatus: index('pending_transfers_filial_status_idx').on(t.filialId, t.status),
}));

// Опись основных средств. Таблица общая с легаси-сайтом и без filial_id —
// колонки описаны ровно те, что уже есть в базе, чтобы не трогать её схему.
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  invNumber: varchar('inv_number').notNull(),
  name: varchar('name').notNull(),
  category: varchar('category'),
  location: varchar('location').notNull(),
  responsiblePerson: varchar('responsible_person').notNull(),
  quantity: integer('quantity').default(1),
  initialCost: numeric('initial_cost').default('0'),
  commissioningDate: date('commissioning_date'),
  status: varchar('status').default('in_use'),
  serialNumber: varchar('serial_number'),
  notes: text('notes'),
  photoUrl: text('photo_url'),
  /**
   * Филиал. У легаси одна точка (Fergana, id=1), поэтому DEFAULT 1 стоит на
   * колонке в БД — легаси инсертит без этого поля, и без дефолта его запись
   * упала бы. У v2 два филиала и своя опись, поэтому все API фильтруют.
   */
  filialId: integer('filial_id').notNull().default(1),
  lastInventoriedAt: timestamp('last_inventoried_at', { withTimezone: true }),
  /** Место размещения. Текстовое `location` остаётся: в него пишет легаси-бот. */
  locationId: uuid('location_id'),
  /**
   * Привязка к карте размещения (плану помещения).
   * Координаты x и y сохраняются в долях (0..1) от ширины и высоты плана.
   */
  floorPlanId: uuid('floor_plan_id'),
  floorPlanX: numeric('floor_plan_x'),
  floorPlanY: numeric('floor_plan_y'),
  /**
   * Откуда карточка: `iiko` — из справочника, `manual` — завели на сайте.
   * Сверка архивирует только импортные: заведённого руками в iiko нет по
   * определению, и без признака оно уезжало бы в архив на первой же сверке.
   */
  source: text('source').notNull().default('iiko'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  byFilial: index('assets_filial_idx').on(t.filialId),
  byFloorPlan: index('assets_floor_plan_idx').on(t.floorPlanId),
}));

/**
 * Графические планы этажей и помещений для визуальной карты оборудования.
 * Хранятся per-filial.
 * planType: 'image' (загруженная картинка) или 'drawing' (нарисованная в редакторе схема).
 */
export const assetFloorPlans = pgTable('asset_floor_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  filialId: integer('filial_id').notNull().default(1),
  name: text('name').notNull(),
  imageUrl: text('image_url').notNull().default(''),
  imagePath: text('image_path').notNull().default(''),
  width: integer('width').notNull().default(0),
  height: integer('height').notNull().default(0),
  planType: text('plan_type').notNull().default('image'),
  drawingData: jsonb('drawing_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byFilial: index('asset_floor_plans_filial_idx').on(t.filialId),
}));

/** Места размещения ОС. Плоский список: «Кухня», «Бар», «Зал». */
export const assetLocations = pgTable('asset_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  note: text('note').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  /** Места у каждого филиала свои — «Кухня 1-этаж» у Ферганы это не «Кухня» у Самарканда. */
  filialId: integer('filial_id').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Универсальные QR-наклейки.
 *
 * Печатаются пачкой **пустыми** (`LKM-0001…`) и клеятся на что угодно;
 * привязка к единице происходит потом, когда предмет уже перед глазами.
 * Обратный порядок — «сгенерил под позицию → пошёл искать, к чему приклеить» —
 * и рождает путаницу, которую потом не выловить.
 */
export const assetTags = pgTable('asset_tags', {
  code: text('code').primaryKey(),
  assetId: uuid('asset_id'),
  batch: text('batch').notNull().default(''),
  boundAt: timestamp('bound_at', { withTimezone: true }),
  boundBy: text('bound_by'),
  /** Наклейка привязана к филиалу: чужие сканер не показывает и не отдаёт для оклейки. */
  filialId: integer('filial_id').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Обход инвентаризации ОС как документ: кто, когда, где, что нашёл и чего нет.
 *
 * ⚠️ Без этого от обхода оставалась только отметка `last_inventoried_at` в
 * карточке. Из неё не ответить, кто проводил и **чего не нашли**: список
 * ненайденного жил в браузере до нажатия кнопки, и закрытая вкладка стирала
 * недостачу бесследно.
 */
export const assetAudits = pgTable('asset_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  filialId: integer('filial_id').notNull(),
  /** Обходят по одному помещению за раз. NULL — обход всего сразу. */
  locationId: uuid('location_id'),
  startedBy: text('started_by').notNull().default(''),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  /**
   * Дата документа — не то же самое, что дата закрытия: обход часто закрывают
   * на следующий день, а в акте стоит дата инвентаризации.
   */
  actDate: date('act_date'),
  /** Кто проводит. Обходит кладовщик, а отвечает МОЛ — это разные люди. */
  performedBy: text('performed_by').notNull().default(''),
  /** Фиксируются в момент закрытия — это и есть акт. */
  scanned: jsonb('scanned').notNull().default([]),
  missing: jsonb('missing').notNull().default([]),
  /** Излишки: нашли то, чего в этом месте числиться не должно. */
  surplus: jsonb('surplus').notNull().default([]),
  note: text('note').notNull().default(''),
}, (t) => ({
  byFilial: index('asset_audits_filial_idx').on(t.filialId, t.startedAt),
}));

/**
 * Счётчик неудачных входов, общий для всех инстансов (см. lib/rate-limit.ts).
 * Таблица наша, легаси о ней не знает — своих вставок туда нет.
 */
export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(),
  attempts: integer('attempts').notNull().default(0),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
});

/**
 * Общий кэш ответов iiko (см. lib/iiko-cache.ts).
 *
 * Раньше справочники кэшировались обычной Map в памяти процесса. На Vercel
 * инстансов десятки и они постоянно поднимаются заново, поэтому такая Map почти
 * всегда пустая: за каждый чих платили полный круг auth + запрос в iiko. Кэш в
 * БД переживает холодный старт и общий для всех инстансов сразу.
 *
 * Таблица наша, легаси о ней не знает — своих вставок туда нет.
 * Ключ составной: один и тот же справочник у разных филиалов свой (креды и
 * сервер iiko у них разные).
 */
export const iikoCache = pgTable('iiko_cache', {
  key: text('key').notNull(),
  filialId: integer('filial_id').notNull(),
  payload: jsonb('payload').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.key, t.filialId] }),
}));

/**
 * Входящие сканы накладных: МФУ шлёт скан на почту, почтовый провайдер дёргает
 * вебхук, вложение ложится сюда и распознаётся. Снабженец потом открывает
 * готовый черновик, а не грузит файл руками.
 *
 * Таблица наша, легаси о ней не знает.
 */
export const scanInbox = pgTable('scan_inbox', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  filialId: integer('filial_id').notNull(),
  fromEmail: text('from_email'),
  subject: text('subject'),
  photoPath: text('photo_path').notNull(),
  parsed: jsonb('parsed'),
  parseError: text('parse_error'),
  /** new — ждёт оформления · used — приход создан · dismissed — отклонён. */
  status: text('status').notNull().default('new'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  handledAt: timestamp('handled_at', { withTimezone: true }),
  handledBy: text('handled_by'),
}, (t) => ({
  byFilialStatus: index('scan_inbox_filial_status_idx').on(t.filialId, t.status, t.createdAt),
}));

/**
 * События веб-аналитики электронных меню (посещения, клики по блюдам, категории).
 * Сайты: Lokmaco, Luma Garden.
 */
export const menuAnalyticsEvents = pgTable('menu_analytics_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  siteId: text('site_id').notNull(),
  eventType: text('event_type').notNull(),
  visitorId: text('visitor_id').notNull(),
  sessionId: text('session_id'),
  pagePath: text('page_path'),
  itemId: text('item_id'),
  itemName: text('item_name'),
  itemCategory: text('item_category'),
  itemPrice: numeric('item_price'),
  referrer: text('referrer'),
  deviceType: text('device_type'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  bySiteCreated: index('menu_events_site_created_idx').on(t.siteId, t.createdAt),
  bySiteTypeCreated: index('menu_events_site_type_created_idx').on(t.siteId, t.eventType, t.createdAt),
  bySiteItemCreated: index('menu_events_site_item_created_idx').on(t.siteId, t.itemName, t.createdAt),
  byVisitorCreated: index('menu_events_visitor_created_idx').on(t.visitorId, t.createdAt),
}));

export type MenuAnalyticsEvent = typeof menuAnalyticsEvents.$inferSelect;
export type NewMenuAnalyticsEvent = typeof menuAnalyticsEvents.$inferInsert;

export interface DrawingShape {
  id: string;
  type: 'rect' | 'line' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  label?: string;
  x2?: number;
  y2?: number;
  text?: string;
  fontSize?: number;
}

export interface DrawingData {
  canvasWidth: number;
  canvasHeight: number;
  shapes: DrawingShape[];
}

export type Asset = typeof assets.$inferSelect;
export type AssetFloorPlan = typeof assetFloorPlans.$inferSelect;
export type AssetLocation = typeof assetLocations.$inferSelect;
export type AssetTag = typeof assetTags.$inferSelect;
export type AssetAudit = typeof assetAudits.$inferSelect;
export type Filial = typeof filials.$inferSelect;
export type User = typeof users.$inferSelect;
export type BotAction = typeof botActions.$inferSelect;
export type CashReport = typeof cashReports.$inferSelect;
