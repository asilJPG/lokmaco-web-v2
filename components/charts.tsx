'use client';

/**
 * SVG chart primitives. Deliberately dependency-free: the app ships without a
 * charting library, and these views need only a handful of shapes.
 */

import { useId, useState } from 'react';

export const SERIES_COLORS = [
  '#2f6fed', '#0d9488', '#d97706', '#8b5cf6', '#10b981',
  '#f97316', '#0ea5e9', '#e11d48', '#65a30d', '#7c3aed',
];

const FACT_COLOR = '#2f6fed';
const COMPARE_COLOR = '#0d9488';

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

function shortNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

export type SeriesPoint = { label: string; value: number };

/**
 * Catmull-Rom through the points, emitted as cubic beziers. Straight segments
 * make daily series read as noise; the curve shows the shape of the trend.
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function LegendPills({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {items.map((it) => (
        <span key={it.label} className="legend-pill">
          <span className="legend-pill__dot" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Line chart with an optional comparison series and a hover tooltip. */
export function LineChart({
  points,
  compare,
  height = 240,
  factLabel = 'Факт',
  compareLabel = 'Пред. период',
  unit = '',
}: {
  points: SeriesPoint[];
  compare?: SeriesPoint[];
  height?: number;
  factLabel?: string;
  compareLabel?: string;
  unit?: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return <div className="empty-state">Нет данных за период</div>;

  const W = 900;
  const H = height;
  const padL = 56;
  const padR = 12;
  const padT = 14;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const all = [...points.map((p) => p.value), ...(compare?.map((p) => p.value) ?? []), 0];
  const max = Math.max(...all) || 1;

  const x = (i: number, len: number) => padL + (len <= 1 ? innerW / 2 : (i / (len - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const factPts = points.map((p, i) => ({ x: x(i, points.length), y: y(p.value) }));
  const comparePts = (compare ?? []).map((p, i) => ({ x: x(i, compare!.length), y: y(p.value) }));

  const linePath = smoothPath(factPts);
  const areaPath = `${linePath} L ${factPts[factPts.length - 1].x.toFixed(1)} ${padT + innerH} L ${factPts[0].x.toFixed(1)} ${padT + innerH} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: max * f, y: y(max * f) }));
  const labelEvery = Math.max(1, Math.ceil(points.length / 12));

  const hoverPoint = hover != null ? points[hover] : null;
  const hoverCompare = hover != null ? compare?.[hover] : null;
  const tooltipLeft = hover != null ? (x(hover, points.length) / W) * 100 : 0;

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', minWidth: 260, maxWidth: '100%', display: 'block' }}
        role="img"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={FACT_COLOR} stopOpacity="0.16" />
            <stop offset="100%" stopColor={FACT_COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 10} y={t.y + 3} textAnchor="end" fontSize="11" fill="var(--text-faint)" fontFamily="var(--font-num)">
              {shortNumber(t.v)}
            </text>
          </g>
        ))}

        {comparePts.length > 1 && (
          <path d={smoothPath(comparePts)} fill="none" stroke={COMPARE_COLOR} strokeWidth="2" strokeDasharray="5 4" />
        )}

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={FACT_COLOR} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />

        {hover != null && (
          <line x1={x(hover, points.length)} y1={padT} x2={x(hover, points.length)} y2={padT + innerH} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 3" />
        )}

        {points.map((p, i) => (
          <g key={i}>
            {/* Full-height hit area: the pointer shouldn't have to find the dot. */}
            <rect
              x={x(i, points.length) - innerW / points.length / 2}
              y={padT}
              width={innerW / points.length}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
            {hover === i && <circle cx={x(i, points.length)} cy={y(p.value)} r={4.5} fill={FACT_COLOR} stroke="#fff" strokeWidth="2" />}
            {hover === i && hoverCompare && (
              <circle cx={x(i, points.length)} cy={y(hoverCompare.value)} r={4} fill={COMPARE_COLOR} stroke="#fff" strokeWidth="2" />
            )}
            {i % labelEvery === 0 && (
              <text x={x(i, points.length)} y={H - 9} textAnchor="middle" fontSize="11" fill="var(--text-faint)">
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      {hoverPoint && (
        <div
          className="chart-tooltip"
          style={{ left: `${tooltipLeft}%`, transform: tooltipLeft > 65 ? 'translateX(-100%)' : 'translateX(-8px)' }}
        >
          <div className="chart-tooltip__title">{hoverPoint.label}</div>
          <div className="chart-tooltip__row">
            <span className="legend-pill__dot" style={{ background: FACT_COLOR }} />
            <span>{factLabel}</span>
            <b>{fmt(hoverPoint.value)} {unit}</b>
          </div>
          {hoverCompare && (
            <div className="chart-tooltip__row">
              <span className="legend-pill__dot" style={{ background: COMPARE_COLOR }} />
              <span>{compareLabel}</span>
              <b>{fmt(hoverCompare.value)} {unit}</b>
            </div>
          )}
        </div>
      )}

      <LegendPills
        items={[
          { label: factLabel, color: FACT_COLOR },
          ...(compare && compare.length > 0 ? [{ label: compareLabel, color: COMPARE_COLOR }] : []),
        ]}
      />
    </div>
  );
}

/** Vertical bars — for per-hour or per-weekday distributions. */
export function BarChart({ points, height = 240, unit = '' }: { points: SeriesPoint[]; height?: number; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <div className="empty-state">Нет данных</div>;

  const W = 900;
  const H = height;
  const padL = 56;
  const padR = 12;
  const padT = 14;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(...points.map((p) => p.value)) || 1;
  const slot = innerW / points.length;
  const barW = Math.min(slot * 0.62, 46);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: max * f, y: padT + innerH - f * innerH }));

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 260, maxWidth: '100%', display: 'block' }} role="img" onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 10} y={t.y + 3} textAnchor="end" fontSize="11" fill="var(--text-faint)" fontFamily="var(--font-num)">
              {shortNumber(t.v)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const h = (p.value / max) * innerH;
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent" />
              <rect
                x={cx - barW / 2}
                y={padT + innerH - h}
                width={barW}
                height={Math.max(h, 0)}
                rx="4"
                fill={FACT_COLOR}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
              <text x={cx} y={H - 9} textAnchor="middle" fontSize="11" fill="var(--text-faint)">{p.label}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="chart-tooltip" style={{ left: `${((padL + slot * hover + slot / 2) / W) * 100}%`, transform: 'translateX(-50%)' }}>
          <div className="chart-tooltip__title">{points[hover].label}</div>
          <div className="chart-tooltip__row"><b>{fmt(points[hover].value)} {unit}</b></div>
        </div>
      )}
    </div>
  );
}

export type DonutItem = { name: string; value: number; share: number };

/** Donut with the legend as a value table beside it. */
export function DonutChart({ items, max = 8, unit = '' }: { items: DonutItem[]; max?: number; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (items.length === 0) return <div className="empty-state">Нет данных</div>;

  const shown = items.slice(0, max);
  const rest = items.slice(max);
  const restValue = rest.reduce((s, r) => s + r.value, 0);
  const restShare = rest.reduce((s, r) => s + r.share, 0);
  const slices = restValue > 0
    ? [...shown, { name: 'Прочее', value: restValue, share: restShare }]
    : shown;

  const R = 60;
  const STROKE = 22;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', minWidth: 0, maxWidth: '100%' }}>
      <svg viewBox="0 0 160 160" style={{ width: 140, height: 140, flexShrink: 0, margin: '0 auto' }} role="img">
        <g transform="rotate(-90 80 80)">
          {slices.map((s, i) => {
            const len = (s.share / 100) * C;
            const dash = `${Math.max(len - 2, 0)} ${C - Math.max(len - 2, 0)}`;
            const el = (
              <circle
                key={s.name}
                cx="80" cy="80" r={R}
                fill="none"
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={hover === i ? STROKE + 4 : STROKE}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: 'stroke-width 120ms', cursor: 'pointer' }}
              />
            );
            offset += len;
            return el;
          })}
        </g>
      </svg>

      <div style={{ flex: '1 1 180px', minWidth: 0, maxWidth: '100%', display: 'grid', gap: 7 }}>
        {slices.map((s, i) => (
          <div
            key={s.name}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
              opacity: hover === null || hover === i ? 1 : 0.55,
            }}
          >
            <span className="legend-pill__dot" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            <span style={{ fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' }}>{fmt(s.value)} {unit}</span>
            <span style={{ fontFamily: 'var(--font-num)', color: 'var(--text-muted)', width: 52, textAlign: 'right' }}>{s.share.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal share bars — used where a ranking reads better than a donut. */
export function ShareBars({ items, max = 8, colored = false }: { items: DonutItem[]; max?: number; colored?: boolean }) {
  if (items.length === 0) return <div className="empty-state">Нет данных</div>;
  const shown = items.slice(0, max);
  const top = shown[0]?.share || 1;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {shown.map((it, i) => (
        <div key={it.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, marginBottom: 4 }}>
            <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
            <span style={{ fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {fmt(it.value)}
              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{it.share.toFixed(1)}%</span>
            </span>
          </div>
          <div className="track">
            <div
              className="track__fill"
              style={{ width: `${(it.share / top) * 100}%`, background: colored ? SERIES_COLORS[i % SERIES_COLORS.length] : FACT_COLOR }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Weekday × hour heatmap — shows when the kitchen is actually under load. */
export function Heatmap({ cells }: { cells: { weekday: number; hour: number; value: number }[] }) {
  if (cells.length === 0) return <div className="empty-state">Нет данных</div>;

  const hours = [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b);
  const max = Math.max(...cells.map((c) => c.value)) || 1;
  const byKey = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c.value]));

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table className="heatmap" style={{ minWidth: 460 }}>
        <thead>
          <tr>
            <th />
            {hours.map((h) => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {WEEKDAY_SHORT.map((label, wd) => (
            <tr key={wd}>
              <td className="heatmap__label">{label}</td>
              {hours.map((h) => {
                const v = byKey.get(`${wd}:${h}`) || 0;
                return (
                  <td key={h} className="heatmap__cell" title={`${label} ${h}:00 — ${fmt(v)}`}>
                    <span style={{ background: v > 0 ? `color-mix(in srgb, ${FACT_COLOR} ${Math.round((v / max) * 100)}%, transparent)` : 'var(--surface-muted)' }} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="heatmap__scale">
        <span>меньше</span>
        {[0.15, 0.35, 0.6, 0.85, 1].map((f) => (
          <span key={f} className="heatmap__swatch" style={{ background: `color-mix(in srgb, ${FACT_COLOR} ${f * 100}%, transparent)` }} />
        ))}
        <span>больше</span>
      </div>
    </div>
  );
}

/** KPI tile with a period-over-period delta. */
export function KpiCard({
  label,
  value,
  deltaPercent,
  hint,
  positiveIsGood = true,
  spark,
}: {
  label: string;
  value: string;
  deltaPercent?: number | null;
  hint?: string;
  positiveIsGood?: boolean;
  spark?: number[];
}) {
  const up = (deltaPercent ?? 0) > 0;
  const flat = deltaPercent == null || Math.abs(deltaPercent) < 0.05;
  const good = up === positiveIsGood;
  const color = flat ? 'var(--text-faint)' : good ? 'var(--success)' : 'var(--danger)';

  return (
    <div className="stat-card">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__delta">
        {deltaPercent != null && (
          <span style={{ color, fontWeight: 600, fontFamily: 'var(--font-num)' }}>
            {flat ? '—' : up ? '↑' : '↓'} {Math.abs(deltaPercent).toFixed(1)}%
          </span>
        )}
        <span style={{ color: 'var(--text-faint)' }}>{hint || (deltaPercent != null ? 'пред.' : '')}</span>
        {spark && spark.length > 1 && <MiniSpark values={spark} />}
      </div>
    </div>
  );
}

function MiniSpark({ values }: { values: number[] }) {
  const w = 64;
  const h = 20;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({ x: (i / (values.length - 1)) * w, y: h - ((v - min) / span) * h }));
  return (
    <svg width={w} height={h} style={{ marginLeft: 'auto', display: 'block', flexShrink: 0 }} aria-hidden="true">
      <path d={smoothPath(pts)} fill="none" stroke={FACT_COLOR} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2" fill={FACT_COLOR} />
    </svg>
  );
}

/** Coloured status pill used in inventory and document tables. */
export function StatusBadge({ tone, children }: { tone: 'success' | 'warning' | 'danger' | 'neutral'; children: React.ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/** Multi-segment bar showing how a total splits across statuses. */
export function SegmentBar({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="track track--tall">
      {segments.map((s) => (
        <div
          key={s.label}
          title={`${s.label}: ${fmt(s.value)}`}
          style={{ width: `${(s.value / total) * 100}%`, background: s.color, height: '100%' }}
        />
      ))}
    </div>
  );
}
