import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { IconQuestionCircle, IconRefresh } from '@arco-design/web-react/icon';
import { Button, DatePicker, Message, Radio, Select, Tooltip } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { ChannelTypeIcon } from '../components/ChannelTypeIcon';
import { OverviewTrendChart } from '../components/OverviewTrendChart';
import { OverviewRecordsModal } from '../components/OverviewRecordsModal';
import { useAppStore } from '../store';
import type { MetricDelta, OverviewFilters, OverviewMetric, OverviewResult, TimeRangeKey } from '../overview/analytics';
import { computeOverview, defaultDateRange, formatCount, formatDayKey, resolveRange } from '../overview/analytics';
import { OVERVIEW_SESSIONS } from '../overview/mockData';

const METRIC_OPTIONS = [
  { label: '会话数', value: 'conversations' },
  { label: 'AI 解决率', value: 'aiResolved' },
  { label: '转人工率', value: 'transfer' },
];

const RANGE_OPTIONS = [
  { label: '今天', value: 'today' },
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
  { label: '自定义日期范围', value: 'custom' },
];

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const ratioText = (numerator: number, denominator: number) => (denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : '—');

const deltaText = (delta: MetricDelta) => {
  if (delta.kind === 'new') return '新增';
  if (delta.kind === 'none') return '—';
  const unit = delta.kind === 'percent' ? '%' : ' p.p.';
  const amount = `${Math.abs(delta.value).toFixed(1)}${unit}`;
  if (delta.direction === 'flat') return amount;
  return `${delta.direction === 'up' ? '↑' : '↓'} ${amount}`;
};

// 会话数涨跌为中性；解决率上升、转人工率下降为正向。颜色只作辅助，箭头与数字始终同时呈现。
const deltaTone = (metric: OverviewMetric, delta: MetricDelta) => {
  if (metric === 'conversations' || delta.kind !== 'pp' || delta.direction === 'flat') return 'neutral';
  const positive = metric === 'aiResolved' ? delta.direction === 'up' : delta.direction === 'down';
  return positive ? 'positive' : 'negative';
};

type MetricCard = {
  key: OverviewMetric;
  label: string;
  tip: string;
  value: string;
  delta: MetricDelta | null;
  compare: string;
  aux: { label: string; value: string }[] | null;
};

