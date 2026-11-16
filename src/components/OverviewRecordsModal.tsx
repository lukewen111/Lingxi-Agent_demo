import { useEffect, useMemo, useRef, useState } from 'react';
import { IconExclamationCircle, IconMessage, IconRefresh } from '@arco-design/web-react/icon';
import { Button, Modal, Tabs } from './ui';
import { ChatMessageRow, ConversationRow } from './InboxConversationParts';
import { MemberAvatar } from './MemberAvatar';
import { useAppStore } from '../store';
import type { OverviewMetric } from '../overview/analytics';
import { OVERVIEW_SESSIONS, buildSessionMessages, lastMessagePreview } from '../overview/mockData';
import type { OverviewSessionRecord } from '../overview/mockData';

type TypeFilter = 'all' | 'valid' | 'invalid';
type ResultFilter = 'resolved' | 'unresolved' | 'handoff';

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'valid', label: '有效' },
  { key: 'invalid', label: '无效' },
];

// 处理结果默认不选中，不选中表示不限制
const RESULT_OPTIONS: { key: ResultFilter; label: string }[] = [
  { key: 'resolved', label: '已解决' },
  { key: 'unresolved', label: '未解决' },
  { key: 'handoff', label: '转人工' },
];

// 默认分类由趋势当前指标决定
const initialType = (metric: OverviewMetric): TypeFilter => (metric === 'conversations' ? 'all' : 'valid');
const initialResult = (metric: OverviewMetric): ResultFilter | null => {
  if (metric === 'aiResolved') return 'resolved';
  if (metric === 'transfer') return 'handoff';
  return null;
};

const isSameDay = (date: Date, now: Date) => date.getFullYear() === now.getFullYear()
  && date.getMonth() === now.getMonth()
  && date.getDate() === now.getDate();

