'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { DrawingData, DrawingShape } from '@/db/schema';

const PRESET_COLORS = [
  { name: 'Кухня (зелёный)', fill: '#e8f4e8', stroke: '#8bc34a' },
  { name: 'Зал (синий)', fill: '#e8e8f4', stroke: '#5c6bc0' },
  { name: 'Склад (красный)', fill: '#f4e8e8', stroke: '#e57373' },
  { name: 'Подсобка (жёлтый)', fill: '#f4f0e8', stroke: '#fbc02d' },
  { name: 'Фиолетовый', fill: '#f0e8f4', stroke: '#ba68c8' },
  { name: 'Голубой', fill: '#e8f0f4', stroke: '#4fc3f7' },
  { name: 'Коридор (серый)', fill: '#f4f4f4', stroke: '#bdbdbd' },
];

type Tool = 'select' | 'rect' | 'line' | 'text';
type HandleType = 'nw' | 'ne' | 'se' | 'sw';

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

  const [activeColor, setActiveColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Интерактивное рисование и перетаскивание
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drawingState, setDrawingState] = useState<{
    action: 'draw' | 'move' | 'resize';
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    handle?: HandleType;
    origShape?: DrawingShape;
  } | null>(null);

  // Конвертация экранных координат в логические координаты SVG (0..1200, 0..800)
  const getSvgCoords = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const x = Math.round((clientX / rect.width) * canvasWidth);
    const y = Math.round((clientY / rect.height) * canvasHeight);
    return {
      x: Math.max(0, Math.min(canvasWidth, x)),
      y: Math.max(0, Math.min(canvasHeight, y)),
    };
  }, [canvasWidth, canvasHeight]);

  const selectedShape = shapes.find((s) => s.id === selectedId) || null;

  // Удаление выбранной фигуры по Backspace / Delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          e.preventDefault();
          deleteSelected();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  function deleteSelected() {
    if (!selectedId) return;
    setShapes((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  }

  // Обновление свойств выбранной фигуры
  function updateSelected(patch: Partial<DrawingShape>) {
    if (!selectedId) return;
    setShapes((prev) =>
      prev.map((s) => (s.id === selectedId ? { ...s, ...patch } : s))
    );
  }

  // Обработка начала нажатия на холст
  function handlePointerDown(e: React.PointerEvent) {
    // Если клик был по ручке ресайза или по фигуре, эти обработчики вызовут e.stopPropagation()
    const coords = getSvgCoords(e);

    if (tool === 'select') {
      // Клик в пустоту снимает выделение
      setSelectedId(null);
      return;
    }

    if (tool === 'rect') {
      setDrawingState({
        action: 'draw',
        startX: coords.x,
        startY: coords.y,
        currentX: coords.x,
        currentY: coords.y,
      });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else if (tool === 'line') {
      setDrawingState({
        action: 'draw',
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
        text: 'Текст',
        fontSize: 16,
        fill: '#333333',
      };
      setShapes((prev) => [...prev, newShape]);
      setSelectedId(newShape.id);
      setTool('select');
    }
  }

  function handleShapePointerDown(e: React.PointerEvent, shape: DrawingShape) {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelectedId(shape.id);

    const coords = getSvgCoords(e);
    setDrawingState({
      action: 'move',
      startX: coords.x,
      startY: coords.y,
      currentX: coords.x,
      currentY: coords.y,
      origShape: { ...shape },
    });
    if (svgRef.current) {
      svgRef.current.setPointerCapture(e.pointerId);
    }
  }

  function handleResizeHandlePointerDown(e: React.PointerEvent, handle: HandleType, shape: DrawingShape) {
    e.stopPropagation();
    const coords = getSvgCoords(e);
    setDrawingState({
      action: 'resize',
      handle,
      startX: coords.x,
      startY: coords.y,
      currentX: coords.x,
      currentY: coords.y,
      origShape: { ...shape },
    });
    if (svgRef.current) {
      svgRef.current.setPointerCapture(e.pointerId);
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drawingState) return;
    const coords = getSvgCoords(e);

    if (drawingState.action === 'draw') {
      setDrawingState((prev) => prev ? { ...prev, currentX: coords.x, currentY: coords.y } : null);
    } else if (drawingState.action === 'move' && drawingState.origShape) {
      const dx = coords.x - drawingState.startX;
      const dy = coords.y - drawingState.startY;
      const orig = drawingState.origShape;

      if (orig.type === 'line') {
        const x2 = (orig.x2 ?? orig.x) + dx;
        const y2 = (orig.y2 ?? orig.y) + dy;
        updateSelected({ x: orig.x + dx, y: orig.y + dy, x2, y2 });
      } else {
        updateSelected({ x: orig.x + dx, y: orig.y + dy });
      }
    } else if (drawingState.action === 'resize' && drawingState.origShape && drawingState.handle) {
      const orig = drawingState.origShape;
      const origX = orig.x;
      const origY = orig.y;
      const origW = orig.width || 50;
      const origH = orig.height || 50;

      let newX = origX;
      let newY = origY;
      let newW = origW;
      let newH = origH;

      const dx = coords.x - drawingState.startX;
      const dy = coords.y - drawingState.startY;

      switch (drawingState.handle) {
        case 'se':
          newW = Math.max(20, origW + dx);
          newH = Math.max(20, origH + dy);
          break;
        case 'sw':
          newW = Math.max(20, origW - dx);
          newX = origX + (origW - newW);
          newH = Math.max(20, origH + dy);
          break;
        case 'ne':
          newW = Math.max(20, origW + dx);
          newH = Math.max(20, origH - dy);
          newY = origY + (origH - newH);
          break;
        case 'nw':
          newW = Math.max(20, origW - dx);
          newX = origX + (origW - newW);
          newH = Math.max(20, origH - dy);
          newY = origY + (origH - newH);
          break;
      }

      updateSelected({ x: newX, y: newY, width: newW, height: newH });
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!drawingState) return;

    if (drawingState.action === 'draw') {
      const coords = getSvgCoords(e);
      if (tool === 'rect') {
        const x = Math.min(drawingState.startX, coords.x);
        const y = Math.min(drawingState.startY, coords.y);
        const width = Math.abs(coords.x - drawingState.startX);
        const height = Math.abs(coords.y - drawingState.startY);

        if (width >= 10 && height >= 10) {
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
          setShapes((prev) => [...prev, newRect]);
          setSelectedId(newRect.id);
          setTool('select');
        }
      } else if (tool === 'line') {
        const len = Math.hypot(coords.x - drawingState.startX, coords.y - drawingState.startY);
        if (len >= 10) {
          const newLine: DrawingShape = {
            id: crypto.randomUUID(),
            type: 'line',
            x: drawingState.startX,
            y: drawingState.startY,
            x2: coords.x,
            y2: coords.y,
            stroke: '#444444',
          };
          setShapes((prev) => [...prev, newLine]);
          setSelectedId(newLine.id);
          setTool('select');
        }
      }
    }

    try {
      if (svgRef.current) svgRef.current.releasePointerCapture(e.pointerId);
    } catch { /* игнор */ }

    setDrawingState(null);
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
          </div>

          <div className="drawing-editor-head__right">
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

        {/* Тулбар инструментов */}
        <div className="drawing-toolbar">
          <div className="drawing-toolbar__group">
            <button
              type="button"
              className={`drawing-toolbar__btn ${tool === 'select' ? 'is-active' : ''}`}
              onClick={() => setTool('select')}
              title="Выделение и перемещение (V)"
            >
              <span>↖</span> Выделение
            </button>
            <button
              type="button"
              className={`drawing-toolbar__btn ${tool === 'rect' ? 'is-active' : ''}`}
              onClick={() => setTool('rect')}
              title="Прямоугольная зона (R)"
            >
              <span>▭</span> Зона (комната)
            </button>
            <button
              type="button"
              className={`drawing-toolbar__btn ${tool === 'line' ? 'is-active' : ''}`}
              onClick={() => setTool('line')}
              title="Линия / стена (L)"
            >
              <span>—</span> Стена
            </button>
            <button
              type="button"
              className={`drawing-toolbar__btn ${tool === 'text' ? 'is-active' : ''}`}
              onClick={() => setTool('text')}
              title="Текстовая подпись (T)"
            >
              <span>T</span> Текст
            </button>
          </div>

          {/* Палитра цветов для зон */}
          <div className="drawing-toolbar__group drawing-color-picker">
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Цвет:</span>
            {PRESET_COLORS.map((c, i) => (
              <button
                key={i}
                type="button"
                className={`drawing-color-swatch ${activeColor.fill === c.fill ? 'is-active' : ''}`}
                style={{ background: c.fill, borderColor: c.stroke }}
                title={c.name}
                onClick={() => {
                  setActiveColor(c);
                  if (selectedShape && selectedShape.type === 'rect') {
                    updateSelected({ fill: c.fill, stroke: c.stroke });
                  }
                }}
              />
            ))}
          </div>

          {selectedShape && (
            <div className="drawing-toolbar__group">
              <button
                type="button"
                className="btn btn--sm btn--danger btn--icon"
                onClick={deleteSelected}
                title="Удалить выбранный элемент (Delete)"
              >
                🗑
              </button>
            </div>
          )}
        </div>

        {/* Панель свойств выбранной фигуры (инспектор) */}
        {selectedShape && (
          <div className="drawing-inspector">
            {selectedShape.type === 'rect' && (
              <div className="drawing-inspector__row">
                <span className="drawing-inspector__label">Подпись зоны:</span>
                <input
                  className="input input--sm"
                  placeholder="Например: Кухня, Зал, Склад…"
                  value={selectedShape.label || ''}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  autoFocus
                />
              </div>
            )}
            {selectedShape.type === 'text' && (
              <div className="drawing-inspector__row">
                <span className="drawing-inspector__label">Текст:</span>
                <input
                  className="input input--sm"
                  value={selectedShape.text || ''}
                  onChange={(e) => updateSelected({ text: e.target.value })}
                  autoFocus
                />
                <select
                  className="select select--sm"
                  value={selectedShape.fontSize || 16}
                  onChange={(e) => updateSelected({ fontSize: Number(e.target.value) })}
                  style={{ width: 80 }}
                >
                  <option value={12}>12px</option>
                  <option value={14}>14px</option>
                  <option value={16}>16px</option>
                  <option value={20}>20px</option>
                  <option value={24}>24px</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* Холст SVG */}
        <div className="drawing-canvas-viewport">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            className="drawing-svg-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* Фоновая сетка */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={canvasWidth} height={canvasHeight} fill="url(#grid)" />

            {/* Фигуры */}
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
                      stroke={isSelected ? 'var(--accent)' : shape.stroke || '#999'}
                      strokeWidth={isSelected ? 3 : 2}
                      rx={4}
                    />
                    {shape.label && (
                      <text
                        x={shape.x + w / 2}
                        y={shape.y + h / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#222222"
                        fontSize={14}
                        fontWeight={700}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {shape.label}
                      </text>
                    )}

                    {/* Ручки ресайза для выбранного прямоугольника */}
                    {isSelected && tool === 'select' && (
                      <g className="drawing-handles">
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
                      stroke={isSelected ? 'var(--accent)' : shape.stroke || '#444'}
                      strokeWidth={isSelected ? 4 : 3}
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
                      fill={isSelected ? 'var(--accent)' : shape.fill || '#222'}
                      fontSize={shape.fontSize || 16}
                      fontWeight={600}
                      style={{ userSelect: 'none' }}
                    >
                      {shape.text || 'Текст'}
                    </text>
                  </g>
                );
              }

              return null;
            })}

            {/* Временная фигура во время рисования */}
            {drawingState?.action === 'draw' && (
              <>
                {tool === 'rect' && (
                  <rect
                    x={Math.min(drawingState.startX, drawingState.currentX)}
                    y={Math.min(drawingState.startY, drawingState.currentY)}
                    width={Math.abs(drawingState.currentX - drawingState.startX)}
                    height={Math.abs(drawingState.currentY - drawingState.startY)}
                    fill={activeColor.fill}
                    stroke={activeColor.stroke}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    rx={4}
                  />
                )}
                {tool === 'line' && (
                  <line
                    x1={drawingState.startX}
                    y1={drawingState.startY}
                    x2={drawingState.currentX}
                    y2={drawingState.currentY}
                    stroke="#444"
                    strokeWidth={3}
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                  />
                )}
              </>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
