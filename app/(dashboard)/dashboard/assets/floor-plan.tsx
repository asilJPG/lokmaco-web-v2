'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Asset, AssetFloorPlan, AssetLocation, AssetTag, DrawingData } from '@/db/schema';
import { baseInvNumber, unitLabel } from '@/lib/inv-number';
import { STATUS } from './asset-modals';
import { InventoryScanModal } from './inventory-scan';
import { FloorPlanEditor } from './floor-plan-editor';

const money = (n: number) => Math.round(n).toLocaleString('ru-RU');
const day = (v: string | Date | null | undefined) => (v ? new Date(v).toLocaleDateString('ru-RU') : null);
const mol = (a: Asset) => (a.responsiblePerson && a.responsiblePerson !== 'Материально-ответственное лицо' ? a.responsiblePerson : '');

type FloorPlanWithCount = AssetFloorPlan & { pinnedCount?: number };

interface FloorPlanViewProps {
  assets: Asset[];
  tags: AssetTag[];
  locations: AssetLocation[];
  onRefresh: () => Promise<void>;
  onEditAsset: (asset: Asset) => void;
  onOpenSticker: (asset: Asset) => void;
}

export function FloorPlanView({
  assets,
  tags,
  locations,
  onRefresh,
  onEditAsset,
  onOpenSticker,
}: FloorPlanViewProps) {
  const [plans, setPlans] = useState<FloorPlanWithCount[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Режим работы: 'view' (просмотр и инфо), 'place' (ручное размещение/drag)
  const [mode, setMode] = useState<'view' | 'place'>('view');
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);

  // Выбранное оборудование для размещения на карте (после клика в списке или после QR скана)
  const [pendingAsset, setPendingAsset] = useState<Asset | null>(null);
  // Выбранный маркер для просмотра деталей
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Зум и панорамирование
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Перетаскивание маркера по карте
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapCanvasRef = useRef<HTMLDivElement | null>(null);

  // Поиск и фильтр в боковой панели непривязанного оборудования
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarLocation, setSidebarLocation] = useState('all');

  const tagByAsset = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tags) if (t.assetId) m.set(t.assetId, t.code);
    return m;
  }, [tags]);

  // Загрузка списка планов
  const loadPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/assets/floor-plans');
      const json = await res.json();
      if (res.ok && json.plans) {
        setPlans(json.plans);
        if (json.plans.length > 0 && !activePlanId) {
          setActivePlanId(json.plans[0].id);
        }
      }
    } catch {
      setMsg({ ok: false, text: 'Не удалось загрузить планы этажей' });
    } finally {
      setLoading(false);
    }
  }, [activePlanId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const activePlan = useMemo(
    () => plans.find((p) => p.id === activePlanId) || null,
    [plans, activePlanId]
  );

  // Оборудование, привязанное к текущему активному плану
  const pinnedAssets = useMemo(() => {
    if (!activePlan) return [];
    return assets.filter(
      (a) => a.floorPlanId === activePlan.id && a.floorPlanX !== null && a.floorPlanY !== null && a.status !== 'archived'
    );
  }, [assets, activePlan]);

  // Непривязанное к этому плану оборудование
  const unplacedAssets = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    return assets.filter((a) => {
      if (a.status === 'archived') return false;
      if (a.floorPlanId === activePlanId) return false;
      if (sidebarLocation !== 'all' && a.locationId !== sidebarLocation) return false;
      if (!q) return true;
      return [a.name, a.invNumber, a.serialNumber, tagByAsset.get(a.id)]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [assets, activePlanId, sidebarLocation, sidebarSearch, tagByAsset]);

  // Сброс зума при переключении плана
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedAsset(null);
    setPendingAsset(null);
  }, [activePlanId]);

  // Привязка оборудования к координатам
  async function pinAsset(assetId: string, x: number, y: number) {
    if (!activePlan) return;
    try {
      const res = await fetch('/api/assets/pin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId,
          floorPlanId: activePlan.id,
          x,
          y,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: json.error || 'Ошибка привязки' });
        return;
      }
      setMsg({ ok: true, text: 'Оборудование размещено на карте' });
      setPendingAsset(null);
      await onRefresh();
      await loadPlans();
    } catch {
      setMsg({ ok: false, text: 'Сетевая ошибка' });
    }
  }

  // Отвязка оборудования от карты
  async function unpinAsset(assetId: string) {
    try {
      const res = await fetch('/api/assets/pin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, floorPlanId: null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: json.error || 'Ошибка снятия с карты' });
        return;
      }
      setMsg({ ok: true, text: 'Маркер снят с карты' });
      setSelectedAsset(null);
      await onRefresh();
      await loadPlans();
    } catch {
      setMsg({ ok: false, text: 'Сетевая ошибка' });
    }
  }

  // Удаление плана
  async function deleteCurrentPlan() {
    if (!activePlan) return;
    if (!confirm(`Удалить план «${activePlan.name}»? Маркеры оборудования будут отвязаны.`)) return;
    try {
      const res = await fetch(`/api/assets/floor-plans/${activePlan.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setMsg({ ok: false, text: 'Не удалось удалить план' });
        return;
      }
      setMsg({ ok: true, text: 'План удален' });
      const nextPlans = plans.filter((p) => p.id !== activePlan.id);
      setPlans(nextPlans);
      setActivePlanId(nextPlans[0]?.id || null);
      await onRefresh();
    } catch {
      setMsg({ ok: false, text: 'Ошибка удаления' });
    }
  }

  // Сохранение нарисованной схемы из редактора
  async function handleSaveDrawing({ name, drawingData }: { name: string; drawingData: DrawingData }) {
    if (editorMode === 'edit' && activePlan) {
      // Обновление существующей схемы
      const res = await fetch(`/api/assets/floor-plans/${activePlan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          drawing_data: drawingData,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Ошибка обновления схемы');
      }
      setEditorMode(null);
      setMsg({ ok: true, text: `Схема «${name}» обновлена` });
      await loadPlans();
    } else {
      // Создание новой схемы
      const res = await fetch('/api/assets/floor-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          plan_type: 'drawing',
          drawing_data: drawingData,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Ошибка сохранения схемы');
      }
      setEditorMode(null);
      setPlans((prev) => [json.data, ...prev]);
      setActivePlanId(json.data.id);
      setMsg({ ok: true, text: `Схема «${name}» создана` });
      await loadPlans();
    }
  }

  // Обработка клика по карте для установки маркера
  function handleMapClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!pendingAsset || !mapCanvasRef.current) return;
    const rect = mapCanvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (clickX < 0 || clickX > rect.width || clickY < 0 || clickY > rect.height) {
      return;
    }

    const x = Math.max(0, Math.min(1, clickX / rect.width));
    const y = Math.max(0, Math.min(1, clickY / rect.height));

    pinAsset(pendingAsset.id, x, y);
  }

  // Начало панорамирования (перемещение карты мышью/пальцем)
  function handleMapPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (draggingAssetId || pendingAsset) return;
    if ((e.target as HTMLElement).closest('.map-pin')) return;

    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleMapPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPan({
      x: panStartRef.current.panX + dx,
      y: panStartRef.current.panY + dy,
    });
  }

  function handleMapPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (isPanning) {
      setIsPanning(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch { /* игнор */ }
    }
  }

  // Перетаскивание маркера (Native Pointer Events)
  function handlePinPointerDown(e: React.PointerEvent, asset: Asset) {
    if (mode !== 'place') return;
    e.stopPropagation();
    setDraggingAssetId(asset.id);
    setSelectedAsset(asset);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePinPointerMove(e: React.PointerEvent, assetId: string) {
    if (draggingAssetId !== assetId || !mapCanvasRef.current) return;
    e.stopPropagation();
  }

  function handlePinPointerUp(e: React.PointerEvent, asset: Asset) {
    if (draggingAssetId !== asset.id || !mapCanvasRef.current) return;
    e.stopPropagation();
    setDraggingAssetId(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* игнор */ }

    const rect = mapCanvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dropX = e.clientX - rect.left;
    const dropY = e.clientY - rect.top;

    const x = Math.max(0, Math.min(1, dropX / rect.width));
    const y = Math.max(0, Math.min(1, dropY / rect.height));

    pinAsset(asset.id, x, y);
  }

  if (loading) {
    return <div className="card"><div className="empty-state">Загрузка планов…</div></div>;
  }

  if (plans.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🗺</div>
        <h3 style={{ margin: '0 0 8px' }}>Планы размещения ещё не созданы</h3>
        <p style={{ color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto 20px', fontSize: 14 }}>
          Нарисуйте схему помещения прямо в браузере или загрузите готовый файл плана, чтобы расставить маркеры оборудования.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setEditorMode('create')}
          >
            ✏️ Нарисовать схему
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setShowUploadModal(true)}
          >
            📷 Загрузить картинку
          </button>
        </div>

        {showUploadModal && (
          <FloorPlanUploadModal
            onClose={() => setShowUploadModal(false)}
            onUploaded={async (newPlan) => {
              setShowUploadModal(false);
              setPlans((prev) => [newPlan, ...prev]);
              setActivePlanId(newPlan.id);
              setMsg({ ok: true, text: `План «${newPlan.name}» загружен` });
            }}
          />
        )}

        {editorMode && (
          <FloorPlanEditor
            onSave={handleSaveDrawing}
            onClose={() => setEditorMode(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="floor-plan-page">
      {msg && (
        <div className={`banner ${msg.ok ? 'banner--success' : 'banner--error'}`} style={{ marginBottom: 12 }}>
          {msg.text}
        </div>
      )}

      {/* Верхняя панель: выбор плана, переключатель режимов, инструменты */}
      <div className="floor-plan-topbar">
        <div className="floor-plan-topbar__left">
          <select
            className="select"
            value={activePlanId || ''}
            onChange={(e) => setActivePlanId(e.target.value)}
            style={{ fontWeight: 700, minWidth: 200 }}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.planType === 'drawing' ? '✏️ ' : '📷 '}
                {p.name} ({p.pinnedCount || 0} ед.)
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setShowChoiceModal(true)}
            title="Добавить новый план"
          >
            ➕ Новый план
          </button>

          {activePlan?.planType === 'drawing' && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setEditorMode('edit')}
              title="Редактировать нарисованную схему"
            >
              ✏️ Редактор схемы
            </button>
          )}
        </div>

        <div className="floor-plan-topbar__right">
          <button
            type="button"
            className={`btn btn--sm ${mode === 'view' ? 'btn--primary' : ''}`}
            onClick={() => { setMode('view'); setPendingAsset(null); }}
          >
            👁 Просмотр
          </button>
          <button
            type="button"
            className={`btn btn--sm ${mode === 'place' ? 'btn--primary' : ''}`}
            onClick={() => { setMode('place'); setSelectedAsset(null); }}
          >
            📌 Размещение ({unplacedAssets.length})
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setShowScanModal(true)}
            title="Сканировать QR наклейку и поставить на карту"
          >
            📷 Скан и метка
          </button>
          <button
            type="button"
            className="btn btn--sm btn--danger btn--icon"
            onClick={deleteCurrentPlan}
            title="Удалить текущий план"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Баннер ожидания клика по карте для размещения */}
      {pendingAsset && (
        <div className="banner banner--info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            📍 <b>Нажмите на карту</b> в месте установки: <b>{pendingAsset.name}</b> ({pendingAsset.invNumber})
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setPendingAsset(null)}
          >
            Отмена
          </button>
        </div>
      )}

      {/* Основная рабочая область: карта + опциональный сайдбар неразмещенных */}
      <div className={`floor-plan-layout ${mode === 'place' ? 'is-placing' : ''}`}>
        <div
          className="floor-plan-viewport"
          ref={mapContainerRef}
          onPointerDown={handleMapPointerDown}
          onPointerMove={handleMapPointerMove}
          onPointerUp={handleMapPointerUp}
          onClick={handleMapClick}
          style={{ cursor: pendingAsset ? 'crosshair' : isPanning ? 'grabbing' : 'grab' }}
        >
          {/* Плавающий зум-тулбар */}
          <div className="floor-plan-zoom-bar">
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              title="Увеличить"
            >
              +
            </button>
            <span className="floor-plan-zoom-val">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              title="Уменьшить"
            >
              −
            </button>
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              title="Сбросить масштаб"
            >
              ↺
            </button>
          </div>

          {/* Трансформируемый холст с планом и пинами */}
          <div
            className="floor-plan-stage"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            {activePlan && (
              <div ref={mapCanvasRef} className="floor-plan-canvas">
                {activePlan.planType === 'drawing' && activePlan.drawingData ? (
                  <DrawingRenderer
                    data={activePlan.drawingData as unknown as DrawingData}
                  />
                ) : (
                  <img
                    src={activePlan.imageUrl}
                    alt={activePlan.name}
                    className="floor-plan-img"
                    draggable={false}
                  />
                )}

                {/* Маркеры на карте */}
                {pinnedAssets.map((asset) => {
                  const x = Number(asset.floorPlanX) || 0;
                  const y = Number(asset.floorPlanY) || 0;
                  const isSelected = selectedAsset?.id === asset.id;
                  const isDragging = draggingAssetId === asset.id;
                  const st = STATUS[asset.status || 'in_use'] || STATUS.in_use;
                  const tag = tagByAsset.get(asset.id);

                  return (
                    <div
                      key={asset.id}
                      className={`map-pin ${isSelected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''} ${mode === 'place' ? 'is-movable' : ''}`}
                      style={{
                        left: `${x * 100}%`,
                        top: `${y * 100}%`,
                      }}
                      onPointerDown={(e) => handlePinPointerDown(e, asset)}
                      onPointerMove={(e) => handlePinPointerMove(e, asset.id)}
                      onPointerUp={(e) => handlePinPointerUp(e, asset)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (mode === 'view') {
                          setSelectedAsset(isSelected ? null : asset);
                        }
                      }}
                    >
                      <div className="map-pin__dot" style={{ background: st.color }}>
                        <span className="map-pin__icon">📍</span>
                      </div>
                      <div className="map-pin__label">
                        {tag || asset.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Карточка информации о выбранном маркере */}
          {selectedAsset && (
            <div className="map-popover" onClick={(e) => e.stopPropagation()}>
              <div className="map-popover__head">
                <div>
                  <div className="map-popover__title">{selectedAsset.name}</div>
                  <div className="map-popover__inv">
                    {selectedAsset.invNumber}
                    {tagByAsset.get(selectedAsset.id) ? ` · 🏷 ${tagByAsset.get(selectedAsset.id)}` : ' · без наклейки'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--sm btn--icon"
                  onClick={() => setSelectedAsset(null)}
                >
                  ✕
                </button>
              </div>

              <div className="map-popover__body">
                <div className="map-popover__grid">
                  <div>
                    <span className="map-popover__label">Место:</span>{' '}
                    {(selectedAsset.locationId && locations.find((l) => l.id === selectedAsset.locationId)?.name) || selectedAsset.location || '—'}
                  </div>
                  {mol(selectedAsset) && (
                    <div>
                      <span className="map-popover__label">МОЛ:</span> {mol(selectedAsset)}
                    </div>
                  )}
                  <div>
                    <span className="map-popover__label">Стоимость:</span> {money(Number(selectedAsset.initialCost) || 0)} сум
                  </div>
                  <div>
                    <span className="map-popover__label">Обход:</span> {selectedAsset.lastInventoriedAt ? day(selectedAsset.lastInventoriedAt) : 'не сверяли'}
                  </div>
                </div>
              </div>

              <div className="map-popover__foot">
                <a
                  className="btn btn--sm"
                  href={`/dashboard/assets/${selectedAsset.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Карточка ↗
                </a>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => onOpenSticker(selectedAsset)}
                >
                  🏷 Стикер
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  onClick={() => unpinAsset(selectedAsset.id)}
                >
                  Снять с карты
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Боковая панель для режима «Размещение» */}
        {mode === 'place' && (
          <div className="floor-plan-sidebar">
            <div className="floor-plan-sidebar__head">
              <h4 style={{ margin: 0 }}>Не на карте ({unplacedAssets.length})</h4>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setMode('view')}
              >
                Готово
              </button>
            </div>

            <div className="floor-plan-sidebar__filters">
              <input
                className="input input--sm"
                placeholder="Поиск по имени, номеру…"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
              />
              {locations.length > 0 && (
                <select
                  className="select select--sm"
                  value={sidebarLocation}
                  onChange={(e) => setSidebarLocation(e.target.value)}
                >
                  <option value="all">Все места</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="floor-plan-sidebar__list">
              {unplacedAssets.map((u) => {
                const tag = tagByAsset.get(u.id);
                const isSelectedForPlace = pendingAsset?.id === u.id;
                return (
                  <div
                    key={u.id}
                    className={`unplaced-item ${isSelectedForPlace ? 'is-pending' : ''}`}
                    onClick={() => {
                      setPendingAsset(isSelectedForPlace ? null : u);
                    }}
                  >
                    <div className="unplaced-item__main">
                      <div className="unplaced-item__name">{u.name}</div>
                      <div className="unplaced-item__meta">
                        <span>{u.invNumber}</span>
                        {tag && <span> · 🏷 {tag}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`btn btn--sm ${isSelectedForPlace ? 'btn--primary' : ''}`}
                    >
                      {isSelectedForPlace ? 'Клик на карту' : 'Поставить'}
                    </button>
                  </div>
                );
              })}
              {unplacedAssets.length === 0 && (
                <div className="empty-state" style={{ padding: 20 }}>
                  Все позиции размещены
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Модальное окно выбора способа создания плана */}
      {showChoiceModal && (
        <div className="modal-backdrop" onClick={() => setShowChoiceModal(false)}>
          <div className="modal-card modal-card--sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title">➕ Создать новый план</h3>
              <button type="button" className="btn btn--sm btn--icon" onClick={() => setShowChoiceModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 16px' }}>
              <button
                type="button"
                className="btn btn--primary"
                style={{ padding: '14px 16px', fontSize: 14, justifyContent: 'flex-start', textAlign: 'left' }}
                onClick={() => {
                  setShowChoiceModal(false);
                  setEditorMode('create');
                }}
              >
                ✏️ <b>Нарисовать схему</b>
                <span style={{ display: 'block', fontSize: 12, opacity: 0.85, fontWeight: 400, marginTop: 2 }}>
                  Встроенный редактор зон и стен прямо в браузере
                </span>
              </button>
              <button
                type="button"
                className="btn"
                style={{ padding: '14px 16px', fontSize: 14, justifyContent: 'flex-start', textAlign: 'left' }}
                onClick={() => {
                  setShowChoiceModal(false);
                  setShowUploadModal(true);
                }}
              >
                📷 <b>Загрузить картинку</b>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
                  Загрузить готовый файл плана (JPG, PNG, WebP, SVG)
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно загрузки картинки плана */}
      {showUploadModal && (
        <FloorPlanUploadModal
          onClose={() => setShowUploadModal(false)}
          onUploaded={async (newPlan) => {
            setShowUploadModal(false);
            setPlans((prev) => [newPlan, ...prev]);
            setActivePlanId(newPlan.id);
            setMsg({ ok: true, text: `План «${newPlan.name}» успешно добавлен` });
          }}
        />
      )}

      {/* Редактор нарисованной схемы */}
      {editorMode && (
        <FloorPlanEditor
          initialName={editorMode === 'edit' ? activePlan?.name : ''}
          initialData={editorMode === 'edit' ? (activePlan?.drawingData as unknown as DrawingData) : null}
          onSave={handleSaveDrawing}
          onClose={() => setEditorMode(null)}
        />
      )}

      {/* Сканирование QR для мгновенного размещения */}
      {showScanModal && (
        <InventoryScanModal
          initialMode="info"
          assets={assets}
          tags={tags}
          locations={locations}
          onFinish={async () => {}}
          onBound={async () => { await onRefresh(); }}
          onClose={() => setShowScanModal(false)}
        />
      )}
    </div>
  );
}

/**
 * Рендерер нарисованной схемы помещений через SVG
 */
function DrawingRenderer({ data }: { data: DrawingData }) {
  const w = data.canvasWidth || 1200;
  const h = data.canvasHeight || 800;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="floor-plan-svg"
      style={{
        width: `${w}px`,
        height: `${h}px`,
        maxWidth: '100%',
        display: 'block',
        pointerEvents: 'none',
        borderRadius: '4px',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <defs>
        <pattern id="grid-pattern-view" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#grid-pattern-view)" />

      {(data.shapes || []).map((shape) => {
        if (shape.type === 'rect') {
          const sw = shape.width || 40;
          const sh = shape.height || 40;
          return (
            <g key={shape.id}>
              <rect
                x={shape.x}
                y={shape.y}
                width={sw}
                height={sh}
                fill={shape.fill || '#f4f4f4'}
                stroke={shape.stroke || '#999'}
                strokeWidth={2}
                rx={4}
              />
              {shape.label && (
                <text
                  x={shape.x + sw / 2}
                  y={shape.y + sh / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#222222"
                  fontSize={14}
                  fontWeight={700}
                >
                  {shape.label}
                </text>
              )}
            </g>
          );
        }

        if (shape.type === 'line') {
          return (
            <line
              key={shape.id}
              x1={shape.x}
              y1={shape.y}
              x2={shape.x2 ?? shape.x + 40}
              y2={shape.y2 ?? shape.y}
              stroke={shape.stroke || '#444'}
              strokeWidth={3}
              strokeLinecap="round"
            />
          );
        }

        if (shape.type === 'text') {
          return (
            <text
              key={shape.id}
              x={shape.x}
              y={shape.y}
              fill={shape.fill || '#222'}
              fontSize={shape.fontSize || 16}
              fontWeight={600}
            >
              {shape.text || ''}
            </text>
          );
        }

        return null;
      })}
    </svg>
  );
}

/**
 * Модальное окно загрузки графического плана помещения
 */
function FloorPlanUploadModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (plan: FloorPlanWithCount) => void;
}) {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError('');

    const url = URL.createObjectURL(f);
    setPreview(url);

    const img = new Image();
    img.onload = () => {
      setDims({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      return setError('Укажите название плана (например: «1 этаж: Главный зал»)');
    }
    if (!file) {
      return setError('Выберите файл изображения плана');
    }

    setLoading(true);
    setError('');

    try {
      // 1. Загрузка файла в Supabase Storage через /api/uploads
      const fd = new FormData();
      fd.append('kind', 'floor_plan');
      fd.append('file', file);

      const upRes = await fetch('/api/uploads', {
        method: 'POST',
        body: fd,
      });
      const upJson = await upRes.json();
      if (!upRes.ok) {
        throw new Error(upJson.error || 'Ошибка загрузки файла плана');
      }

      // 2. Создание записи плана в БД
      const planRes = await fetch('/api/assets/floor-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          plan_type: 'image',
          image_url: upJson.url,
          image_path: upJson.path,
          width: dims.width,
          height: dims.height,
        }),
      });
      const planJson = await planRes.json();
      if (!planRes.ok) {
        throw new Error(planJson.error || 'Ошибка сохранения плана');
      }

      onUploaded(planJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить план');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">📷 Загрузить файл плана помещения</h3>
          <button type="button" className="btn btn--sm btn--icon" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div className="banner banner--error">{error}</div>}

            <div className="field">
              <label className="field__label">Название плана *</label>
              <input
                className="input"
                placeholder="Например: 1 этаж (Зал), Кухня, Летняя терраса…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="field">
              <label className="field__label">Изображение плана (JPG, PNG, WebP, SVG до 10 МБ) *</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={handleFileChange}
                required
              />
            </div>

            {preview && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Размер: {dims.width} × {dims.height} px
                </div>
                <div style={{ maxHeight: 200, overflow: 'hidden', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img
                    src={preview}
                    alt="Предпросмотр"
                    style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="modal-foot">
            <button type="button" className="btn" onClick={onClose} disabled={loading}>
              Отмена
            </button>
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Загрузка…' : 'Сохранить план'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