// 与收件箱一致的显示规则：列表当天只显示时分，跨天显示月日
const formatListTime = (value: string) => {
  const date = new Date(value);
  const now = new Date();
  if (isSameDay(date, now)) {
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

// 与收件箱一致：消息当天只显示时分，跨天显示月日 + 时分
const formatMessageTime = (value: string) => {
  const date = new Date(value);
  const now = new Date();
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return isSameDay(date, now) ? time : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
};

/** 只读图片消息：加载失败时展示占位，不出现破图 */
function ReadOnlyChatImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="overview-records-image-fallback" role="img" aria-label={`${alt}（加载失败）`}>
    <IconExclamationCircle />
    <span>图片加载失败</span>
  </div>;
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

const resultMeta = (session: OverviewSessionRecord) => {
  if (!session.valid) return { label: '无效', className: 'is-invalid' };
  if (session.outcome === 'resolved') return { label: '已解决', className: 'is-resolved' };
  if (session.outcome === 'handoff') return { label: '转人工', className: 'is-handoff' };
  return { label: '未解决', className: 'is-unresolved' };
};

type OverviewRecordsModalProps = {
  startDate: string;
  endDate: string;
  agentId: string;
  channelId: string;
  metric: OverviewMetric;
  mockMode: string | null;
  onClose: () => void;
};

export function OverviewRecordsModal({ startDate, endDate, agentId, channelId, metric, mockMode, onClose }: OverviewRecordsModalProps) {
  const { state } = useAppStore();
  // 时间、Agent、渠道继承总览条件，弹窗内不重复展示
  const agentFilter = state.agents.some((agent) => agent.id === agentId) ? agentId : 'all';
  const channelFilter = state.channels.some((channel) => channel.id === channelId) ? channelId : 'all';
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() => initialType(metric));
  const [resultFilter, setResultFilter] = useState<ResultFilter | null>(() => initialResult(metric));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [recovered, setRecovered] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setListState('loading');
    const timer = window.setTimeout(() => {
      setListState(mockMode === 'error' && !recovered ? 'error' : 'ready');
    }, 260);
    return () => window.clearTimeout(timer);
  }, [typeFilter, resultFilter, mockMode, recovered]);

  const selectType = (next: TypeFilter) => {
    if (next === typeFilter) return;
    setTypeFilter(next);
    // 全部与有效之间切换保留已选处理结果；无效会话没有处理结果，进入时清除选中
    if (next === 'invalid') setResultFilter(null);
  };

  // 外层条件（时间/Agent/渠道）命中的已结束会话，用于两组筛选的数量统计
  const baseSessions = useMemo(() => {
    const start = new Date(`${startDate}T00:00:00`).getTime();
    const end = new Date(`${endDate}T23:59:59.999`).getTime();
    return OVERVIEW_SESSIONS.filter((session) => {
      if (!session.ended) return false;
      const created = new Date(session.createdAt).getTime();
      if (created < start || created > end) return false;
      if (agentFilter !== 'all' && session.agentId !== agentFilter) return false;
      if (channelFilter !== 'all' && session.channelId !== channelFilter) return false;
      return true;
    });
  }, [startDate, endDate, agentFilter, channelFilter]);

  // Tab 数量只受外层条件影响，不随处理结果标签变化
  const typeCounts = useMemo(() => {
    const valid = baseSessions.filter((session) => session.valid).length;
    return { all: baseSessions.length, valid, invalid: baseSessions.length - valid };
  }, [baseSessions]);

  // 处理结果数量按当前 Tab 范围统计，不受当前选中标签影响
  const resultCounts = useMemo(() => {
    const scope = typeFilter === 'invalid' ? [] : baseSessions.filter((session) => session.valid);
    return {
      resolved: scope.filter((session) => session.outcome === 'resolved').length,
      unresolved: scope.filter((session) => session.outcome === 'unresolved').length,
      handoff: scope.filter((session) => session.outcome === 'handoff').length,
    };
  }, [baseSessions, typeFilter]);

  const sessions = useMemo(() => baseSessions.filter((session) => {
    if (typeFilter === 'valid' && !session.valid) return false;
    if (typeFilter === 'invalid' && session.valid) return false;
    if (resultFilter && session.outcome !== resultFilter) return false;
    return true;
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [baseSessions, typeFilter, resultFilter]);

  // 加载中显示占位，失败不显示为 0
  const countSuffix = (count: number) => (listState === 'ready' ? ` ${count}` : listState === 'loading' ? ' …' : '');

  // 更换分类时回到当前列表首条；历史浏览选中的会话可以不在当前列表内
  useEffect(() => {
    setSelectedId(null);
  }, [typeFilter, resultFilter]);

  useEffect(() => {
    if (listState === 'ready' && selectedId === null) setSelectedId(sessions[0]?.id ?? null);
  }, [listState, sessions, selectedId]);

  const selected = useMemo(
    () => OVERVIEW_SESSIONS.find((session) => session.id === selectedId && session.ended) ?? null,
    [selectedId],
  );
  const messages = useMemo(() => (selected ? buildSessionMessages(selected) : []), [selected]);
  const selectedAgent = selected ? state.agents.find((agent) => agent.id === selected.agentId) : undefined;

  useEffect(() => {
    if (listState !== 'ready' || !selected) return;
    const viewport = viewportRef.current;
    viewport?.scrollTo({ top: viewport.scrollHeight });
  }, [selectedId, listState, selected]);
  const agentName = selectedAgent?.name ?? (selected ? '已删除 Agent' : '');
  // 页脚沿用收件箱的状态文案，无效与未解决统一为「已关闭」
  const footerText = !selected
    ? ''
    : selected.valid && selected.outcome === 'resolved'
      ? '该会话已由 AI Agent 解决'
      : selected.valid && selected.outcome === 'handoff'
        ? '该会话已转接给人工客服'
        : '该会话已关闭';

  return <Modal
    open
    title="会话记录"
    footer={null}
    alignCenter
    className="overview-records-modal"
    style={{ width: 'min(1120px, calc(100vw - 32px))' }}
    onCancel={onClose}
  >
    <div className="overview-records">
      <div className="overview-records-classify">
        <Tabs
          activeKey={typeFilter}
          items={TYPE_TABS.map((tab) => ({ ...tab, label: `${tab.label}${countSuffix(typeCounts[tab.key])}` }))}
          onChange={(key: TypeFilter) => selectType(key)}
          className="overview-records-tabs"
        />
        {typeFilter !== 'invalid' && <div className="overview-records-chips" role="radiogroup" aria-label="处理结果">
          {RESULT_OPTIONS.map((option) => <button
            type="button"
            key={option.key}
            role="radio"
            aria-checked={resultFilter === option.key}
            className={`overview-records-chip ${resultFilter === option.key ? 'is-active' : ''}`}
            onClick={() => setResultFilter(resultFilter === option.key ? null : option.key)}
          >{option.label}{countSuffix(resultCounts[option.key])}</button>)}
        </div>}
      </div>
      <div className="overview-records-body">
        <aside className="overview-records-list" aria-label="会话列表">
          {listState === 'loading' && <div className="overview-records-loading">
            {Array.from({ length: 7 }, (_, index) => <div className="overview-records-row-skeleton" key={index}><span className="overview-skeleton" /><span className="overview-skeleton" /></div>)}
          </div>}
          {listState === 'error' && <div className="inbox-centered-state">
            <IconExclamationCircle />
            <strong>会话列表加载失败</strong>
            <Button type="primary" icon={<IconRefresh />} onClick={() => setRecovered(true)}>重新加载</Button>
          </div>}
          {listState === 'ready' && sessions.length === 0 && <div className="inbox-centered-state">
            <IconMessage />
            <strong>暂无会话记录</strong>
          </div>}
          {listState === 'ready' && sessions.map((session) => {
            const channel = state.channels.find((item) => item.id === session.channelId);
            const name = state.agents.find((agent) => agent.id === session.agentId)?.name ?? '已删除 Agent';
            const meta = resultMeta(session);
            return <ConversationRow
              key={session.id}
              customerName={session.customerName}
              time={formatListTime(session.updatedAt)}
              preview={lastMessagePreview(session)}
              channelType={channel?.type ?? 'livechat'}
              channelName={channel?.name ?? '已删除渠道'}
              agentName={name}
              active={selectedId === session.id}
              badge={meta}
              onSelect={() => setSelectedId(session.id)}
            />;
          })}
        </aside>
        <section className="overview-records-detail" aria-label="会话详情">
          {listState === 'loading'
            ? <div className="overview-records-detail-loading">
                <div className="inbox-message-skeleton" aria-label="消息加载中">
                  <span className="inbox-skeleton-bubble is-left" />
                  <span className="inbox-skeleton-bubble is-right" />
                  <span className="inbox-skeleton-bubble is-left is-short" />
                </div>
              </div>
            : listState === 'error'
              ? <div className="inbox-detail-empty">
                  <IconExclamationCircle />
                  <strong>会话加载失败</strong>
                </div>
              : !selected
                ? <div className="inbox-detail-empty">
                    <IconMessage />
                    <strong>选择会话查看详情</strong>
                    <span>消息记录将在这里展示</span>
                  </div>
              : <>
                  <header className="inbox-detail-header">
                    <strong>{selected.customerName}</strong>
                  </header>
                  <div className="inbox-message-viewport" ref={viewportRef}>
                    {messages.map((message) => <ChatMessageRow
                      key={message.id}
                      message={message}
                      customerName={selected.customerName}
                      agentName={agentName}
                      time={formatMessageTime(message.sentAt)}
                      agentAvatar={selectedAgent?.avatar
                        ? <span className="inbox-agent-avatar"><img src={selectedAgent.avatar} alt="" /></span>
                        : <MemberAvatar username={agentName} size={30} />}
                      renderBody={(current) => (current.type === 'image' && current.imageUrl
                        ? <figure className="inbox-message-image-card overview-records-image">
                            <ReadOnlyChatImage src={current.imageUrl} alt={current.content} />
                            <figcaption>{current.content}</figcaption>
                          </figure>
                        : <div className="inbox-message-bubble">{current.content}</div>)}
                    />)}
                  </div>
                  <footer className="inbox-detail-footer"><span>{footerText}</span></footer>
                </>}
        </section>
      </div>
    </div>
  </Modal>;
}
