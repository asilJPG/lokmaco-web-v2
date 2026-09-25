import { Section, canAccess } from './access';

export interface SectionMeta {
  id: Section;
  title: string;
  description: string;
  icon: string;
}

export interface SectionGroup {
  id: string;
  title: string;
  icon: string;
  sections: SectionMeta[];
}

/**
 * Полный структурированный каталог всех вкладок и разделов системы для галочек
 */
export const SECTIONS_CATALOG: SectionGroup[] = [
  {
    id: 'warehouse',
    title: 'Склад',
    icon: '📦',
    sections: [
      { id: 'balances', title: 'Остатки', description: 'Текущие запасы складов iiko, фильтры и выгрузка', icon: '📦' },
      { id: 'transfer', title: 'Перемещение', description: 'Создание перемещений между складами с подтверждением', icon: '🔄' },
      { id: 'transferDirect', title: 'Прямое перемещение в iiko', description: 'Проведение перемещения напрямую без согласования', icon: '⚡' },
      { id: 'invoice', title: 'Приход накладной', description: 'Ввод накладных поставщиков, фото и AI-распознавание', icon: '🚚' },
      { id: 'inventory', title: 'Инвентаризация', description: 'Внесение фактических остатков на складе в iiko', icon: '📋' },
      { id: 'production', title: 'Приготовление', description: 'Акты приготовления полуфабрикатов и заготовок', icon: '🍳' },
      { id: 'writeoff', title: 'Списание', description: 'Акты списания (бой, порча, пищевые потери)', icon: '🗑️' },
      { id: 'services', title: 'Услуги', description: 'Акты приёма услуг без товара (доставка, транспорт)', icon: '🧾' },
      { id: 'documents', title: 'Документы iiko', description: 'Журнал складских документов из iikoWeb', icon: '📑' },
      { id: 'assets', title: 'Опись основных средств (ОС)', description: 'Оборудование, мебель, инвентаризация и схемы залов', icon: '🏛️' },
    ],
  },
  {
    id: 'shift',
    title: 'Смена и подтверждения',
    icon: '🧾',
    sections: [
      { id: 'inbox', title: 'Подтверждения (Inbox)', description: 'Входящие и исходящие согласования перемещений', icon: '📨' },
      { id: 'cashier', title: 'Закрыть смену', description: 'Кассовый отчёт за день, внесение оплат и расходов', icon: '🧾' },
      { id: 'history', title: 'История смен', description: 'Журнал закрытых кассовых смен и отчётов', icon: '🗂️' },
      { id: 'attendance', title: 'Явки сотрудников', description: 'Журнал приходов и уходов сотрудников из iiko', icon: '🕒' },
    ],
  },
  {
    id: 'analytics',
    title: 'Аналитика',
    icon: '📊',
    sections: [
      { id: 'analytics', title: 'Обзор аналитики и меню', description: 'Сводные показатели и дашборд посещаемости меню', icon: '📊' },
      { id: 'analytics.pl', title: 'ОПиУ (P&L iiko)', description: 'Отчёт о прибылях и убытках по данным iiko', icon: '📈' },
      { id: 'analytics.abc', title: 'ABC-анализ блюд', description: 'Рейтинг блюд по продажам и маржинальности', icon: '🍽️' },
      { id: 'analytics.liquidity', title: 'Ликвидность', description: 'Анализ оборачиваемости и замороженных запасов', icon: '🧊' },
      { id: 'analytics.sales', title: 'Продажи по группам', description: 'Динамика продаж по категориям меню', icon: '🥗' },
      { id: 'analytics.purchases', title: 'Закупки', description: 'Динамика цен закупаемых продуктов', icon: '🏷️' },
      { id: 'analytics.waiters', title: 'Официанты', description: 'Показатели выручки и чеков по официантам', icon: '👨‍🍳' },
    ],
  },
  {
    id: 'finance',
    title: 'Финансы',
    icon: '💰',
    sections: [
      { id: 'safe', title: 'Сейф', description: 'Движение наличных средств в сейфе заведения', icon: '💰' },
      { id: 'wages', title: 'Зарплаты', description: 'Учёт выплат авансов и зарплат сотрудникам', icon: '👥' },
      { id: 'pnl', title: 'Управленческий P&L', description: 'Сводный финансовый результат ресторанов', icon: '📈' },
      { id: 'reconciliation', title: 'Отчёты кассы', description: 'Сверка фактической кассы с учётной системой', icon: '🧮' },
      { id: 'taxReport', title: 'Налоговый отчёт', description: 'Фискальные чеки и налоговые показатели', icon: '🧾' },
    ],
  },
  {
    id: 'settings',
    title: 'Администрирование и система',
    icon: '⚙️',
    sections: [
      { id: 'adminUsers', title: 'Пользователи и права', description: 'Создание сотрудников, назначение ролей и прав', icon: '👤' },
      { id: 'adminFilials', title: 'Филиалы', description: 'Настройка ресторанов и параметров подключения iiko', icon: '🏢' },
      { id: 'assistant', title: 'AI Ассистент', description: 'Искусственный интеллект для анализа данных ресторана', icon: '✨' },
    ],
  },
];

/** Плоский список всех настраиваемых секций */
export const ALL_CONFIGURABLE_SECTIONS: Section[] = SECTIONS_CATALOG.flatMap((g) => g.sections.map((s) => s.id));

/** Возвращает дефолтный набор секций для заданной роли */
export function getDefaultPermissionsForRole(role: string): Section[] {
  return ALL_CONFIGURABLE_SECTIONS.filter((sec) => canAccess(role, sec));
}
