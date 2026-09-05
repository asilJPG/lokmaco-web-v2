'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Asset, AssetLocation, AssetTag } from '@/db/schema';
import { AssetFormModal, QrStickerModal, STATUS, emptyForm, toForm, type AssetForm } from './asset-modals';
import { InventoryScanModal } from './inventory-scan';
import { TagsModal } from './tags-modal';
import { AuditsModal } from './audits-modal';
import { LocationsModal } from './locations-modal';
import { baseInvNumber, unitLabel } from '@/lib/inv-number';
import { SortTh, useSort } from '@/components/sortable';

const money = (n: number) => Math.round(n).toLocaleString('ru-RU');
/** МОЛ без дефолтной подписи: она стоит почти у всех и ничего не сообщает. */
const mol = (a: Asset) => (a.responsiblePerson && a.responsiblePerson !== 'Материально-ответственное лицо' ? a.responsiblePerson : '');
const placeOf = (a: Asset, ls: AssetLocation[]) => (a.locationId && ls.find((l) => l.id === a.locationId)?.name) || a.location || '';
const day = (v: string | Date | null | undefined) => (v ? new Date(v).toLocaleDateString('ru-RU') : null);

/** Вид оборудования: одна номенклатура iiko и все её экземпляры. */
type Kind = {
  key: string;
  base: string;
  name: string;
  units: Asset[];
  head: Asset;
  tagged: number;
  cost: number;
  lastDay: string | null;
  scannedLast: number;
};

