'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { DrawingData, DrawingShape } from '@/db/schema';

// Предустановленные палитры зон с понятными названиями и иконками
export const ROOM_PRESETS = [
  { label: 'Кухня', icon: '🍳', fill: '#e8f4e8', stroke: '#7cb342' },
  { label: 'Главный зал', icon: '🍽', fill: '#e8e8f4', stroke: '#5c6bc0' },
  { label: 'Бар', icon: '☕️', fill: '#fff3e0', stroke: '#fb8c00' },
  { label: 'Склад', icon: '📦', fill: '#f4e8e8', stroke: '#e57373' },
  { label: 'Мойка', icon: '🧼', fill: '#e0f7fa', stroke: '#00acc1' },
  { label: 'Санузел', icon: '🚻', fill: '#f3e5f5', stroke: '#ab47bc' },
  { label: 'Терраса', icon: '🌿', fill: '#f1f8e9', stroke: '#8bc34a' },
  { label: 'Касса / Ресепшн', icon: '💼', fill: '#e8f0f4', stroke: '#039be5' },
  { label: 'Коридор / Проход', icon: '🚪', fill: '#f5f5f5', stroke: '#9e9e9e' },
  { label: 'Подсобка', icon: '🗄', fill: '#fbf0e4', stroke: '#d7ccc8' },
];

export const PRESET_COLORS = [
  { name: 'Зелёный (кухня)', fill: '#e8f4e8', stroke: '#7cb342' },
  { name: 'Синий (зал)', fill: '#e8e8f4', stroke: '#5c6bc0' },
  { name: 'Оранжевый (бар)', fill: '#fff3e0', stroke: '#fb8c00' },
  { name: 'Красный (склад)', fill: '#f4e8e8', stroke: '#e57373' },
  { name: 'Бирюзовый (мойка)', fill: '#e0f7fa', stroke: '#00acc1' },
  { name: 'Фиолетовый', fill: '#f3e5f5', stroke: '#ab47bc' },
  { name: 'Серый (проход)', fill: '#f5f5f5', stroke: '#9e9e9e' },
];

type Tool = 'select' | 'rect' | 'line' | 'text';
type HandleType = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';

interface FloorPlanEditorProps {
  initialName?: string;
  initialData?: DrawingData | null;
  onSave: (payload: { name: string; drawingData: DrawingData }) => Promise<void>;
  onClose: () => void;
}

