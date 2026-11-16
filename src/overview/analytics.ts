export type SessionOutcome = 'resolved' | 'unresolved' | 'handoff' | null;

export type OverviewSession = {
  id: string;
  createdAt: string;
  agentId: string;
  channelId: string;
  ended: boolean;
  /** 有效会话标记；无效会话只出现在已结束会话中，且不参与解决与转人工判定 */
  valid: boolean;
  outcome: SessionOutcome;
};

export type TimeRangeKey = 'today' | '7d' | '30d' | 'custom';

export type OverviewFilters = {
  range: TimeRangeKey;
  startDate: string;
  endDate: string;
  agentId: string;
  channelId: string;
};

export type OverviewMetric = 'conversations' | 'aiResolved' | 'transfer';

export type TrendGranularity = 'hour' | 'day' | 'week' | 'month';

/** n：已结束正式会话 N；v：有效会话 V；i：无效会话 I；s：AI 解决 S；u：未解决 U；h：转人工 H */
export type OverviewTotals = { n: number; v: number; i: number; s: number; u: number; h: number };

export type DateRange = { start: number; end: number };

export type DeltaKind = 'percent' | 'pp' | 'new' | 'none';
export type DeltaDirection = 'up' | 'down' | 'flat';

/** 较上期对比：percent 为相对增长率，pp 为百分点差，new 为上期为 0 但本期有值，none 为无法比较 */
export type MetricDelta = { kind: DeltaKind; direction: DeltaDirection; value: number };

export type OverviewDelta = {
  conversations: MetricDelta;
  aiResolved: MetricDelta;
  transfer: MetricDelta;
};

export type TrendPoint = {
  key: string;
  start: number;
  end: number;
  label: string;
  fullLabel: string;
  n: number;
  v: number;
  s: number;
  h: number;
};

