// =============================================================================
// Grafici condivisi (Stadio B). Implementati in SVG/CSS puro: nessuna nuova
// dipendenza. Ogni grafico espone un'etichetta accessibile e una tabella
// equivalente nascosta agli occhi ma leggibile dagli screen reader.
// =============================================================================

import { useId } from "react";
import { cn } from "@pv/lib/utils";

export interface ChartPoint {
  label: string;
  value: number;
}

// --- Utils -----------------------------------------------------------------

/** Costruisce il path poligonale per una serie normalizzata su una viewBox. */
function buildPoints(
  values: number[],
  width: number,
  height: number,
  min: number,
  max: number,
  padding = 6,
): { x: number; y: number }[] {
  const span = max - min || 1;
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  return values.map((value, index) => ({
    x: padding + step * index,
    y: padding + (height - padding * 2) * (1 - (value - min) / span),
  }));
}

function toLinePath(points: { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
}

/** Tabella dati nascosta: rende ogni grafico comprensibile agli screen reader. */
function AccessibleTable({ points, caption }: { points: ChartPoint[]; caption: string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Etichetta</th>
          <th scope="col">Valore</th>
        </tr>
      </thead>
      <tbody>
        {points.map((point) => (
          <tr key={point.label}>
            <th scope="row">{point.label}</th>
            <td>{point.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- Line / Area chart -----------------------------------------------------

export interface LineChartProps {
  data: ChartPoint[];
  /** Riempie l'area sotto la linea (stile area chart). */
  area?: boolean;
  height?: number;
  color?: string;
  ariaLabel: string;
  valueFormatter?: (value: number) => string;
  className?: string;
}

export function LineChart({
  data,
  area = false,
  height = 200,
  color = "#00D4FF",
  ariaLabel,
  valueFormatter = (value) => String(value),
  className,
}: LineChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const width = 640;
  const values = data.map((point) => point.value);

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-pv-ink-3">Nessun dato disponibile.</p>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = buildPoints(values, width, height, min, max);
  const linePath = toLinePath(points);
  const areaPath = `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];

  // Riduce le etichette sull'asse X per non affollare il grafico.
  const labelStep = Math.max(1, Math.ceil(data.length / 6));

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full"
        preserveAspectRatio="none"
        style={{ maxHeight: height + 24 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Griglia orizzontale */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={0}
            x2={width}
            y1={6 + (height - 12) * ratio}
            y2={6 + (height - 12) * ratio}
            stroke="rgba(168,163,199,0.12)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {area && <path d={areaPath} fill={`url(#${gradientId})`} />}

        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        <circle cx={lastPoint.x} cy={lastPoint.y} r={4} fill={color} />
        <circle cx={firstPoint.x} cy={firstPoint.y} r={3} fill={color} opacity={0.6} />
      </svg>

      <div className="flex justify-between text-xs text-pv-ink-3">
        {data
          .filter((_, index) => index % labelStep === 0)
          .map((point) => (
            <span key={point.label}>{point.label}</span>
          ))}
      </div>

      <figcaption className="sr-only">
        {ariaLabel}. Valore iniziale {valueFormatter(values[0])}, valore finale{" "}
        {valueFormatter(values[values.length - 1])}.
      </figcaption>

      <AccessibleTable points={data} caption={ariaLabel} />
    </figure>
  );
}

// --- Bar chart -------------------------------------------------------------

export interface BarChartProps {
  data: (ChartPoint & { color?: string })[];
  height?: number;
  ariaLabel: string;
  valueFormatter?: (value: number) => string;
  className?: string;
}

export function BarChart({
  data,
  height = 200,
  ariaLabel,
  valueFormatter = (value) => String(value),
  className,
}: BarChartProps) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-pv-ink-3">Nessun dato disponibile.</p>
    );
  }

  const max = Math.max(...data.map((point) => point.value)) || 1;

  return (
    <figure className={cn("flex flex-col gap-3", className)}>
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex items-end gap-3"
        style={{ height }}
      >
        {data.map((point) => (
          <div key={point.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="text-xs font-medium text-pv-ink-2">
              {valueFormatter(point.value)}
            </span>
            <div
              className="w-full rounded-t-md transition-colors"
              style={{
                height: `${Math.max(4, (point.value / max) * 100)}%`,
                backgroundColor: point.color ?? "#00D4FF",
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        {data.map((point) => (
          <span key={point.label} className="flex-1 text-center text-xs text-pv-ink-3">
            {point.label}
          </span>
        ))}
      </div>

      <AccessibleTable points={data} caption={ariaLabel} />
    </figure>
  );
}

// --- Donut chart -----------------------------------------------------------

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  ariaLabel: string;
  className?: string;
}

export function DonutChart({
  data,
  size = 180,
  thickness = 26,
  ariaLabel,
  className,
}: DonutChartProps) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-pv-ink-3">Nessun dato disponibile.</p>
    );
  }

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <figure className={cn("flex flex-wrap items-center gap-6", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
        className="shrink-0"
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {data.map((slice) => {
            const fraction = slice.value / total;
            const dash = fraction * circumference;
            const circle = (
              <circle
                key={slice.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return circle;
          })}
        </g>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-pv-ink font-display"
          style={{ fontSize: 20, fontWeight: 600 }}
        >
          {total}
        </text>
      </svg>

      <figcaption className="flex flex-col gap-2 text-sm">
        {data.map((slice) => (
          <span key={slice.label} className="flex items-center gap-2 text-pv-ink-2">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: slice.color }}
              aria-hidden="true"
            />
            {slice.label}
            <span className="ml-auto font-medium text-pv-ink">
              {Math.round((slice.value / total) * 100)}%
            </span>
          </span>
        ))}
      </figcaption>

      <AccessibleTable
        points={data.map((slice) => ({ label: slice.label, value: slice.value }))}
        caption={ariaLabel}
      />
    </figure>
  );
}
