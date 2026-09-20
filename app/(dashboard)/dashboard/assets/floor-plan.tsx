'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Asset, AssetFloorPlan, AssetLocation, AssetTag, DrawingData } from '@/db/schema';
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

  // Режим работы: 'view' (просмотр и инфо), 'place' (размещение/перетаскивание)
  const [mode, setMode] = useState<'view' | 'place'>('view');
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);

  // Выбранное оборудование для размещения на карте (через клик в списке)
  const [pendingAsset, setPendingAsset] = useState<Asset | null>(null);
  // Выбранный маркер для просмотра деталей
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // Оптимистичные локальные оверрайды: instant UI updates без ожидания сети
  const [localOverrides, setLocalOverrides] = useState<
    Map<string, { floorPlanId: string | null; x: number | null; y: number | null }>
  >(new Map());

  // Зум и панорамирование
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Живое перетаскивание маркера (плавное движение за пальцем/курсором)
  const [dragState, setDragState] = useState<{
    assetId: string;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Состояние наведения Drag & Drop из бокового списка
  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapCanvasRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Поиск и фильтр в боковой панели
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

  // Слияние основных данных с локальными оверрайдами (для моментальной отзывчивости)
  const effectiveAssets: Asset[] = useMemo(() => {
    return assets.map((a) => {
      const override = localOverrides.get(a.id);
      if (!override) return a;
      return {
        ...a,
        floorPlanId: override.floorPlanId,
        floorPlanX: override.x !== null ? String(override.x) : null,
        floorPlanY: override.y !== null ? String(override.y) : null,
      };
    });
  }, [assets, localOverrides]);

  // Оборудование, привязанное к текущему активному плану
  const pinnedAssets = useMemo(() => {
    if (!activePlan) return [];
    return effectiveAssets.filter(
      (a) =>
        a.floorPlanId === activePlan.id &&
        a.floorPlanX !== null &&
        a.floorPlanY !== null &&
        a.status !== 'archived'
    );
  }, [effectiveAssets, activePlan]);

  // Непривязанное к этому плану оборудование
  const unplacedAssets = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    return effectiveAssets.filter((a) => {
      if (a.status === 'archived') return false;
      if (a.floorPlanId === activePlanId) return false;
      if (sidebarLocation !== 'all' && a.locationId !== sidebarLocation) return false;
      if (!q) return true;
      return [a.name, a.invNumber, a.serialNumber, tagByAsset.get(a.id)]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [effectiveAssets, activePlanId, sidebarLocation, sidebarSearch, tagByAsset]);

  const selectedAsset = useMemo(() => {
    if (!selectedAssetId) return null;
    return effectiveAssets.find((a) => a.id === selectedAssetId) || null;
  }, [effectiveAssets, selectedAssetId]);

  // Сброс зума и панорамы при переключении плана
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedAssetId(null);
    setPendingAsset(null);
    setDragState(null);
  }, [activePlanId]);

  // Автоматическое вписывание плана в экран (Fit to Screen)
  const autoFit = useCallback(() => {
    if (!mapContainerRef.current || !activePlan) return;
    const container = mapContainerRef.current;
    const cw = container.clientWidth - 48;
    const ch = container.clientHeight - 48;
    const pw = activePlan.width > 0 ? activePlan.width : 1200;
    const ph = activePlan.height > 0 ? activePlan.height : 800;

    if (cw <= 0 || ch <= 0 || pw <= 0 || ph <= 0) return;

    const scale = Math.min(cw / pw, ch / ph, 1.2);
    const z = Math.max(0.3, Math.min(2.5, Math.round(scale * 100) / 100));
    setZoom(z);

    // Центрируем
    const offsetX = Math.round((container.clientWidth - pw * z) / 2);
    const offsetY = Math.round((container.clientHeight - ph * z) / 2);
    setPan({ x: Math.max(0, offsetX), y: Math.max(0, offsetY) });
  }, [activePlan]);

  // Мгновенная оптимистичная привязка оборудования к координатам (0..1)
  const pinAsset = useCallback(
    async (assetId: string, x: number, y: number) => {
      if (!activePlan) return;

      // 1. Моментальное обновление UI
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.set(assetId, { floorPlanId: activePlan.id, x, y });
        return next;
      });
      setPendingAsset(null);
      setMsg({ ok: true, text: 'Маркер установлен на карте' });

      // 2. Фоновый запрос к серверу
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
          // Откат при ошибке
          setLocalOverrides((prev) => {
            const next = new Map(prev);
            next.delete(assetId);
            return next;
          });
          setMsg({ ok: false, text: json.error || 'Ошибка привязки' });
          return;
        }

        // Тихая фоновая синхронизация
        onRefresh();
        loadPlans();
      } catch {
        setLocalOverrides((prev) => {
          const next = new Map(prev);
          next.delete(assetId);
          return next;
        });
        setMsg({ ok: false, text: 'Сетевая ошибка' });
      }
    },
    [activePlan, onRefresh, loadPlans]
  );

  // Мгновенное снятие оборудования с карты
  const unpinAsset = useCallback(
    async (assetId: string) => {
      // 1. Оптимистичный откат в UI
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.set(assetId, { floorPlanId: null, x: null, y: null });
        return next;
      });
      setSelectedAssetId(null);
      setMsg({ ok: true, text: 'Оборудование снято с карты' });

      // 2. Фоновый запрос к серверу
      try {
        const res = await fetch('/api/assets/pin', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId, floorPlanId: null }),
        });
        const json = await res.json();
        if (!res.ok) {
          setLocalOverrides((prev) => {
            const next = new Map(prev);
            next.delete(assetId);
            return next;
          });
          setMsg({ ok: false, text: json.error || 'Ошибка снятия с карты' });
          return;
        }

        onRefresh();
        loadPlans();
      } catch {
        setLocalOverrides((prev) => {
          const next = new Map(prev);
          next.delete(assetId);
          return next;
        });
        setMsg({ ok: false, text: 'Сетевая ошибка' });
      }
    },
    [onRefresh, loadPlans]
  );

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
      const res = await fetch(`/api/assets/floor-plans/${activePlan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          drawing_data: drawingData,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка обновления схемы');

      setEditorMode(null);
      setMsg({ ok: true, text: `Схема «${name}» обновлена` });
      await loadPlans();
    } else {
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
      if (!res.ok) throw new Error(json.error || 'Ошибка сохранения схемы');

      setEditorMode(null);
      setPlans((prev) => [json.data, ...prev]);
      setActivePlanId(json.data.id);
      setMsg({ ok: true, text: `Схема «${name}» создана` });
      await loadPlans();
    }
  }

  // Клик по карте для установки выбранного маркера
  function handleMapClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!pendingAsset || !mapCanvasRef.current) return;
    const rect = mapCanvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (clickX < 0 || clickX > rect.width || clickY < 0 || clickY > rect.height) return;

    const x = Math.max(0, Math.min(1, clickX / rect.width));
    const y = Math.max(0, Math.min(1, clickY / rect.height));

    pinAsset(pendingAsset.id, x, y);
  }

  // Drag-and-Drop из боковой панели напрямую на холст плана
  function handleCanvasDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOverCanvas) setIsDragOverCanvas(true);
  }

  function handleCanvasDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOverCanvas(false);
  }

  function handleCanvasDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOverCanvas(false);

    const assetId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/asset-id');
    if (!assetId || !mapCanvasRef.current) return;

    const rect = mapCanvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dropX = e.clientX - rect.left;
    const dropY = e.clientY - rect.top;

    const x = Math.max(0, Math.min(1, dropX / rect.width));
    const y = Math.max(0, Math.min(1, dropY / rect.height));

    pinAsset(assetId, x, y);
  }

  // Панорамирование карты мышью или тачем
  function handleMapPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (dragState || pendingAsset) return;
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
    if (dragState && mapCanvasRef.current) {
      const rect = mapCanvasRef.current.getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      const dropY = e.clientY - rect.top;
      const x = Math.max(0, Math.min(1, dropX / rect.width));
      const y = Math.max(0, Math.min(1, dropY / rect.height));

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setDragState((prev) => (prev ? { ...prev, currentX: x, currentY: y } : null));
      });
      return;
    }

    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
    });
  }

  function handleMapPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragState) {
      const assetId = dragState.assetId;
      const finalX = dragState.currentX;
      const finalY = dragState.currentY;
      setDragState(null);
      pinAsset(assetId, finalX, finalY);
      return;
    }

    if (isPanning) {
      setIsPanning(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* игнор */
      }
    }
  }

  // Плавный зум колесом мыши с центром в курсоре
  function handleWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey || e.deltaY) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoom((z) => Math.max(0.3, Math.min(3, Math.round((z + delta) * 100) / 100)));
    }
  }

  // Начало перетаскивания существующего маркера
  function handlePinPointerDown(e: React.PointerEvent, asset: Asset) {
    if (mode !== 'place') return;
    e.stopPropagation();
    const x = Number(asset.floorPlanX) || 0;
    const y = Number(asset.floorPlanY) || 0;
    setDragState({
      assetId: asset.id,
      currentX: x,
      currentY: y,
    });
    setSelectedAssetId(asset.id);
    if (mapContainerRef.current) {
      mapContainerRef.current.setPointerCapture(e.pointerId);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div className="empty-state">Загрузка планов…</div>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 14 }}>🗺</div>
        <h3 style={{ margin: '0 0 8px' }}>Планы размещения ещё не созданы</h3>
        <p
          style={{
            color: 'var(--text-muted)',
            maxWidth: 500,
            margin: '0 auto 24px',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Нарисуйте схему помещений прямо в браузере или загрузите готовый файл плана, чтобы расставить маркеры
          оборудования и видеть их точное расположение.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--primary"
            style={{ padding: '12px 20px', fontSize: 14 }}
            onClick={() => setEditorMode('create')}
          >
            ✏️ Нарисовать схему
          </button>
          <button
            type="button"
            className="btn"
            style={{ padding: '12px 20px', fontSize: 14 }}
            onClick={() => setShowUploadModal(true)}
          >
            📷 Загрузить файл плана
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
        <div
          className={`banner ${msg.ok ? 'banner--success' : 'banner--error'}`}
          style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>{msg.text}</span>
          <button
            type="button"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'inherit' }}
            onClick={() => setMsg(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Верхняя панель: выбор плана, переключатель режимов, инструменты */}
      <div className="floor-plan-topbar">
        <div className="floor-plan-topbar__left">
          <select
            className="select"
            value={activePlanId || ''}
            onChange={(e) => setActivePlanId(e.target.value)}
            style={{ fontWeight: 700, minWidth: 220 }}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.planType === 'drawing' ? '✏️ ' : '📷 '}
                {p.name} ({p.id === activePlanId ? pinnedAssets.length : p.pinnedCount || 0} ед.)
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

          <button
            type="button"
            className="btn btn--sm"
            onClick={autoFit}
            title="Вписать план по размеру экрана"
          >
            🔍 По размеру
          </button>
        </div>

        <div className="floor-plan-topbar__right">
          <button
            type="button"
            className={`btn btn--sm ${mode === 'view' ? 'btn--primary' : ''}`}
            onClick={() => {
              setMode('view');
              setPendingAsset(null);
            }}
          >
            👁 Просмотр ({pinnedAssets.length})
          </button>
          <button
            type="button"
            className={`btn btn--sm ${mode === 'place' ? 'btn--primary' : ''}`}
            onClick={() => {
              setMode('place');
              setSelectedAssetId(null);
            }}
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
        <div
          className="banner banner--info"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)',
          }}
        >
          <div>
            📍 <b>Кликните на плане</b>, чтобы поставить: <b>{pendingAsset.name}</b> ({pendingAsset.invNumber})
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setPendingAsset(null)}
          >
            ✕ Отмена
          </button>
        </div>
      )}

      {/* Основная рабочая область: карта + боковая панель неразмещенных */}
      <div className={`floor-plan-layout ${mode === 'place' ? 'is-placing' : ''}`}>
        <div
          className={`floor-plan-viewport ${isDragOverCanvas ? 'is-drag-over' : ''}`}
          ref={mapContainerRef}
          onPointerDown={handleMapPointerDown}
          onPointerMove={handleMapPointerMove}
          onPointerUp={handleMapPointerUp}
          onWheel={handleWheel}
          onClick={handleMapClick}
          onDragOver={handleCanvasDragOver}
          onDragLeave={handleCanvasDragLeave}
          onDrop={handleCanvasDrop}
          style={{
            cursor: pendingAsset ? 'crosshair' : isPanning ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
        >
          {/* Плавающий зум-тулбар */}
          <div className="floor-plan-zoom-bar">
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
              title="Увеличить (+)"
            >
              +
            </button>
            <span className="floor-plan-zoom-val">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.25) * 100) / 100))}
              title="Уменьшить (−)"
            >
              −
            </button>
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              title="Сбросить масштаб (100%)"
            >
              ↺
            </button>
          </div>

          {/* Подсказка в режиме перетаскивания */}
          {isDragOverCanvas && (
            <div className="floor-plan-drop-overlay">
              <div className="floor-plan-drop-badge">🎯 Отпустите, чтобы поставить оборудование</div>
            </div>
          )}

          {/* Трансформируемый холст с планом и пинами */}
          <div
            className="floor-plan-stage"
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoom})`,
              transformOrigin: '0 0',
              willChange: isPanning || dragState ? 'transform' : 'auto',
              transition: isPanning || dragState ? 'none' : 'transform 0.12s ease-out',
            }}
          >
            {activePlan && (
              <div
                ref={mapCanvasRef}
                className="floor-plan-canvas"
                style={{
                  width: activePlan.width > 0 ? `${activePlan.width}px` : '1200px',
                  height: activePlan.height > 0 ? `${activePlan.height}px` : '800px',
                  position: 'relative',
                }}
              >
                {activePlan.planType === 'drawing' && activePlan.drawingData ? (
                  <DrawingRenderer data={activePlan.drawingData as unknown as DrawingData} />
                ) : (
                  <img
                    src={activePlan.imageUrl}
                    alt={activePlan.name}
                    className="floor-plan-img"
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block',
                      userSelect: 'none',
                    }}
                  />
                )}

                {/* Маркеры на карте */}
                {pinnedAssets.map((asset) => {
                  const isDragging = dragState?.assetId === asset.id;
                  const x = isDragging ? dragState.currentX : Number(asset.floorPlanX) || 0;
                  const y = isDragging ? dragState.currentY : Number(asset.floorPlanY) || 0;
                  const isSelected = selectedAssetId === asset.id;
                  const st = STATUS[asset.status || 'in_use'] || STATUS.in_use;
                  const tag = tagByAsset.get(asset.id);

                  return (
                    <div
                      key={asset.id}
                      className={`map-pin ${isSelected ? 'is-selected' : ''} ${
                        isDragging ? 'is-dragging' : ''
                      } ${mode === 'place' ? 'is-movable' : ''}`}
                      style={{
                        left: `${x * 100}%`,
                        top: `${y * 100}%`,
                        pointerEvents: isPanning ? 'none' : 'auto',
                      }}
                      onPointerDown={(e) => handlePinPointerDown(e, asset)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAssetId(isSelected ? null : asset.id);
                      }}
                      title={`${asset.name} (${asset.invNumber})${tag ? ` [🏷 ${tag}]` : ''}`}
                    >
                      <div className="map-pin__dot" style={{ background: st.color }}>
                        <span className="map-pin__icon">📍</span>
                      </div>
                      <div className="map-pin__label">{tag || asset.name}</div>
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
                    {tagByAsset.get(selectedAsset.id)
                      ? ` · 🏷 ${tagByAsset.get(selectedAsset.id)}`
                      : ' · без наклейки'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--sm btn--icon"
                  onClick={() => setSelectedAssetId(null)}
                >
                  ✕
                </button>
              </div>

              <div className="map-popover__body">
                <div className="map-popover__grid">
                  <div>
                    <span className="map-popover__label">Место:</span>{' '}
                    {(selectedAsset.locationId &&
                      locations.find((l) => l.id === selectedAsset.locationId)?.name) ||
                      selectedAsset.location ||
                      '—'}
                  </div>
                  {mol(selectedAsset) && (
                    <div>
                      <span className="map-popover__label">МОЛ:</span> {mol(selectedAsset)}
                    </div>
                  )}
                  <div>
                    <span className="map-popover__label">Стоимость:</span>{' '}
                    {money(Number(selectedAsset.initialCost) || 0)} сум
                  </div>
                  <div>
                    <span className="map-popover__label">Обход:</span>{' '}
                    {selectedAsset.lastInventoriedAt
                      ? day(selectedAsset.lastInventoriedAt)
                      : 'не сверяли'}
                  </div>
                </div>
              </div>

              <div className="map-popover__foot">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => onEditAsset(selectedAsset)}
                >
                  ✏️ Изменить
                </button>
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
              <div>
                <h4 style={{ margin: 0, fontSize: 14 }}>Не на карте ({unplacedAssets.length})</h4>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  💡 Перетащите на план или нажмите «Поставить»
                </div>
              </div>
              <button type="button" className="btn btn--sm" onClick={() => setMode('view')}>
                Готово
              </button>
            </div>

            <div className="floor-plan-sidebar__filters">
              <input
                className="input input--sm"
                placeholder="Поиск по названию, номеру…"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
              />
              {locations.length > 0 && (
                <select
                  className="select select--sm"
                  value={sidebarLocation}
                  onChange={(e) => setSidebarLocation(e.target.value)}
                >
                  <option value="all">Все места ({locations.length})</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
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
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', u.id);
                      e.dataTransfer.setData('application/asset-id', u.id);
                      e.dataTransfer.effectAllowed = 'copyMove';
                    }}
                    onClick={() => {
                      setPendingAsset(isSelectedForPlace ? null : u);
                    }}
                    title="Зажмите и перетащите на план, либо кликните «Поставить»"
                  >
                    <div className="unplaced-item__drag-handle">⠿</div>
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
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingAsset(isSelectedForPlace ? null : u);
                      }}
                    >
                      {isSelectedForPlace ? 'Клик на план' : 'Поставить'}
                    </button>
                  </div>
                );
              })}
              {unplacedAssets.length === 0 && (
                <div className="empty-state" style={{ padding: 24, fontSize: 13 }}>
                  ✨ Все единицы оборудования размещены на плане!
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
              <button
                type="button"
                className="btn btn--sm btn--icon"
                onClick={() => setShowChoiceModal(false)}
              >
                ✕
              </button>
            </div>
            <div
              className="modal-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 16px' }}
            >
              <button
                type="button"
                className="btn btn--primary"
                style={{
                  padding: '14px 16px',
                  fontSize: 14,
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                }}
                onClick={() => {
                  setShowChoiceModal(false);
                  setEditorMode('create');
                }}
              >
                ✏️ <b>Нарисовать схему помещения</b>
                <span
                  style={{
                    display: 'block',
                    fontSize: 12,
                    opacity: 0.85,
                    fontWeight: 400,
                    marginTop: 3,
                  }}
                >
                  Векторный редактор зон, стен и текста прямо в браузере
                </span>
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  padding: '14px 16px',
                  fontSize: 14,
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                }}
                onClick={() => {
                  setShowChoiceModal(false);
                  setShowUploadModal(true);
                }}
              >
                📷 <b>Загрузить файл изображения</b>
                <span
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    fontWeight: 400,
                    marginTop: 3,
                  }}
                >
                  Загрузить готовый чертёж или картинку (JPG, PNG, WebP, SVG)
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
          initialData={
            editorMode === 'edit'
              ? (activePlan?.drawingData as unknown as DrawingData)
              : null
          }
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
          onBound={async () => {
            await onRefresh();
          }}
          onClose={() => setShowScanModal(false)}
        />
      )}
    </div>
  );
}