export type OverviewResult = {
  totals: OverviewTotals;
  previous: OverviewTotals;
  delta: OverviewDelta;
  granularity: TrendGranularity;
  points: TrendPoint[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (value: number) => String(value).padStart(2, '0');
const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const formatDayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseDayKey = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const defaultDateRange = (now: Date) => {
  const end = startOfDay(now);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { startDate: formatDayKey(start), endDate: formatDayKey(end) };
};

const mondayOf = (date: Date) => {
  const next = startOfDay(date);
  const offset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - offset);
  return next;
};

const monthStartOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const dayCount = (start: number, end: number) => Math.round((startOfDay(new Date(end)).getTime() - startOfDay(new Date(start)).getTime()) / DAY_MS) + 1;

export function resolveRange(filters: OverviewFilters, now: Date): DateRange {
  const today = startOfDay(now);
  if (filters.range === 'today') return { start: today.getTime(), end: now.getTime() };
  if (filters.range === '7d' || filters.range === '30d') {
    const start = new Date(today);
    start.setDate(start.getDate() - (filters.range === '7d' ? 6 : 29));
    return { start: start.getTime(), end: now.getTime() };
  }
  const start = parseDayKey(filters.startDate) ?? today;
  const endDate = parseDayKey(filters.endDate) ?? start;
  const end = new Date(Math.max(start.getTime(), endDate.getTime()));
  end.setHours(23, 59, 59, 999);
  // 自定义区间包含今天时统计截至当前时刻，与快捷区间口径一致
  if (end.getTime() > now.getTime()) end.setTime(now.getTime());
  return { start: start.getTime(), end: end.getTime() };
}

/** 上一期只平移时间范围，自然日数量与本期相同；本期含今天时，上期末日截断到同一时分 */
export function resolvePreviousRange(filters: OverviewFilters, current: DateRange, now: Date): DateRange {
  if (filters.range === 'today') {
    return { start: current.start - DAY_MS, end: current.end - DAY_MS };
  }
  if (filters.range === '7d' || filters.range === '30d') {
    const days = filters.range === '7d' ? 7 : 30;
    return { start: current.start - days * DAY_MS, end: current.end - days * DAY_MS };
  }
  const days = dayCount(current.start, current.end);
  const previousStart = new Date(current.start);
  previousStart.setDate(previousStart.getDate() - days);
  const includesToday = current.end >= startOfDay(now).getTime();
  if (includesToday) {
    return { start: previousStart.getTime(), end: current.start - DAY_MS + (now.getTime() - startOfDay(now).getTime()) };
  }
  return { start: previousStart.getTime(), end: current.start - 1 };
}

export function granularityFor(filters: OverviewFilters, start: number, end: number): TrendGranularity {
  if (filters.range === 'today') return 'hour';
  const days = dayCount(start, end);
  if (days <= 30) return 'day';
  if (days <= 90) return 'week';
  return 'month';
}

const emptyPoint = (key: string, start: number, end: number, label: string, fullLabel: string): TrendPoint => ({ key, start, end, label, fullLabel, n: 0, v: 0, s: 0, h: 0 });

export function buildBuckets(granularity: TrendGranularity, start: number, end: number): TrendPoint[] {
  const buckets: TrendPoint[] = [];
  if (granularity === 'hour') {
    const base = startOfDay(new Date(start));
    for (let hour = 0; hour < 24; hour += 1) {
      const bucketStart = new Date(base);
      bucketStart.setHours(hour);
      const bucketEnd = Math.min(bucketStart.getTime() + 60 * 60 * 1000 - 1, end);
      if (bucketStart.getTime() > end) break;
      const label = `${pad(hour)}:00`;
      buckets.push(emptyPoint(`h-${hour}`, bucketStart.getTime(), bucketEnd, label, label));
    }
    return buckets;
  }

  if (granularity === 'day') {
    const cursor = startOfDay(new Date(start));
    while (cursor.getTime() <= end) {
      const bucketStart = Math.max(cursor.getTime(), start);
      const bucketEnd = Math.min(cursor.getTime() + DAY_MS - 1, end);
      const label = `${cursor.getMonth() + 1}/${cursor.getDate()}`;
      const fullLabel = `${cursor.getFullYear()}/${cursor.getMonth() + 1}/${cursor.getDate()}`;
      buckets.push(emptyPoint(`d-${formatDayKey(cursor)}`, bucketStart, bucketEnd, label, fullLabel));
      cursor.setDate(cursor.getDate() + 1);
    }
    return buckets;
  }

  if (granularity === 'week') {
    const cursor = mondayOf(new Date(start));
    while (cursor.getTime() <= end) {
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const bucketStart = Math.max(cursor.getTime(), start);
      const bucketEnd = Math.min(weekEnd.getTime() + DAY_MS - 1, end);
      const startLabel = `${cursor.getMonth() + 1}/${cursor.getDate()}`;
      const endLabel = `${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;
      buckets.push(emptyPoint(`w-${formatDayKey(cursor)}`, bucketStart, bucketEnd, `${startLabel}–${endLabel}`, `${cursor.getFullYear()}/${startLabel}–${endLabel}`));
      cursor.setDate(cursor.getDate() + 7);
    }
    return buckets;
  }

  const cursor = monthStartOf(new Date(start));
  while (cursor.getTime() <= end) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const bucketStart = Math.max(cursor.getTime(), start);
    const bucketEnd = Math.min(monthEnd.getTime() + DAY_MS - 1, end);
    const label = `${cursor.getFullYear()}/${cursor.getMonth() + 1}`;
    buckets.push(emptyPoint(`m-${cursor.getFullYear()}-${cursor.getMonth() + 1}`, bucketStart, bucketEnd, label, `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return buckets;
}

export function filterSessions(sessions: OverviewSession[], filters: OverviewFilters, start: number, end: number): OverviewSession[] {
  return sessions.filter((session) => {
    const created = new Date(session.createdAt).getTime();
    if (created < start || created > end) return false;
    if (filters.agentId !== 'all' && session.agentId !== filters.agentId) return false;
    if (filters.channelId !== 'all' && session.channelId !== filters.channelId) return false;
    return true;
  });
}

// 只统计已结束的正式会话：无效会话不计入解决/转人工，转人工优先于已解决
const summarize = (sessions: OverviewSession[]): OverviewTotals => sessions.reduce<OverviewTotals>((sum, session) => {
  if (!session.ended) return sum;
  sum.n += 1;
  if (!session.valid) {
    sum.i += 1;
    return sum;
  }
  sum.v += 1;
  if (session.outcome === 'handoff') sum.h += 1;
  else if (session.outcome === 'resolved') sum.s += 1;
  else sum.u += 1;
  return sum;
}, { n: 0, v: 0, i: 0, s: 0, u: 0, h: 0 });

const round1 = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const directionOf = (value: number): DeltaDirection => (value > 0 ? 'up' : value < 0 ? 'down' : 'flat');

const ratioOf = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : null);

export function compareTotals(totals: OverviewTotals, previous: OverviewTotals): OverviewDelta {
  let conversations: MetricDelta;
  if (previous.n === 0) {
    conversations = totals.n === 0 ? { kind: 'none', direction: 'flat', value: 0 } : { kind: 'new', direction: 'flat', value: 0 };
  } else {
    const value = round1(((totals.n - previous.n) / previous.n) * 100);
    conversations = { kind: 'percent', direction: directionOf(value), value };
  }

  const pp = (current: number | null, before: number | null): MetricDelta => {
    if (current === null || before === null) return { kind: 'none', direction: 'flat', value: 0 };
    const value = round1((current - before) * 100);
    return { kind: 'pp', direction: directionOf(value), value };
  };

  return {
    conversations,
    aiResolved: pp(ratioOf(totals.s, totals.v), ratioOf(previous.s, previous.v)),
    transfer: pp(ratioOf(totals.h, totals.v), ratioOf(previous.h, previous.v)),
  };
}

export function computeOverview(sessions: OverviewSession[], filters: OverviewFilters, now: Date): OverviewResult {
  const current = resolveRange(filters, now);
  const previousRange = resolvePreviousRange(filters, current, now);
  const matched = filterSessions(sessions, filters, current.start, current.end);
  const previousMatched = filterSessions(sessions, filters, previousRange.start, previousRange.end);
  const totals = summarize(matched);
  const previous = summarize(previousMatched);

  const granularity = granularityFor(filters, current.start, current.end);
  const points = buildBuckets(granularity, current.start, current.end);
  matched.forEach((session) => {
    const created = new Date(session.createdAt).getTime();
    for (const point of points) {
      if (created < point.start || created > point.end) continue;
      if (!session.ended) break;
      point.n += 1;
      if (session.valid) {
        point.v += 1;
        if (session.outcome === 'handoff') point.h += 1;
        else if (session.outcome === 'resolved') point.s += 1;
      }
      break;
    }
  });

  return { totals, previous, delta: compareTotals(totals, previous), granularity, points };
}

export const metricValue = (point: Pick<TrendPoint, 'n' | 'v' | 's' | 'h'>, metric: OverviewMetric): number | null => {
  if (metric === 'conversations') return point.n;
  if (metric === 'aiResolved') return point.v > 0 ? point.s / point.v : null;
  return point.v > 0 ? point.h / point.v : null;
};

export const formatCount = (value: number) => value.toLocaleString('zh-CN');

export const formatMetricValue = (value: number | null, metric: OverviewMetric) => {
  if (value === null) return '—';
  if (metric === 'conversations') return formatCount(Math.round(value));
  return `${(value * 100).toFixed(1)}%`;
};