export function AssetsClient() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tags, setTags] = useState<AssetTag[]>([]);
  const [locations, setLocations] = useState<AssetLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [search, setSearch] = useState('');
  const [place, setPlace] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  /**
   * Карточки или плоская таблица.
   *
   * Карточки group-ируют партии («Стул белый · 43 шт») — так ищут глазами с
   * телефона. Таблица показывает каждый экземпляр отдельной строкой, как в
   * экселе: с неё сверяют, сортируют по стоимости и ищут, у кого нет наклейки.
   * Выбор запоминается — за компьютером и с телефона смотрят по-разному.
   */
  const [view, setView] = useState<'cards' | 'table'>('cards');
  useEffect(() => {
    try {
      const v = localStorage.getItem('lokmaco_assets_view');
      if (v === 'table' || v === 'cards') setView(v);
    } catch { /* приватный режим — останемся на карточках */ }
  }, []);
  function switchView(v: 'cards' | 'table') {
    setView(v);
    try { localStorage.setItem('lokmaco_assets_view', v); } catch { /* не критично */ }
  }

  const [editing, setEditing] = useState<AssetForm | null>(null);
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const [scanMode, setScanMode] = useState<'audit' | 'bind' | 'info' | null>(null);
  /**
   * Оклейка одного конкретного экземпляра из списка.
   *
   * ⚠️ Это **единственный** путь к оклейке. Была ещё общая кнопка «Оклейка» с
   * лентой выбора оборудования под камерой — убрана 13.08.2026 по просьбе:
   * ею не пользовались, потому что предмет всё равно ищут в списке. Порядок
   * теперь один: нашёл в списке → 📷 → навёл на пустую наклейку.
   */
  const [bindUnit, setBindUnit] = useState<Asset | null>(null);
  /**
   * Меню действий строки — для узкого экрана.
   *
   * ⚠️ На телефоне четыре кнопки в строку не влезают, а прятать половину
   * нельзя: печать стикера и правка нужны с телефона ровно так же, как с
   * компьютера. Поэтому на узком экране остаётся камера и «⋯», а всё
   * остальное — в шторке, где у действий есть подписи и по ним не промахнёшься
   * (в частности, «Удалить» не окажется под пальцем рядом с «Изменить»).
   */
  const [rowMenu, setRowMenu] = useState<Asset | null>(null);
  const [sheet, setSheet] = useState<'tags' | 'audits' | 'places' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [splitting, setSplitting] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/assets');
      const json = await res.json();
      setAssets(json.data || []);
      setTags(json.tags || []);
      setLocations(json.locations || []);
    } catch {
      setMsg({ ok: false, text: 'Не удалось загрузить опись' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const tagByAsset = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tags) if (t.assetId) m.set(t.assetId, t.code);
    return m;
  }, [tags]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      // Архив — это не списание, а «в справочнике iiko больше нет». Держим его
      // за отдельной кнопкой, чтобы он не мешался в рабочем списке.
      if (!showArchived && a.status === 'archived') return false;
      if (place !== 'all' && a.locationId !== place) return false;
      if (!q) return true;
      return [a.name, a.invNumber, a.serialNumber, tagByAsset.get(a.id)]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [assets, search, place, showArchived, tagByAsset]);

  /**
   * Список — по видам, а не по карточкам.
   *
   * Двадцать одинаковых столов учитываются поштучно (иначе не понять, какой
   * пропал), но глазами человек ищет «стол», а не «EQ-00745-13».
   */
  const kinds = useMemo<Kind[]>(() => {
    const map = new Map<string, Asset[]>();
    for (const a of visible) {
      const key = `${baseInvNumber(a.invNumber)}|${a.name}`;
      (map.get(key) || map.set(key, []).get(key)!).push(a);
    }
    return Array.from(map.entries()).map(([key, units]) => {
      units.sort((x, y) => String(x.invNumber).localeCompare(String(y.invNumber)));
      const days = units.map((u) => (u.lastInventoriedAt ? new Date(u.lastInventoriedAt).toISOString().slice(0, 10) : '')).filter(Boolean);
      const lastDay = days.sort().slice(-1)[0] || null;
      return {
        key,
        base: baseInvNumber(units[0].invNumber),
        name: units[0].name,
        units,
        head: units[0],
        tagged: units.filter((u) => tagByAsset.has(u.id)).length,
        cost: units.reduce((s, u) => s + (Number(u.initialCost) || 0), 0),
        lastDay,
        scannedLast: lastDay
          ? units.filter((u) => u.lastInventoriedAt && new Date(u.lastInventoriedAt).toISOString().slice(0, 10) === lastDay).length
          : 0,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [visible, tagByAsset]);

  /** Плоский список экземпляров для табличного вида. */
  type Col = 'inv' | 'name' | 'place' | 'tag' | 'cost' | 'seen';
  /**
   * Таблица тоже идёт по видам, а не по экземплярам.
   *
   * Сорок три одинаковых стула сорока тремя строками — это не таблица, а
   * простыня: пролистать её, чтобы дойти до следующего предмета, нельзя.
   * Партия сворачивается в одну строку «Стул белый · 43 шт», а экземпляры
   * раскрываются по клику — там, где действительно нужно знать, какой именно.
   */
  const table = useSort<Kind, Col>(kinds, 'name', (k, key) => {
    switch (key) {
      case 'inv': return k.base || '';
      case 'place': return placeOf(k.head, locations);
      case 'tag': return k.tagged;
      case 'cost': return k.cost;
      case 'seen': return k.lastDay ? new Date(k.lastDay).getTime() : 0;
      default: return k.name || '';
    }
  });
  /** Какие партии раскрыты в таблице. Можно держать открытыми сразу несколько. */
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  function toggleRow(key: string) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  /** Место у партии одно на всех — если нет, так и пишем. */
  function placeOfKind(k: Kind): string {
    const all = new Set(k.units.map((u) => placeOf(u, locations) || '—'));
    return all.size === 1 ? [...all][0] : `разные (${all.size})`;
  }

  const live = assets.filter((a) => a.status !== 'archived');
  const taggedTotal = live.filter((a) => tagByAsset.has(a.id)).length;
  const taggedPct = live.length ? Math.round((taggedTotal / live.length) * 100) : 0;
  const lastAuditDay = live
    .map((a) => (a.lastInventoriedAt ? new Date(a.lastInventoriedAt).toISOString().slice(0, 10) : ''))
    .filter(Boolean).sort().slice(-1)[0] || null;
  const totalCost = live.reduce((s, a) => s + (Number(a.initialCost) || 0), 0);

  /** Позиции, которые ещё лежат одной карточкой на несколько штук. */
  const splittable = useMemo(
    () => assets.filter((a) => (a.quantity || 1) > 1 && baseInvNumber(a.invNumber) === a.invNumber && a.status !== 'archived'),
    [assets]
  );

  /**
   * Карточки-призраки: базовая позиция осталась рядом с экземплярами.
   *
   * След старой сверки, которая не знала про базовый номер и после разбивки
   * заводила исходную позицию заново. Такая карточка вечно висит в «не
   * найдено» — наклеить на неё нечего — и задваивает стоимость.
   */
  const ghosts = useMemo(
    () => assets.filter((a) => assets.some((u) => u.id !== a.id && baseInvNumber(u.invNumber) === a.invNumber && u.invNumber !== a.invNumber)),
    [assets]
  );

  async function save(form: AssetForm) {
    const res = await fetch('/api/assets', {
      method: form.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!res.ok) return setMsg({ ok: false, text: json.error || 'Ошибка сохранения' });
    setMsg({ ok: true, text: form.id ? 'Данные обновлены' : 'Оборудование добавлено' });
    setEditing(null);
    await load();
  }

  async function remove(a: Asset) {
    if (!confirm(`Удалить «${a.name}» (${a.invNumber}) из описи?`)) return;
    const res = await fetch(`/api/assets?id=${a.id}`, { method: 'DELETE' });
    if (!res.ok) return setMsg({ ok: false, text: 'Ошибка при удалении' });
    setMsg({ ok: true, text: 'Запись удалена' });
    await load();
  }

  async function removeGhosts() {
    if (!confirm(`Удалить ${ghosts.length} карточек-призраков? Экземпляры (…-01, -02) останутся.`)) return;
    let done = 0;
    for (const g of ghosts) {
      const res = await fetch(`/api/assets?id=${g.id}`, { method: 'DELETE' });
      if (res.ok) done++;
    }
    setMsg({ ok: true, text: `Удалено призраков: ${done}` });
    await load();
  }

  /** Закрытие обхода: и отметки в карточках, и акт — ненайденное считает сервер. */
  async function finishAudit(auditId: string, ids: string[]) {
    const res = await fetch('/api/assets/audits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: auditId, scanned: ids }),
    });
    const json = await res.json().catch(() => ({}));
    setScanMode(null);
    if (!res.ok) return setMsg({ ok: false, text: json.error || 'Не удалось закрыть обход' });
    setMsg({
      ok: json.missing === 0,
      text: json.missing === 0
        ? `Обход закрыт: всё на месте, ${json.scanned} шт.`
        : `Обход закрыт: нашли ${json.scanned}, не нашли ${json.missing} — список в «Обходах».`,
    });
    await load();
  }

  async function splitAll() {
    const units = splittable.reduce((n, a) => n + (a.quantity || 1), 0);
    if (!confirm(`Развернуть ${splittable.length} партий на ${units} карточек? Обратно не схлопнуть.`)) return;
    setSplitting(true);
    let done = 0;
    try {
      for (const a of splittable) {
        const res = await fetch('/api/assets/split', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }),
        });
        if (res.ok) done++;
      }
      setMsg({ ok: true, text: `Развёрнуто партий: ${done} из ${splittable.length}` });
      await load();
    } finally {
      setSplitting(false);
    }
  }

  /**
   * Дописать экземпляры в уже разбитую партию: разбили на 5, а их шесть.
   * Заводить шестой отдельной карточкой нельзя — у него будет свой номер, он
   * окажется вне партии, и обход посчитает его чужим предметом.
   */
  async function addUnits(k: Kind) {
    const raw = prompt(`Сколько экземпляров дописать к «${k.name}»? Сейчас в партии ${k.units.length}.`, '1');
    if (raw === null) return;
    const add = parseInt(raw, 10);
    if (!Number.isFinite(add) || add < 1) return setMsg({ ok: false, text: 'Нужно число не меньше 1' });
    const res = await fetch('/api/assets/split', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: k.head.id, add }),
    });
    const json = await res.json().catch(() => ({}));
    setMsg({ ok: res.ok, text: res.ok ? json.message : json.error || 'Не удалось дописать' });
    await load();
  }

  async function split(a: Asset) {
    if (!confirm(`Разбить «${a.name}» на ${a.quantity} экземпляров? У каждого будет своя наклейка. Обратно не схлопнуть.`)) return;
    const res = await fetch('/api/assets/split', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }),
    });
    const json = await res.json();
    setMsg({ ok: res.ok, text: res.ok ? json.message : json.error || 'Не удалось разбить' });
    await load();
  }

  async function sync() {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch('/api/assets/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) setMsg({ ok: false, text: json.error || 'Ошибка синхронизации' });
      else { setMsg({ ok: true, text: json.message }); await load(); }
    } finally {
      setSyncing(false);
    }
  }

  function exportCsv() {
    const rows: string[][] = [['Инв. №', 'Наклейка', 'Наименование', 'Место', 'Стоимость', 'Статус', 'Последний обход']];
    for (const a of visible) {
      rows.push([
        a.invNumber || '', tagByAsset.get(a.id) || '', a.name || '',
        (a.locationId && locations.find((l) => l.id === a.locationId)?.name) || '',
        String(a.initialCost ?? ''), a.status || '', day(a.lastInventoriedAt) || '',
      ]);
    }
    const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `опись-ос-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (loading) return <div className="card"><div className="empty-state">Загрузка…</div></div>;

  return (
    <div className="grid">
      {msg && <div className={`banner ${msg.ok ? 'banner--success' : 'banner--error'}`}>{msg.text}</div>}

      {/* Две камеры, и это разные действия. «Обход» засчитывает предмет в акт
          инвентаризации, «Что это» только показывает карточку и ничего не
          пишет — спрашивают чаще, чем считают. Оклейка живёт в строках списка. */}
      <div className="asset-actions">
        <button type="button" className="btn btn--primary asset-actions__main" onClick={() => setScanMode('audit')}>📷 Обход</button>
        <button type="button" className="btn asset-actions__main" onClick={() => setScanMode('info')}>ℹ️ Что это</button>
      </div>

      {/* Сводка одной строкой. Три отдельные плитки занимали на телефоне целый
          экран, и до списка приходилось скроллить — а он здесь главное. */}
      <div className="asset-summary">
        <div className="asset-summary__top">
          <div>
            <span className="asset-summary__value">{taggedTotal}</span>
            <span className="asset-summary__of"> из {live.length} оклеено</span>
          </div>
          <button type="button" className="btn btn--sm" onClick={() => setSheet('audits')}>📋 Обходы</button>
        </div>
        <div className="asset-bar">
          <div className="asset-bar__fill" style={{ width: `${taggedPct}%` }} />
        </div>
        <div className="asset-summary__facts">
          <span style={{ color: lastAuditDay ? undefined : 'var(--warning)' }}>
            📷 {lastAuditDay ? `обход ${day(lastAuditDay)}` : 'обхода не было'}
          </span>
          <span>💰 {money(totalCost)}</span>
          <span>{kinds.length} видов · {live.length} ед.</span>
        </div>
      </div>

      {/* Подсказки о том, что мешает работать. Показываются только когда есть
          что чинить — постоянные баннеры перестают читать. */}
      {locations.length === 0 && (
        <div className="banner banner--warn">
          Мест ещё нет — обход пойдёт по всему сразу.{' '}
          <button type="button" className="btn btn--sm" onClick={() => setSheet('places')}>Завести места</button>
        </div>
      )}
      {ghosts.length > 0 && (
        <div className="banner banner--warn">
          Призраки от старой разбивки: {ghosts.map((g) => g.invNumber).join(', ')} — в обходе всегда «не найдено».{' '}
          <button type="button" className="btn btn--sm btn--danger" onClick={removeGhosts}>Удалить</button>
        </div>
      )}
      {splittable.length > 0 && (
        <div className="banner banner--info">
          Партий не развёрнуто: {splittable.length} — обход не покажет, какая из единиц пропала.{' '}
          <button type="button" className="btn btn--sm" onClick={splitAll} disabled={splitting}>
            {splitting ? 'Разбиваю…' : 'Развернуть все'}
          </button>
        </div>
      )}

      {/* ⚠️ Намеренно НЕ `.action-bar`: на телефоне она прибита к низу экрана,
          и семь кнопок в ней съедали половину экрана, оставляя списку щель.
          Поиск липнет к верху, остальное — лента чипов с прокруткой вбок. */}
      <div className="asset-search">
        <input
          className="input"
          placeholder="Название, инв. номер, наклейка…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {locations.length > 0 && (
          <select className="select" value={place} onChange={(e) => setPlace(e.target.value)} style={{ width: 'auto' }}>
            <option value="all">Все места</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
      </div>

      <div className="asset-chips">
        <button
          type="button"
          className={`btn btn--sm ${view === 'table' ? 'btn--primary' : ''}`}
          onClick={() => switchView(view === 'table' ? 'cards' : 'table')}
        >
          {view === 'table' ? '▤ Таблица' : '▤ Таблицей'}
        </button>
        <button type="button" className="btn btn--sm" onClick={() => setSheet('tags')}>🏷 Наклейки</button>
        <button type="button" className="btn btn--sm" onClick={() => setSheet('places')}>📍 Места</button>
        <button type="button" className={`btn btn--sm ${showArchived ? 'btn--primary' : ''}`} onClick={() => setShowArchived((v) => !v)}>📦 Архив</button>
        <button type="button" className="btn btn--sm" onClick={() => setEditing(emptyForm())}>➕ Добавить</button>
        <button type="button" className="btn btn--sm" onClick={sync} disabled={syncing}>{syncing ? 'Импорт…' : '🔄 Из iiko'}</button>
        <button type="button" className="btn btn--sm" onClick={exportCsv}>📥 CSV</button>
      </div>

      {view === 'table' ? (
        /* ⚠️ Экселем это выглядит намеренно: строка на экземпляр, тонкая сетка,
           номера строк слева, липкая шапка и первая колонка. С такой таблицы
           сверяют и выгружают, а не «просматривают» — поэтому здесь нет
           группировки по видам, которая есть в карточках. */
        <div className="card xls-card" style={{ padding: 0 }}>
          <div className="xls-wrap">
            <table className="xls">
              <thead>
                <tr>
                  <th className="xls__rownum" />
                  <SortTh label="Инв. №" col="inv" sort={table.sort} onSort={table.toggle} className="col-inv" />
                  <SortTh label="Наименование" col="name" sort={table.sort} onSort={table.toggle} />
                  <SortTh label="Место" col="place" sort={table.sort} onSort={table.toggle} className="col-place" />
                  <SortTh label="Наклейка" col="tag" sort={table.sort} onSort={table.toggle} />
                  <SortTh label="Стоимость" col="cost" sort={table.sort} onSort={table.toggle} align="right" className="col-cost" />
                  <SortTh label="Обход" col="seen" sort={table.sort} onSort={table.toggle} className="col-seen" />
                  <th />
                </tr>
              </thead>
              <tbody>
                {table.sorted.map((k, i) => {
                  const many = k.units.length > 1;
                  const expanded = openRows.has(k.key);
                  const head = k.head;
                  const tag = tagByAsset.get(head.id);
                  const st = STATUS[head.status || 'in_use'] || STATUS.in_use;
                  return (
                    <Fragment key={k.key}>
                      <tr className={many ? 'xls__group' : undefined}>
                        <td className="xls__rownum">{i + 1}</td>
                        <td className="xls__mono col-inv">{many ? k.base : head.invNumber}</td>
                        {/* Наименование забирает к себе всё, что прячется на узком
                            экране: номер, место и МОЛ уходят второй строкой, а не
                            пропадают совсем. */}
                        <td className="xls__name">
                          {many ? (
                            <button type="button" className="xls__toggle" onClick={() => toggleRow(k.key)}>
                              <span className="xls__chev">{expanded ? '▾' : '▸'}</span>
                              <span>{k.name}</span>
                              <span className="xls__count">{k.units.length} шт</span>
                            </button>
                          ) : (
                            <span>
                              {/* Статус отдельной колонкой был мёртвым грузом: у всех
                                  позиций он «в эксплуатации». Точка появляется, только
                                  когда статус другой. */}
                              {head.status !== 'in_use' && <b style={{ color: st.color }} title={st.label}>● </b>}
                              {head.name}
                            </span>
                          )}
                          <span className="xls__sub">
                            <span className="only-narrow">{many ? k.base : head.invNumber} · {placeOfKind(k)}</span>
                            {!many && mol(head) && <span className="only-narrow"> · </span>}
                            {!many && mol(head) && <span>{mol(head)}</span>}
                            {/* На телефоне стоимость тоже переезжает сюда: колонкой
                                она не помещалась, а цифра нужна. */}
                            <span className="only-xs"> · {money(k.cost)} сум</span>
                          </span>
                        </td>
                        <td className="col-place">
                          {placeOfKind(k)}
                          {!many && mol(head) && <div className="xls__sub">{mol(head)}</div>}
                        </td>
                        {/* У партии в этой колонке готовность к обходу, а не код:
                            двадцать кодов в ячейку не влезут, а «17 из 20» — ответ
                            на единственный вопрос, который здесь задают. */}
                        <td className={`xls__mono ${many ? (k.tagged === k.units.length ? '' : 'xls__warn') : (tag ? '' : 'xls__warn')}`}>
                          {many ? `${k.tagged} из ${k.units.length}` : (tag || 'нет')}
                        </td>
                        <td className="xls__num col-cost">{money(k.cost)}</td>
                        <td className="xls__mono col-seen">{k.lastDay ? day(k.lastDay) : '—'}</td>
                        <td className="xls__acts">
                          {many ? (
                            <button type="button" className="btn btn--sm btn--icon" title="Показать экземпляры" onClick={() => toggleRow(k.key)}>
                              {expanded ? '▾' : '▸'}
                            </button>
                          ) : (
                            <>
                              {/* ⚠️ На телефоне в ячейке помещается ровно одна
                                  кнопка, поэтому там остаётся только «⋯», а
                                  «Наклеить QR» стоит первым пунктом шторки. */}
                              {!tag && (
                                <button type="button" className="btn btn--sm btn--icon btn--primary col-phone" title="Наклеить QR" onClick={() => { setBindUnit(head); setScanMode('bind'); }}>📷</button>
                              )}
                              {/* Широкий экран — кнопки в строке; узкий — «⋯» со
                                  всем тем же набором. Пропадать ничего не должно. */}
                              <button type="button" className="btn btn--sm btn--icon col-wide" title="Стикер" onClick={() => setQrAsset(head)}>🏷</button>
                              <button type="button" className="btn btn--sm btn--icon col-wide" title="Изменить" onClick={() => setEditing(toForm(head))}>✎</button>
                              <button type="button" className="btn btn--sm btn--icon btn--danger col-wide" title="Удалить" onClick={() => remove(head)}>✕</button>
                              <button type="button" className="btn btn--sm btn--icon xls__more" title="Ещё" onClick={() => setRowMenu(head)}>⋯</button>
                            </>
                          )}
                        </td>
                      </tr>

                      {many && expanded && k.units.map((u) => {
                        const utag = tagByAsset.get(u.id);
                        return (
                          <tr key={u.id} className="xls__unit">
                            <td className="xls__rownum" />
                            <td className="xls__mono col-inv">{u.invNumber}</td>
                            <td className="xls__name">
                              <span className="xls__dim">└ {unitLabel(u, assets) || u.invNumber}</span>
                              <span className="xls__sub">
                                <span className="only-narrow">{u.invNumber} · {placeOf(u, locations) || '—'}</span>
                                <span className="only-xs"> · {money(Number(u.initialCost) || 0)} сум</span>
                              </span>
                            </td>
                            <td className="col-place">{placeOf(u, locations) || '—'}</td>
                            <td className={`xls__mono ${utag ? '' : 'xls__warn'}`}>{utag || 'нет'}</td>
                            <td className="xls__num col-cost">{money(Number(u.initialCost) || 0)}</td>
                            <td className="xls__mono col-seen">{day(u.lastInventoriedAt) || '—'}</td>
                            <td className="xls__acts">
                              {!utag && (
                                <button type="button" className="btn btn--sm btn--icon btn--primary col-phone" title="Наклеить QR" onClick={() => { setBindUnit(u); setScanMode('bind'); }}>📷</button>
                              )}
                              <button type="button" className="btn btn--sm btn--icon col-wide" title="Стикер" onClick={() => setQrAsset(u)}>🏷</button>
                              <button type="button" className="btn btn--sm btn--icon col-wide" title="Изменить" onClick={() => setEditing(toForm(u))}>✎</button>
                              <button type="button" className="btn btn--sm btn--icon btn--danger col-wide" title="Удалить" onClick={() => remove(u)}>✕</button>
                              <button type="button" className="btn btn--sm btn--icon xls__more" title="Ещё" onClick={() => setRowMenu(u)}>⋯</button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
                {table.sorted.length === 0 && (
                  <tr><td colSpan={8}><div className="empty-state">Ничего не найдено</div></td></tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="xls__rownum" />
                  <td className="col-inv" />
                  <td>
                    Видов: {table.sorted.length} · единиц: {table.sorted.reduce((n, k) => n + k.units.length, 0)}
                  </td>
                  <td className="col-place" />
                  <td />
                  <td className="xls__num col-cost">{money(table.sorted.reduce((s2, k) => s2 + k.cost, 0))}</td>
                  <td className="col-seen" />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : kinds.length === 0 ? (
        <div className="card"><div className="empty-state" style={{ padding: 40 }}>Ничего не найдено</div></div>
      ) : (
        <div className="asset-list">
          {kinds.map((k) => {
            const many = k.units.length > 1;
            const expanded = open === k.key;
            const st = STATUS[k.head.status || 'in_use'] || STATUS.in_use;
            return (
              <div key={k.key} className="asset-card">
                <button type="button" className="asset-card__head" onClick={() => setOpen(expanded ? null : k.key)}>
                  <div className="asset-card__main">
                    <div className="asset-card__name">
                      {k.name}
                      {many && <span className="asset-card__count">{k.units.length} шт</span>}
                      {k.head.status === 'archived' && <span className="asset-chip">архив</span>}
                    </div>
                    <div className="asset-card__meta">
                      <span style={{ fontFamily: 'monospace' }}>{many ? k.base : k.head.invNumber}</span>
                      {!many && tagByAsset.get(k.head.id) && <span>🏷 {tagByAsset.get(k.head.id)}</span>}
                      {k.lastDay && <span>📷 {day(k.lastDay)}{many ? ` · ${k.scannedLast}/${k.units.length}` : ''}</span>}
                      {!k.lastDay && <span style={{ color: 'var(--text-faint)' }}>ни разу не сверяли</span>}
                    </div>
                    {/* Полоса оклейки — главный индикатор готовности к обходу:
                        без наклейки единицу нечем засчитать. */}
                    <div className="asset-bar asset-bar--thin">
                      <div
                        className="asset-bar__fill"
                        style={{ width: `${Math.round((k.tagged / k.units.length) * 100)}%`, background: k.tagged === k.units.length ? 'var(--success)' : 'var(--warning)' }}
                      />
                    </div>
                    <div className="asset-card__meta">
                      <span style={{ color: k.tagged === k.units.length ? 'var(--success)' : 'var(--warning)' }}>
                        наклейки {k.tagged} из {k.units.length}
                      </span>
                      <span>{money(k.cost)}</span>
                      <span style={{ color: st.color }}>{st.label}</span>
                    </div>
                  </div>
                  <span className="asset-card__chevron">{expanded ? '▲' : '▼'}</span>
                </button>

                {expanded && (
                  <div className="asset-card__body">
                    {(k.head.quantity || 1) > 1 && !many && (
                      <button type="button" className="btn btn--sm" onClick={() => split(k.head)}>
                        ✂️ Разбить на {k.head.quantity} экземпляров
                      </button>
                    )}
                    {many && (
                      <button type="button" className="btn btn--sm" onClick={() => addUnits(k)}>
                        ➕ Дописать экземпляр
                      </button>
                    )}

                    {k.units.map((u) => (
                      /* Строка экземпляра — ровно одна, даже когда их двадцать:
                         номер, наклейка, дата обхода. Всё остальное (место,
                         стоимость, МОЛ) одинаково у всей партии и живёт в шапке. */
                      <div key={u.id} className="asset-unit">
                        <span className="asset-unit__inv">{u.invNumber}</span>
                        <span className={`asset-unit__tag ${tagByAsset.has(u.id) ? 'is-bound' : ''}`}>
                          {tagByAsset.get(u.id) || 'без наклейки'}
                        </span>
                        <span className="asset-unit__seen">{u.lastInventoriedAt ? day(u.lastInventoriedAt) : '—'}</span>
                        {!tagByAsset.has(u.id) && (
                          <button
                            type="button"
                            className="btn btn--sm btn--icon btn--primary"
                            onClick={() => { setBindUnit(u); setScanMode('bind'); }}
                            title="Наклеить QR на этот экземпляр"
                          >
                            📷
                          </button>
                        )}
                        <button type="button" className="btn btn--sm btn--icon" onClick={() => setQrAsset(u)} title="Стикер">🏷</button>
                        <button type="button" className="btn btn--sm btn--icon" onClick={() => setEditing(toForm(u))} title="Изменить">✎</button>
                        <button type="button" className="btn btn--sm btn--icon btn--danger" onClick={() => remove(u)} title="Удалить">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rowMenu && (
        <RowMenu
          asset={rowMenu}
          tag={tagByAsset.get(rowMenu.id)}
          onClose={() => setRowMenu(null)}
          onBind={() => { setBindUnit(rowMenu); setScanMode('bind'); setRowMenu(null); }}
          onSticker={() => { setQrAsset(rowMenu); setRowMenu(null); }}
          onEdit={() => { setEditing(toForm(rowMenu)); setRowMenu(null); }}
          onDelete={async () => { const a = rowMenu; setRowMenu(null); await remove(a); }}
        />
      )}
      {editing && <AssetFormModal initial={editing} locations={locations} onSave={save} onClose={() => setEditing(null)} />}
      {qrAsset && <QrStickerModal asset={qrAsset} onClose={() => setQrAsset(null)} />}
      {sheet === 'audits' && <AuditsModal locations={locations} onClose={() => setSheet(null)} />}
      {sheet === 'places' && <LocationsModal onClose={() => setSheet(null)} onChanged={load} />}
      {sheet === 'tags' && <TagsModal locations={locations} onClose={() => setSheet(null)} onChanged={load} />}
      {scanMode && (
        <InventoryScanModal
          initialMode={scanMode}
          targetUnitId={bindUnit?.id}
          assets={assets}
          tags={tags}
          locations={locations}
          onFinish={finishAudit}
          onBound={load}
          onClose={() => { setScanMode(null); setBindUnit(null); }}
        />
      )}
    </div>
  );
}

/**
 * Действия строки на узком экране.
 *
 * Шторкой снизу, а не выпадающим меню: до низа экрана большой палец достаёт,
 * до середины строки в списке — нет. У каждого действия подпись, поэтому
 * «Удалить» невозможно нажать вместо «Изменить», как это было бы с четырьмя
 * иконками по 30px в ряд.
 */
function RowMenu({ asset, tag, onClose, onBind, onSticker, onEdit, onDelete }: {
  asset: Asset;
  tag?: string;
  onClose: () => void;
  onBind: () => void;
  onSticker: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="row-sheet" onClick={onClose}>
      <div className="row-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="row-sheet__head">
          <div>
            <div className="row-sheet__name">{asset.name}</div>
            <div className="row-sheet__inv">
              {asset.invNumber}
              {tag ? ` · 🏷 ${tag}` : ' · без наклейки'}
            </div>
          </div>
          <button type="button" className="btn btn--sm" onClick={onClose}>✕</button>
        </div>

        {!tag && (
          <button type="button" className="row-sheet__item" onClick={onBind}>
            <span>📷</span> Наклеить QR
          </button>
        )}
        <button type="button" className="row-sheet__item" onClick={onSticker}>
          <span>🏷</span> Стикер и печать
        </button>
        <button type="button" className="row-sheet__item" onClick={onEdit}>
          <span>✎</span> Изменить
        </button>
        <a className="row-sheet__item" href={`/dashboard/assets/${asset.id}`}>
          <span>ℹ️</span> Открыть карточку
        </a>
        <button type="button" className="row-sheet__item row-sheet__item--danger" onClick={onDelete}>
          <span>✕</span> Удалить
        </button>
      </div>
    </div>
  );
}
