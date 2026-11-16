import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { OverviewMetric, TrendPoint } from '../overview/analytics';
import { formatMetricValue, metricValue } from '../overview/analytics';

const HEIGHT = 280;
const PADDING = { left: 48, right: 16, top: 18, bottom: 32 };
const TICKS = [0, 0.25, 0.5, 0.75, 1];

type ChartPoint = { x: number; y: number };

const monotonePath = (points: ChartPoint[]) => {
  if (points.length < 2) return '';
  const count = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    dx[index] = points[index + 1].x - points[index].x;
    slope[index] = (points[index + 1].y - points[index].y) / (dx[index] || 1);
  }
  const tangent = new Array<number>(count);
  tangent[0] = slope[0];
  tangent[count - 1] = slope[count - 2];
  for (let index = 1; index < count - 1; index += 1) {
    if (slope[index - 1] * slope[index] <= 0) {
      tangent[index] = 0;
    } else {
      const w1 = 2 * dx[index] + dx[index - 1];
      const w2 = dx[index] + 2 * dx[index - 1];
      tangent[index] = (w1 + w2) / (w1 / slope[index - 1] + w2 / slope[index]);
    }
  }
  for (let index = 0; index < count - 1; index += 1) {
    if (slope[index] === 0) {
      tangent[index] = 0;
      tangent[index + 1] = 0;
    } else {
      const a = tangent[index] / slope[index];
      const b = tangent[index + 1] / slope[index];
      const sum = a * a + b * b;
      if (sum > 9) {
        const ratio = 3 / Math.sqrt(sum);
        tangent[index] = ratio * a * slope[index];
        tangent[index + 1] = ratio * b * slope[index];
      }
    }
  }
  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 0; index < count - 1; index += 1) {
    const third = dx[index] / 3;
    const cp1x = points[index].x + third;
    const cp1y = points[index].y + tangent[index] * third;
    const cp2x = points[index + 1].x - third;
    const cp2y = points[index + 1].y - tangent[index + 1] * third;
    path += ` C${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${points[index + 1].x.toFixed(2)} ${points[index + 1].y.toFixed(2)}`;
  }
  return path;
};

const ratioAxisMax = (max: number) => {
  const raw = Math.max(max * 1.15, 1) / 4;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return Math.min(100, Math.max(4, nice * magnitude * 4));
};