export function OverviewPage() {
  const { state } = useAppStore();
  const location = useLocation();
  const [initialRange] = useState(() => defaultDateRange(new Date()));
  const [range, setRange] = useState<TimeRangeKey>('7d');
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [agentId, setAgentId] = useState('all');
  const [channelId, setChannelId] = useState('all');
  const [metric, setMetric] = useState<OverviewMetric>('conversations');
  const [result, setResult] = useState<OverviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordsRange, setRecordsRange] = useState(() => {
    const initial = defaultDateRange(new Date());
    return { start: initial.startDate, end: initial.endDate };
  });
  const requestRef = useRef(0);
  const mockMode = new URLSearchParams(location.search).get('mock');

  const loadDelay = mockMode === 'slow' ? 2200 : 320;

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setFailed(false);
    wait(loadDelay).then(() => {
      if (requestRef.current !== requestId) return;
      if (mockMode === 'error') {
        setFailed(true);
        setLoading(false);
        return;
      }
      const filters: OverviewFilters = { range, startDate, endDate, agentId, channelId };
      setResult(computeOverview(OVERVIEW_SESSIONS, filters, new Date()));
      setLoading(false);
    });
  }, [range, startDate, endDate, agentId, channelId, loadDelay, mockMode]);

  // 选中的 Agent / 渠道被删除后，只重置失效的那一项，保留其他筛选条件
  useEffect(() => {
    if (agentId !== 'all' && !state.agents.some((agent) => agent.id === agentId)) setAgentId('all');
  }, [agentId, state.agents]);

  useEffect(() => {
    if (channelId !== 'all' && !state.channels.some((channel) => channel.id === channelId)) setChannelId('all');
  }, [channelId, state.channels]);

  const refresh = async () => {
    if (refreshing) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setRefreshing(true);
    setFailed(false);
    await wait(loadDelay);
    if (requestRef.current !== requestId) return;
    if (mockMode === 'error') {
      setFailed(true);
      setRefreshing(false);
      setLoading(false);
      return;
    }
    const filters: OverviewFilters = { range, startDate, endDate, agentId, channelId };
    setResult(computeOverview(OVERVIEW_SESSIONS, filters, new Date()));
    setRefreshing(false);
    setLoading(false);
  };

  const retry = async () => {
    if (!result) setLoading(true);
    await refresh();
  };

  const openRecords = () => {
    const current = resolveRange({ range, startDate, endDate, agentId, channelId }, new Date());
    setRecordsRange({ start: formatDayKey(new Date(current.start)), end: formatDayKey(new Date(current.end)) });
    setRecordsOpen(true);
  };

  const totals = result?.totals ?? null;
  const previous = result?.previous ?? null;
  const showSkeleton = loading && !result;
  const agentOptions = [{ label: '全部 AI Agent', value: 'all' }, ...state.agents.map((agent) => ({ label: agent.name || '未命名', value: agent.id }))];
  const channelOptions = [
    { label: '全部渠道', value: 'all' },
    ...state.channels.map((channel) => ({
      value: channel.id,
      label: <span className="overview-channel-option"><ChannelTypeIcon type={channel.type ?? 'livechat'} className="overview-channel-icon" />{channel.name}</span>,
    })),
  ];

  const cards: MetricCard[] = [
    {
      key: 'conversations',
      label: '会话数',
      tip: '所选时间范围内已结束的正式会话数，等于有效会话与无效会话之和；处理中的会话不计入。',
      value: totals ? formatCount(totals.n) : '—',
      delta: result?.delta.conversations ?? null,
      compare: previous ? `对比上期 ${formatCount(previous.n)}` : '对比上期 —',
      aux: totals ? [{ label: '有效会话', value: formatCount(totals.v) }, { label: '无效会话', value: formatCount(totals.i) }] : null,
    },
    {
      key: 'aiResolved',
      label: 'AI 解决率',
      tip: 'AI 独立解决且未转人工的有效会话数 ÷ 有效会话数；无效会话不计入。',
      value: totals ? ratioText(totals.s, totals.v) : '—',
      delta: result?.delta.aiResolved ?? null,
      compare: previous ? `对比上期 ${ratioText(previous.s, previous.v)}` : '对比上期 —',
      aux: null,
    },
    {
      key: 'transfer',
      label: '转人工率',
      tip: '执行过转人工指令的有效会话数 ÷ 有效会话数；每场会话最多计 1 次，无效会话不计入。',
      value: totals ? ratioText(totals.h, totals.v) : '—',
      delta: result?.delta.transfer ?? null,
      compare: previous ? `对比上期 ${ratioText(previous.h, previous.v)}` : '对比上期 —',
      aux: null,
    },
  ];

  return <div className="page-content module-page overview-page">
    <PageHeader title="总览" actions={<Button icon={<IconRefresh />} loading={refreshing} onClick={() => { void refresh(); }}>刷新</Button>} />
    <div className="filter-bar overview-filter-bar">
      <div className="overview-filter-group">
        <Radio.Group type="button" value={range} options={RANGE_OPTIONS} onChange={(value: TimeRangeKey) => setRange(value)} className="overview-segmented" />
        {range === 'custom' && <DatePicker.RangePicker
          value={[startDate, endDate]}
          allowClear={false}
          style={{ width: 252 }}
          disabledDate={(current) => !!current && current.valueOf() > Date.now()}
          onChange={(value) => {
            if (!Array.isArray(value) || value.length < 2) return;
            const nextStart = String(value[0] ?? '');
            const nextEnd = String(value[1] ?? '');
            if (!nextStart || !nextEnd) return;
            // 结束早于开始时明确提示，保持原有区间
            if (nextEnd < nextStart) {
              Message.warning('结束日期不能早于开始日期');
              return;
            }
            setStartDate(nextStart);
            setEndDate(nextEnd);
          }}
        />}
        <Select value={agentId} options={agentOptions} onChange={(value: string) => setAgentId(value)} style={{ width: 160 }} aria-label="AI Agent" />
        <Select value={channelId} options={channelOptions} onChange={(value: string) => setChannelId(value)} style={{ width: 180 }} aria-label="渠道" />
      </div>
    </div>
    {failed && result && <div className="overview-error" role="alert">
      <span>数据加载失败，已保留上次成功的数据，请稍后重试。</span>
      <Button size="small" type="primary" onClick={() => { void retry(); }}>重试</Button>
    </div>}
    {failed && !result
      ? <div className="overview-metric-failed" role="alert">
          <span>数据加载失败，未能获取统计数据。</span>
          <Button size="small" type="primary" onClick={() => { void retry(); }}>重试</Button>
        </div>
      : <div className="metric-grid overview-metric-grid">
          {cards.map((card) => <section className="metric-card overview-metric-card" key={card.key}>
            <div className="metric-label overview-metric-label">
              <span>{card.label}</span>
              <Tooltip title={card.tip}><span className="overview-metric-tip" tabIndex={0} aria-label={`${card.label}口径`}><IconQuestionCircle aria-hidden="true" /></span></Tooltip>
            </div>
            {showSkeleton
              ? <div className="overview-skeleton overview-skeleton-value" />
              : <div className="overview-metric-figure">
                  <span className="metric-value overview-metric-value">{card.value}</span>
                  {card.delta && <span className={`overview-delta overview-delta--${deltaTone(card.key, card.delta)}`}>{deltaText(card.delta)}</span>}
                </div>}
            {showSkeleton
              ? card.key === 'conversations' && <div className="overview-skeleton overview-skeleton-aux" />
              : card.aux && <div className="overview-metric-aux">
                  {card.aux.map((item) => <span key={item.label}>{item.label} <strong>{item.value}</strong></span>)}
                </div>}
            {showSkeleton
              ? <div className="overview-skeleton overview-skeleton-compare" />
              : <div className="overview-metric-note">{card.compare}</div>}
          </section>)}
        </div>}
    <section className="overview-chart-card">
      <div className="overview-chart-head">
        <h2>数据趋势</h2>
        <div className="overview-chart-actions">
          <Button type="text" size="small" className="overview-chart-link" onClick={openRecords}>查看会话记录</Button>
          <Select value={metric} options={METRIC_OPTIONS} onChange={(value: OverviewMetric) => setMetric(value)} style={{ width: 132 }} aria-label="趋势指标" />
        </div>
      </div>
      <div className="overview-chart-body">
        {showSkeleton
          ? <div className="overview-chart-skeleton"><div className="overview-skeleton" /></div>
          : failed && !result
            ? <div className="overview-chart-empty">加载失败</div>
            : !result || result.totals.n === 0
              ? <div className="overview-chart-empty">暂无数据</div>
              : <OverviewTrendChart points={result.points} metric={metric} emptyLabel="暂无可计算数据" />}
      </div>
    </section>
    {recordsOpen && <OverviewRecordsModal
      startDate={recordsRange.start}
      endDate={recordsRange.end}
      agentId={agentId}
      channelId={channelId}
      metric={metric}
      mockMode={mockMode}
      onClose={() => setRecordsOpen(false)}
    />}
  </div>;
}