export function FloorPlanEditor({
  initialName = '',
  initialData,
  onSave,
  onClose,
}: FloorPlanEditorProps) {
  const canvasWidth = initialData?.canvasWidth || 1200;
  const canvasHeight = initialData?.canvasHeight || 800;

  const [name, setName] = useState(initialName || '');
  const [shapes, setShapes] = useState<DrawingShape[]>(initialData?.shapes || []);
  const [tool, setTool] = useState<Tool>('rect');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Сетка и привязка
  const [snapToGrid, setSnapToGrid] = useState(true);
  const gridSize = 20;

  // Зум и панорамирование внутри редактора
  const [zoom, setZoom] = useState(1);
  const [editorPan, setEditorPan] = useState({ x: 0, y: 0 });

  // История для Undo / Redo
  const [history, setHistory] = useState<DrawingShape[][]>([initialData?.shapes || []]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [activeColor, setActiveColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Состояние активного рисования / перемещения / ресайза
  const [actionState, setActionState] = useState<{
    type: 'draw' | 'move' | 'resize';
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    handle?: HandleType;
    origShape?: DrawingShape;
  } | null>(null);

  // Добавление в историю изменений
  const pushHistory = useCallback((nextShapes: DrawingShape[]) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, nextShapes];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  function undo() {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setShapes(history[prevIdx]);
      setSelectedId(null);
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setShapes(history[nextIdx]);
      setSelectedId(null);
    }
  }

  // Конвертация экранных координат через точную SVG CTM матрицу
  const getSvgCoords = useCallback((e: React.PointerEvent | PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;

    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };

    const svgP = pt.matrixTransform(ctm.inverse());
    let x = Math.round(svgP.x);
    let y = Math.round(svgP.y);

    if (snapToGrid) {
      x = Math.round(x / gridSize) * gridSize;
      y = Math.round(y / gridSize) * gridSize;
    }

    return {
      x: Math.max(0, Math.min(canvasWidth, x)),
      y: Math.max(0, Math.min(canvasHeight, y)),
    };
  }, [canvasWidth, canvasHeight, snapToGrid, gridSize]);

  const selectedShape = shapes.find((s) => s.id === selectedId) || null;

  // Горячие клавиши (Delete, Escape, Ctrl+Z, Ctrl+Y, 1-4 тулбар)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          e.preventDefault();
          deleteSelected();
        }
      } else if (e.key === 'Escape') {
        setSelectedId(null);
        setTool('select');
      } else if (e.key === 'v' || e.key === 'V' || e.key === '1') {
        setTool('select');
      } else if (e.key === 'r' || e.key === 'R' || e.key === '2') {
        setTool('rect');
      } else if (e.key === 'l' || e.key === 'L' || e.key === '3') {
        setTool('line');
      } else if (e.key === 't' || e.key === 'T' || e.key === '4') {
        setTool('text');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, historyIndex, history]);

  function deleteSelected() {
    if (!selectedId) return;
    const next = shapes.filter((s) => s.id !== selectedId);
    setShapes(next);
    setSelectedId(null);
    pushHistory(next);
  }

  function updateSelected(patch: Partial<DrawingShape>, commit = false) {
    if (!selectedId) return;
    const next = shapes.map((s) => (s.id === selectedId ? { ...s, ...patch } : s));
    setShapes(next);
    if (commit) pushHistory(next);
  }

  // Применение пресета комнаты к выбранной зоне
  function applyPreset(preset: typeof ROOM_PRESETS[0]) {
    if (!selectedShape || selectedShape.type !== 'rect') {
      // Если ничего не выбрано — создаем зону по центру
      const w = 240;
      const h = 160;
      const x = Math.round((canvasWidth - w) / 2);
      const y = Math.round((canvasHeight - h) / 2);
      const newRect: DrawingShape = {
        id: crypto.randomUUID(),
        type: 'rect',
        x,
        y,
        width: w,
        height: h,
        fill: preset.fill,
        stroke: preset.stroke,
        label: `${preset.icon} ${preset.label}`,
      };
      const next = [...shapes, newRect];
      setShapes(next);
      setSelectedId(newRect.id);
      setTool('select');
      pushHistory(next);
      return;
    }

    updateSelected({
      label: `${preset.icon} ${preset.label}`,
      fill: preset.fill,
      stroke: preset.stroke,
    }, true);
  }

  // Загрузка готового стартового шаблона (Зал + Кухня + Бар + Склад + Санузел)
  function loadStarterTemplate() {
    if (shapes.length > 0 && !confirm('Заменить текущую схему базовым шаблоном ресторана?')) return;

    const tpl: DrawingShape[] = [
      {
        id: crypto.randomUUID(),
        type: 'rect',
        x: 40,
        y: 40,
        width: 740,
        height: 720,
        fill: '#e8e8f4',
        stroke: '#5c6bc0',
        label: '🍽 Главный зал для гостей',
      },
      {
        id: crypto.randomUUID(),
        type: 'rect',
        x: 820,
        y: 40,
        width: 340,
        height: 380,
        fill: '#e8f4e8',
        stroke: '#7cb342',
        label: '🍳 Кухня и горячий цех',
      },
      {
        id: crypto.randomUUID(),
        type: 'rect',
        x: 820,
        y: 440,
        width: 340,
        height: 200,
        fill: '#f4e8e8',
        stroke: '#e57373',
        label: '📦 Склад сырья',
      },
      {
        id: crypto.randomUUID(),
        type: 'rect',
        x: 820,
        y: 660,
        width: 340,
        height: 100,
        fill: '#f3e5f5',
        stroke: '#ab47bc',
        label: '🚻 Санузел',
      },
      {
        id: crypto.randomUUID(),
        type: 'rect',
        x: 80,
        y: 80,
        width: 220,
        height: 120,
        fill: '#fff3e0',
        stroke: '#fb8c00',
        label: '☕️ Барная зона',
      },
    ];

    setShapes(tpl);
    pushHistory(tpl);
    setSelectedId(null);
  }

  // Обработчики мыши/тача на холсте
  function handleCanvasPointerDown(e: React.PointerEvent) {
    const coords = getSvgCoords(e);

    if (tool === 'select') {
      setSelectedId(null);
      return;
    }

    if (tool === 'rect' || tool === 'line') {
      setActionState({
        type: 'draw',
        startX: coords.x,
        startY: coords.y,
        currentX: coords.x,
        currentY: coords.y,
      });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else if (tool === 'text') {
      const newShape: DrawingShape = {
        id: crypto.randomUUID(),
        type: 'text',
        x: coords.x,
        y: coords.y,
        text: 'Текстовая метка',
        fontSize: 16,
        fill: '#222222',
      };
      const next = [...shapes, newShape];
      setShapes(next);
      pushHistory(next);
      setSelectedId(newShape.id);
      setTool('select');
    }
  }

  function handleShapePointerDown(e: React.PointerEvent, shape: DrawingShape) {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelectedId(shape.id);

    const coords = getSvgCoords(e);
    setActionState({
      type: 'move',
      startX: coords.x,
      startY: coords.y,
      currentX: coords.x,
      currentY: coords.y,
      origShape: { ...shape },
    });
    if (svgRef.current) svgRef.current.setPointerCapture(e.pointerId);
  }

  function handleResizeHandlePointerDown(e: React.PointerEvent, handle: HandleType, shape: DrawingShape) {
    e.stopPropagation();
    const coords = getSvgCoords(e);
    setActionState({
      type: 'resize',
      handle,
      startX: coords.x,
      startY: coords.y,
      currentX: coords.x,
      currentY: coords.y,
      origShape: { ...shape },
    });
    if (svgRef.current) svgRef.current.setPointerCapture(e.pointerId);
  }

  function handleCanvasPointerMove(e: React.PointerEvent) {
    if (!actionState) return;
    const coords = getSvgCoords(e);

    if (actionState.type === 'draw') {
      setActionState((prev) => (prev ? { ...prev, currentX: coords.x, currentY: coords.y } : null));
    } else if (actionState.type === 'move' && actionState.origShape) {
      const dx = coords.x - actionState.startX;
      const dy = coords.y - actionState.startY;
      const orig = actionState.origShape;

      if (orig.type === 'line') {
        const x2 = (orig.x2 ?? orig.x) + dx;
        const y2 = (orig.y2 ?? orig.y) + dy;
        updateSelected({ x: orig.x + dx, y: orig.y + dy, x2, y2 });
      } else {
        updateSelected({ x: orig.x + dx, y: orig.y + dy });
      }
    } else if (actionState.type === 'resize' && actionState.origShape && actionState.handle) {
      const orig = actionState.origShape;
      const ox = orig.x;
      const oy = orig.y;
      const ow = orig.width || 40;
      const oh = orig.height || 40;

      let nx = ox;
      let ny = oy;
      let nw = ow;
      let nh = oh;

      const dx = coords.x - actionState.startX;
      const dy = coords.y - actionState.startY;

      switch (actionState.handle) {
        case 'se':
          nw = Math.max(20, ow + dx);
          nh = Math.max(20, oh + dy);
          break;
        case 'sw':
          nw = Math.max(20, ow - dx);
          nx = ox + (ow - nw);
          nh = Math.max(20, oh + dy);
          break;
        case 'ne':
          nw = Math.max(20, ow + dx);
          nh = Math.max(20, oh - dy);
          ny = oy + (oh - nh);
          break;
        case 'nw':
          nw = Math.max(20, ow - dx);
          nx = ox + (ow - nw);
          nh = Math.max(20, oh - dy);
          ny = oy + (oh - nh);
          break;
        case 'e':
          nw = Math.max(20, ow + dx);
          break;
        case 'w':
          nw = Math.max(20, ow - dx);
          nx = ox + (ow - nw);
          break;
        case 's':
          nh = Math.max(20, oh + dy);
          break;
        case 'n':
          nh = Math.max(20, oh - dy);
          ny = oy + (oh - nh);
          break;
      }

      updateSelected({ x: nx, y: ny, width: nw, height: nh });
    }
  }

  function handleCanvasPointerUp(e: React.PointerEvent) {
    if (!actionState) return;

    if (actionState.type === 'draw') {
      const coords = getSvgCoords(e);
      if (tool === 'rect') {
        const x = Math.min(actionState.startX, coords.x);
        const y = Math.min(actionState.startY, coords.y);
        const width = Math.abs(coords.x - actionState.startX);
        const height = Math.abs(coords.y - actionState.startY);

        if (width >= 20 && height >= 20) {
          const newRect: DrawingShape = {
            id: crypto.randomUUID(),
            type: 'rect',
            x,
            y,
            width,
            height,
            fill: activeColor.fill,
            stroke: activeColor.stroke,
            label: '',
          };
          const next = [...shapes, newRect];
          setShapes(next);
          pushHistory(next);
          setSelectedId(newRect.id);
          setTool('select');
        }
      } else if (tool === 'line') {
        const len = Math.hypot(coords.x - actionState.startX, coords.y - actionState.startY);
        if (len >= 20) {
          const newLine: DrawingShape = {
            id: crypto.randomUUID(),
            type: 'line',
            x: actionState.startX,
            y: actionState.startY,
            x2: coords.x,
            y2: coords.y,
            stroke: '#444444',
          };
          const next = [...shapes, newLine];
          setShapes(next);
          pushHistory(next);
          setSelectedId(newLine.id);
          setTool('select');
        }
      }
    } else if (actionState.type === 'move' || actionState.type === 'resize') {
      // Сохраняем итоговое состояние в историю
      pushHistory(shapes);
    }

    try {
      if (svgRef.current) svgRef.current.releasePointerCapture(e.pointerId);
    } catch { /* игнор */ }

    setActionState(null);
  }

  async function handleSave() {
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Укажите название схемы (например: «1 этаж: План зала»)');
      return;
    }
    if (shapes.length === 0) {
      setError('Нарисуйте хотя бы одну зону или стену');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({
        name: cleanName,
        drawingData: {
          canvasWidth,
          canvasHeight,
          shapes,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения схемы');
    } finally {
      setSaving(false);
    }
  }

  // Расчет размеров временного прямоугольника при рисовании
  const activeRectPreview = actionState?.type === 'draw' && tool === 'rect' ? {
    x: Math.min(actionState.startX, actionState.currentX),
    y: Math.min(actionState.startY, actionState.currentY),
    w: Math.abs(actionState.currentX - actionState.startX),
    h: Math.abs(actionState.currentY - actionState.startY),
  } : null;

  return (
    <div className="drawing-editor-modal">
      <div className="drawing-editor-wrap">
        {/* Шапка редактора */}
        <div className="drawing-editor-head">
          <div className="drawing-editor-head__left">
            <input
              className="input input--sm drawing-editor-name"
              placeholder="Название схемы (например: 1 этаж: Главный зал)…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button
              type="button"
              className="btn btn--sm"
              onClick={loadStarterTemplate}
              title="Загрузить типовой шаблон ресторана"
            >
              📋 Шаблон
            </button>
          </div>

          <div className="drawing-editor-head__right">
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={undo}
              disabled={historyIndex <= 0}
              title="Отменить действие (Ctrl+Z)"
            >
              ↩
            </button>
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              title="Повторить действие (Ctrl+Y)"
            >
              ↪
            </button>
            <button
              type="button"
              className={`btn btn--sm ${snapToGrid ? 'btn--primary' : ''}`}
              onClick={() => setSnapToGrid((v) => !v)}
              title="Привязка к сетке (20px)"
            >
              🧲 Сетка
            </button>
            <button type="button" className="btn btn--sm" onClick={onClose} disabled={saving}>
              ✕ Отмена
            </button>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Сохранение…' : '💾 Сохранить схему'}
            </button>
          </div>
        </div>

        {error && <div className="banner banner--error" style={{ margin: '8px 14px' }}>{error}</div>}

        {/* Главный тулбар инструментов */}
        <div className="drawing-toolbar">
          <div className="drawing-toolbar__group">
            <button
              type="button"
              className={`drawing-toolbar__btn ${tool === 'select' ? 'is-active' : ''}`}
              onClick={() => setTool('select')}
              title="Выделение, перемещение и ресайз (V или 1)"
            >
              <span>↖</span> Выделение
            </button>
            <button
              type="button"
              className={`drawing-toolbar__btn ${tool === 'rect' ? 'is-active' : ''}`}
              onClick={() => setTool('rect')}
              title="Прямоугольная комната / зона (R или 2)"
            >
              <span>▭</span> Зона (комната)
            </button>
            <button
              type="button"
              className={`drawing-toolbar__btn ${tool === 'line' ? 'is-active' : ''}`}
              onClick={() => setTool('line')}
              title="Стена / перегородка (L или 3)"
            >
              <span>—</span> Стена
            </button>
            <button
              type="button"
              className={`drawing-toolbar__btn ${tool === 'text' ? 'is-active' : ''}`}
              onClick={() => setTool('text')}
              title="Текстовая подпись (T или 4)"
            >
              <span>T</span> Текст
            </button>
          </div>

          {/* Быстрые пресеты комнат (1-клик раскраска и подпись) */}
          <div className="drawing-presets-scroll">
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              Пресеты зон:
            </span>
            {ROOM_PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                className="drawing-preset-chip"
                style={{ background: p.fill, borderColor: p.stroke }}
                onClick={() => applyPreset(p)}
                title={`Применить к выбранной зоне: ${p.label}`}
              >
                <span>{p.icon}</span> {p.label}
              </button>
            ))}
          </div>

          {selectedShape && (
            <div className="drawing-toolbar__group">
              <button
                type="button"
                className="btn btn--sm btn--danger btn--icon"
                onClick={deleteSelected}
                title="Удалить выбранный элемент (Delete / Backspace)"
              >
                🗑
              </button>
            </div>
          )}
        </div>

        {/* Панель параметров выбранной фигуры (инспектор) */}
        {selectedShape && (
          <div className="drawing-inspector">
            {selectedShape.type === 'rect' && (
              <div className="drawing-inspector__row">
                <span className="drawing-inspector__label">Подпись зоны:</span>
                <input
                  className="input input--sm"
                  placeholder="Например: 🍳 Кухня, 🍽 Зал №1…"
                  value={selectedShape.label || ''}
                  onChange={(e) => updateSelected({ label: e.target.value }, true)}
                  style={{ maxWidth: 280 }}
                />
                <span className="drawing-inspector__label" style={{ marginLeft: 12 }}>Цвет заливки:</span>
                <div className="drawing-color-picker">
                  {PRESET_COLORS.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`drawing-color-swatch ${selectedShape.fill === c.fill ? 'is-active' : ''}`}
                      style={{ background: c.fill, borderColor: c.stroke }}
                      title={c.name}
                      onClick={() => updateSelected({ fill: c.fill, stroke: c.stroke }, true)}
                    />
                  ))}
                </div>
              </div>
            )}

            {selectedShape.type === 'text' && (
              <div className="drawing-inspector__row">
                <span className="drawing-inspector__label">Текст:</span>
                <input
                  className="input input--sm"
                  value={selectedShape.text || ''}
                  onChange={(e) => updateSelected({ text: e.target.value }, true)}
                  style={{ maxWidth: 300 }}
                />
                <span className="drawing-inspector__label" style={{ marginLeft: 12 }}>Размер:</span>
                <select
                  className="select select--sm"
                  value={selectedShape.fontSize || 16}
                  onChange={(e) => updateSelected({ fontSize: Number(e.target.value) }, true)}
                  style={{ width: 90 }}
                >
                  <option value={12}>12 px</option>
                  <option value={14}>14 px</option>
                  <option value={16}>16 px</option>
                  <option value={20}>20 px</option>
                  <option value={24}>24 px</option>
                  <option value={32}>32 px</option>
                </select>
              </div>
            )}

            {selectedShape.type === 'line' && (
              <div className="drawing-inspector__row">
                <span className="drawing-inspector__label">Толщина стены:</span>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => updateSelected({ stroke: '#222222' }, true)}
                >
                  Черная
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => updateSelected({ stroke: '#9e9e9e' }, true)}
                >
                  Серая
                </button>
              </div>
            )}
          </div>
        )}

        {/* Холст SVG с зумом и сеткой */}
        <div className="drawing-canvas-viewport" ref={viewportRef}>
          {/* Плавающий зум */}
          <div className="floor-plan-zoom-bar">
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
              title="Увеличить"
            >
              +
            </button>
            <span className="floor-plan-zoom-val">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
              title="Уменьшить"
            >
              −
            </button>
            <button
              type="button"
              className="btn btn--sm btn--icon"
              onClick={() => { setZoom(1); setEditorPan({ x: 0, y: 0 }); }}
              title="Сбросить масштаб"
            >
              ↺
            </button>
          </div>

          <div
            className="drawing-canvas-stage"
            style={{
              transform: `translate(${editorPan.x}px, ${editorPan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: actionState ? 'none' : 'transform 0.15s ease',
            }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              className="drawing-svg-canvas"
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              style={{ cursor: tool === 'select' ? (selectedShape ? 'default' : 'default') : 'crosshair' }}
            >
              {/* Фоновая сетка */}
              <defs>
                <pattern id="editor-grid-small" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="1" />
                </pattern>
                <pattern id="editor-grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
                  <rect width="100" height="100" fill="url(#editor-grid-small)" />
                  <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="1.5" />
                </pattern>
                {/* Мягкая тень для комнат */}
                <filter id="room-shadow" x="-5%" y="-5%" width="110%" height="110%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" />
                </filter>
              </defs>

              <rect width={canvasWidth} height={canvasHeight} fill="url(#editor-grid-large)" />

              {/* Нарисованные фигуры */}
              {shapes.map((shape) => {
                const isSelected = shape.id === selectedId;

                if (shape.type === 'rect') {
                  const w = shape.width || 40;
                  const h = shape.height || 40;
                  return (
                    <g
                      key={shape.id}
                      onPointerDown={(e) => handleShapePointerDown(e, shape)}
                      style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
                    >
                      <rect
                        x={shape.x}
                        y={shape.y}
                        width={w}
                        height={h}
                        fill={shape.fill || '#f4f4f4'}
                        stroke={isSelected ? 'var(--accent)' : shape.stroke || '#78909c'}
                        strokeWidth={isSelected ? 3 : 2}
                        rx={6}
                        filter="url(#room-shadow)"
                      />
                      {shape.label && (
                        <text
                          x={shape.x + w / 2}
                          y={shape.y + h / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#1e293b"
                          fontSize={Math.min(18, Math.max(12, Math.round(w / 14)))}
                          fontWeight={700}
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {shape.label}
                        </text>
                      )}

                      {/* Ручки ресайза для выбранного прямоугольника */}
                      {isSelected && tool === 'select' && (
                        <g className="drawing-handles">
                          {/* Углы */}
                          <circle
                            cx={shape.x}
                            cy={shape.y}
                            r={6}
                            className="drawing-handle"
                            onPointerDown={(e) => handleResizeHandlePointerDown(e, 'nw', shape)}
                            style={{ cursor: 'nwse-resize' }}
                          />
                          <circle
                            cx={shape.x + w}
                            cy={shape.y}
                            r={6}
                            className="drawing-handle"
                            onPointerDown={(e) => handleResizeHandlePointerDown(e, 'ne', shape)}
                            style={{ cursor: 'nesw-resize' }}
                          />
                          <circle
                            cx={shape.x + w}
                            cy={shape.y + h}
                            r={6}
                            className="drawing-handle"
                            onPointerDown={(e) => handleResizeHandlePointerDown(e, 'se', shape)}
                            style={{ cursor: 'nwse-resize' }}
                          />
                          <circle
                            cx={shape.x}
                            cy={shape.y + h}
                            r={6}
                            className="drawing-handle"
                            onPointerDown={(e) => handleResizeHandlePointerDown(e, 'sw', shape)}
                            style={{ cursor: 'nesw-resize' }}
                          />
                          {/* Стороны */}
                          <circle
                            cx={shape.x + w / 2}
                            cy={shape.y}
                            r={5}
                            className="drawing-handle"
                            onPointerDown={(e) => handleResizeHandlePointerDown(e, 'n', shape)}
                            style={{ cursor: 'ns-resize' }}
                          />
                          <circle
                            cx={shape.x + w / 2}
                            cy={shape.y + h}
                            r={5}
                            className="drawing-handle"
                            onPointerDown={(e) => handleResizeHandlePointerDown(e, 's', shape)}
                            style={{ cursor: 'ns-resize' }}
                          />
                          <circle
                            cx={shape.x}
                            cy={shape.y + h / 2}
                            r={5}
                            className="drawing-handle"
                            onPointerDown={(e) => handleResizeHandlePointerDown(e, 'w', shape)}
                            style={{ cursor: 'ew-resize' }}
                          />
                          <circle
                            cx={shape.x + w}
                            cy={shape.y + h / 2}
                            r={5}
                            className="drawing-handle"
                            onPointerDown={(e) => handleResizeHandlePointerDown(e, 'e', shape)}
                            style={{ cursor: 'ew-resize' }}
                          />
                        </g>
                      )}
                    </g>
                  );
                }

                if (shape.type === 'line') {
                  return (
                    <g
                      key={shape.id}
                      onPointerDown={(e) => handleShapePointerDown(e, shape)}
                      style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
                    >
                      <line
                        x1={shape.x}
                        y1={shape.y}
                        x2={shape.x2 ?? shape.x + 40}
                        y2={shape.y2 ?? shape.y}
                        stroke={isSelected ? 'var(--accent)' : shape.stroke || '#333333'}
                        strokeWidth={isSelected ? 5 : 4}
                        strokeLinecap="round"
                      />
                    </g>
                  );
                }

                if (shape.type === 'text') {
                  return (
                    <g
                      key={shape.id}
                      onPointerDown={(e) => handleShapePointerDown(e, shape)}
                      style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
                    >
                      <text
                        x={shape.x}
                        y={shape.y}
                        fill={isSelected ? 'var(--accent)' : shape.fill || '#1e293b'}
                        fontSize={shape.fontSize || 16}
                        fontWeight={700}
                        style={{ userSelect: 'none' }}
                      >
                        {shape.text || 'Метка'}
                      </text>
                    </g>
                  );
                }

                return null;
              })}

              {/* Превью во время активного рисования */}
              {activeRectPreview && (
                <g>
                  <rect
                    x={activeRectPreview.x}
                    y={activeRectPreview.y}
                    width={activeRectPreview.w}
                    height={activeRectPreview.h}
                    fill={activeColor.fill}
                    stroke={activeColor.stroke}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    rx={6}
                  />
                  <rect
                    x={activeRectPreview.x + activeRectPreview.w / 2 - 35}
                    y={activeRectPreview.y + activeRectPreview.h / 2 - 12}
                    width={70}
                    height={24}
                    rx={4}
                    fill="rgba(0,0,0,0.75)"
                  />
                  <text
                    x={activeRectPreview.x + activeRectPreview.w / 2}
                    y={activeRectPreview.y + activeRectPreview.h / 2 + 4}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={11}
                    fontWeight={600}
                  >
                    {activeRectPreview.w} × {activeRectPreview.h}
                  </text>
                </g>
              )}

              {actionState?.type === 'draw' && tool === 'line' && (
                <line
                  x1={actionState.startX}
                  y1={actionState.startY}
                  x2={actionState.currentX}
                  y2={actionState.currentY}
                  stroke="#333333"
                  strokeWidth={4}
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