export function OverviewTrendChart({ points, metric, emptyLabel }: { points: TrendPoint[]; metric: OverviewMetric; emptyLabel: string }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = `overview-area-${useId().replace(/:/g, '')}`;
  const lineRefs = useRef<(SVGPathElement | null)[]>([]);
  const [dashLengths, setDashLengths] = useState<number[]>([]);
  const [reveal, setReveal] = useState(1);
  const firstRender = useRef(true);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const update = () => setWidth(Math.max(320, element.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setHover(null);
  }, [points, metric]);

  const isRatio = metric !== 'conversations';
  const values = useMemo(() => points.map((point) => metricValue(point, metric)), [points, metric]);
  const plotValues = useMemo(() => values.map((value) => (value === null || !isRatio ? value : value * 100)), [values, isRatio]);
  const hasValue = values.some((value) => value !== null);
  const signature = useMemo(
    () => `${metric}:${points.map((point) => `${point.key}=${metricValue(point, metric) ?? 'x'}`).join('|')}`,
    [points, metric],
  );

  useLayoutEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!hasValue || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReveal(1);
      return;
    }
    setDashLengths(lineRefs.current.map((path) => (path ? path.getTotalLength() : 0)));
    setReveal(0);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / 650, 1);
      setReveal(1 - (1 - progress) ** 3);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [signature, hasValue]);

  const innerWidth = Math.max(120, width - PADDING.left - PADDING.right);
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const maxValue = plotValues.reduce<number>((max, value) => (value !== null && value > max ? value : max), 0);
  const yMax = isRatio ? ratioAxisMax(maxValue) : (maxValue <= 4 ? 4 : Math.ceil(maxValue / 4) * 4);

  const xAt = (index: number) => (points.length <= 1 ? PADDING.left + innerWidth / 2 : PADDING.left + (index / (points.length - 1)) * innerWidth);
  const yAt = (value: number) => PADDING.top + innerHeight - (value / yMax) * innerHeight;

  const segments: { x: number; y: number }[][] = [];
  let running: { x: number; y: number }[] = [];
  plotValues.forEach((value, index) => {
    if (value === null) {
      if (running.length) segments.push(running);
      running = [];
      return;
    }
    running.push({ x: xAt(index), y: yAt(value) });
  });
  if (running.length) segments.push(running);
  const baseline = PADDING.top + innerHeight;

  const labelStep = Math.max(1, Math.ceil(points.length / 8));
  const tooltipLeft = hover === null ? 0 : Math.min(Math.max(xAt(hover), 84), Math.max(84, width - 84));
  const hoverValue = hover === null ? null : values[hover];
  const hoverPlotValue = hover === null ? null : plotValues[hover];
  const tooltipTop = hover === null || hoverValue === null || hoverPlotValue === null ? PADDING.top : Math.min(Math.max(yAt(hoverPlotValue) - 64, 8), HEIGHT - 88);

  const handleMove = (event: MouseEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = (event.clientX - rect.left) / Math.max(1, rect.width);
    const index = Math.round(offset * Math.max(0, points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, index)));
  };

  if (!points.length || !hasValue) return <div className="overview-chart-empty">{emptyLabel}</div>;

  return <div className="overview-chart-canvas" ref={canvasRef} role="img" aria-label="指标趋势图">
    <svg width="100%" height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="overview-chart-gradient-start" />
          <stop offset="100%" className="overview-chart-gradient-end" />
        </linearGradient>
      </defs>
      {TICKS.map((tick) => {
        const value = yMax * tick;
        const y = yAt(value);
        return <g key={tick}>
          <line x1={PADDING.left} x2={PADDING.left + innerWidth} y1={y} y2={y} className="overview-chart-grid" />
          <text x={PADDING.left - 10} y={y + 4} textAnchor="end" className="overview-chart-axis">{isRatio ? `${Math.round(value)}%` : formatMetricValue(value, metric)}</text>
        </g>;
      })}
      {points.map((point, index) => (index % labelStep === 0 || index === points.length - 1) && <text key={point.key} x={xAt(index)} y={HEIGHT - 10} textAnchor={index === points.length - 1 ? 'end' : 'middle'} className="overview-chart-axis">{point.label}</text>)}
      {segments.map((segment, segmentIndex) => {
        if (segment.length < 2) return <circle key={segmentIndex} cx={segment[0].x} cy={segment[0].y} r={3} className="overview-chart-dot" opacity={reveal < 1 ? reveal : undefined} />;
        const line = monotonePath(segment);
        const first = segment[0];
        const last = segment[segment.length - 1];
        const length = dashLengths[segmentIndex] ?? 0;
        const drawing = reveal < 1 && length > 0;
        return <g key={segmentIndex}>
          <path
            d={`${line} L${last.x.toFixed(2)} ${baseline} L${first.x.toFixed(2)} ${baseline} Z`}
            className="overview-chart-area"
            fill={`url(#${gradientId})`}
            opacity={reveal < 1 ? Math.max(0, (reveal - 0.12) / 0.88) : undefined}
          />
          <path
            ref={(element) => { lineRefs.current[segmentIndex] = element; }}
            d={line}
            className="overview-chart-line"
            strokeDasharray={drawing ? length : undefined}
            strokeDashoffset={drawing ? length * (1 - reveal) : undefined}
          />
        </g>;
      })}
      {hover !== null && <g pointerEvents="none">
        <line x1={xAt(hover)} x2={xAt(hover)} y1={PADDING.top} y2={PADDING.top + innerHeight} className="overview-chart-guide" />
        {hoverValue !== null && hoverPlotValue !== null && <>
          <circle cx={xAt(hover)} cy={yAt(hoverPlotValue)} r={9} className="overview-chart-pulse" />
          <circle cx={xAt(hover)} cy={yAt(hoverPlotValue)} r={4} className="overview-chart-hover-dot" />
        </>}
      </g>}
      <rect x={PADDING.left} y={PADDING.top} width={innerWidth} height={innerHeight} fill="transparent" onMouseMove={handleMove} onMouseLeave={() => setHover(null)} />
    </svg>
    {hover !== null && <div className="overview-chart-tooltip" style={{ left: tooltipLeft, top: tooltipTop }}>
      <span className="overview-chart-tooltip-time">{points[hover].fullLabel}</span>
      <strong>{hoverValue === null ? '暂无可计算数据' : formatMetricValue(hoverValue, metric)}</strong>
    </div>}
  </div>;
}