/**
 * Векторный рендерер нарисованной схемы помещения
 */
const DrawingRenderer = React.memo(function DrawingRenderer({ data }: { data: DrawingData }) {
  const w = data.canvasWidth || 1200;
  const h = data.canvasHeight || 800;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="floor-plan-svg"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
        borderRadius: '6px',
        background: 'var(--surface)',
      }}
    >
      <defs>
        <pattern id="grid-view-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth="1" />
        </pattern>
        <filter id="view-room-shadow" x="-3%" y="-3%" width="106%" height="106%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.06" />
        </filter>
      </defs>

      <rect width={w} height={h} fill="url(#grid-view-pattern)" />

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
                stroke={shape.stroke || '#78909c'}
                strokeWidth={2}
                rx={6}
                filter="url(#view-room-shadow)"
              />
              {shape.label && (
                <text
                  x={shape.x + sw / 2}
                  y={shape.y + sh / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#1e293b"
                  fontSize={Math.min(18, Math.max(12, Math.round(sw / 14)))}
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
              stroke={shape.stroke || '#333333'}
              strokeWidth={4}
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
              fill={shape.fill || '#1e293b'}
              fontSize={shape.fontSize || 16}
              fontWeight={700}
            >
              {shape.text || ''}
            </text>
          );
        }

        return null;
      })}
    </svg>
  );
});

/**
 * Модальное окно загрузки графического файла плана помещения
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
      // 1. Загрузка файла в Supabase Storage
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
          <button type="button" className="btn btn--sm btn--icon" onClick={onClose}>
            ✕
          </button>
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
              <label className="field__label">Файл изображения (JPG, PNG, WebP, SVG до 10 МБ) *</label>
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
                  Разрешение: {dims.width} × {dims.height} px
                </div>
                <div
                  style={{
                    maxHeight: 200,
                    overflow: 'hidden',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
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
