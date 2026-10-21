import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconArrowDown,
  IconArrowUp,
  IconApps,
  IconCalendar,
  IconCheck,
  IconDoubleLeft,
  IconDoubleRight,
  IconEye,
  IconFullscreen,
  IconLeft,
  IconOriginalSize,
  IconRight,
  IconClose,
  IconExclamationCircle,
  IconFilter,
  IconFile,
  IconMessage,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconZoomIn,
  IconZoomOut,
} from '@arco-design/web-react/icon';
import { Button, Empty, Input, Popover, Select } from '../components/ui';
import { ChannelTypeIcon } from '../components/ChannelTypeIcon';
import { MemberAvatar } from '../components/MemberAvatar';
import { inboxAgents, inboxChannels, inboxConversations } from '../inboxMockData';
import { currentMember } from '../permissions';
import { useAppStore } from '../store';
import type { Agent, InboxChannelType, InboxConversation } from '../types';

type InboxStatus = 'processing' | 'resolved' | 'ended';
type LoadState = 'loading' | 'ready' | 'error';
type FilterType = 'date' | 'agent' | 'channel';
type DateFilterPreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'custom';

const statusItems: { key: InboxStatus; label: string }[] = [
  { key: 'processing', label: '处理中' },
  { key: 'resolved', label: '已解决' },
  { key: 'ended', label: '已结束' },
];

const isInboxStatus = (value: string | null): value is InboxStatus => statusItems.some((item) => item.key === value);
const dateFilterOptions: { key: DateFilterPreset; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'last7', label: '近 7 天' },
  { key: 'last30', label: '近 30 天' },
  { key: 'custom', label: '自定义时间段' },
];
const isDateFilterPreset = (value: string | null): value is DateFilterPreset => dateFilterOptions.some((item) => item.key === value);
const inboxAgentSourceIds: Record<string, string> = {
  'payment-agent': 'agent-support',
  'account-agent': 'agent-sales',
  'vip-agent': 'agent-vip',
};

function resolveInboxAgent(agents: Agent[], inboxAgent: { id: string; name: string }) {
  const sourceId = inboxAgentSourceIds[inboxAgent.id];
  return agents.find((agent) => agent.id === inboxAgent.id || agent.name === inboxAgent.name)
    ?? agents.find((agent) => sourceId && agent.id === sourceId);
}

function SyncedAgentAvatar({ agent }: { agent?: Agent }) {
  return agent?.avatar ? <img src={agent.avatar} alt="" /> : <IconRobot />;
}

function ChannelLogo({ type }: { type: InboxChannelType }) {
  return <ChannelTypeIcon type={type} className="inbox-channel-logo" />;
}

function getLatestMessage(conversation: InboxConversation) {
  const latest = conversation.messages.findLast((message) => message.role !== 'system');
  if (!latest) return '';
  if (latest.type === 'image') return `图片：${latest.content}`;
  return latest.content.replace(/\s+/g, ' ');
}

function formatListTime(value: string) {
  const date = new Date(value);
  const now = new Date('2026-09-16T12:00:00+08:00');
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (sameDay) return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  const now = new Date('2026-09-16T12:00:00+08:00');
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay ? time : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function initials(value: string) {
  if (value.startsWith('Visitor')) return '访';
  return value.slice(0, 1).toUpperCase();
}

function avatarTone(value: string) {
  const seed = Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `tone-${seed % 6}`;
}

function getStatusForConversation(conversation: InboxConversation): InboxStatus {
  if (conversation.state === 'processing') return 'processing';
  return conversation.closedReason === 'ai_resolved' ? 'resolved' : 'ended';
}

function toDateParam(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getDateRange(preset: DateFilterPreset, customStart: string, customEnd: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (preset === 'custom') {
    if (!customStart || !customEnd) return null;
    return customStart <= customEnd ? { start: customStart, end: customEnd } : { start: customEnd, end: customStart };
  }
  if (preset === 'today') return { start: toDateParam(today), end: toDateParam(today) };
  if (preset === 'yesterday') {
    const yesterday = addDays(today, -1);
    return { start: toDateParam(yesterday), end: toDateParam(yesterday) };
  }
  if (preset === 'last7') return { start: toDateParam(addDays(today, -6)), end: toDateParam(today) };
  return { start: toDateParam(addDays(today, -29)), end: toDateParam(today) };
}

function isDateWithinRange(value: string, range: { start: string; end: string }) {
  const date = new Date(value);
  const start = new Date(`${range.start}T00:00:00`);
  const end = new Date(`${range.end}T23:59:59.999`);
  return date >= start && date <= end;
}


function parseDateParam(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function getMonthCells(monthDate: Date) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(first);
  const mondayIndex = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - mondayIndex);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(date);
}

function isSameDateValue(left: string, right: string) {
  return Boolean(left && right && left === right);
}

function isDateBetween(value: string, start: string, end: string) {
  if (!start || !end) return false;
  const range = start <= end ? { start, end } : { start: end, end: start };
  return value > range.start && value < range.end;
}

function ListSkeleton() {
  return <div className="inbox-list-skeleton" aria-label="会话列表加载中">
    {Array.from({ length: 6 }).map((_, index) => <div className="inbox-skeleton-row" key={index}>
      <span className="inbox-skeleton-avatar" />
      <span className="inbox-skeleton-lines"><i /><i /><i /></span>
    </div>)}
  </div>;
}

function MessageSkeleton() {
  return <div className="inbox-message-skeleton" aria-label="消息加载中">
    <span className="inbox-skeleton-bubble is-left" />
    <span className="inbox-skeleton-bubble is-right" />
    <span className="inbox-skeleton-bubble is-left is-short" />
  </div>;
}

export function InboxPage() {
  const { state } = useAppStore();
  const currentUsername = currentMember(state)?.username ?? state.session?.username ?? '当前客服';
  const allConversations = useMemo(() => [...state.channelConversations, ...inboxConversations], [state.channelConversations]);
  const agentOptions = useMemo(() => {
    const values = new Map<string, { id: string; name: string }>(inboxAgents.map((item) => [item.id, { id: item.id, name: item.name }]));
    state.channelConversations.forEach((item) => values.set(item.agentId, { id: item.agentId, name: item.agentName }));
    return [...values.values()];
  }, [state.channelConversations]);
  const channelOptions = useMemo(() => {
    const values = new Map<string, { id: string; name: string; type: InboxChannelType }>(inboxChannels.map((item) => [item.id, { id: item.id, name: item.name, type: item.type as InboxChannelType }]));
    state.channelConversations.forEach((item) => values.set(item.channelId, { id: item.channelId, name: item.channelName, type: item.channelType }));
    return [...values.values()];
  }, [state.channelConversations]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [processingExpanded, setProcessingExpanded] = useState(true);
  const [listState, setListState] = useState<LoadState>('loading');
  const [messageState, setMessageState] = useState<LoadState>('loading');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType | null>(null);
  const [pendingFilter, setPendingFilter] = useState<FilterType | null>(null);
  const [draftFilterTypes, setDraftFilterTypes] = useState<FilterType[]>([]);
  const [draftAgentIds, setDraftAgentIds] = useState<string[]>([]);
  const [draftChannelIds, setDraftChannelIds] = useState<string[]>([]);
  const [filterKeyword, setFilterKeyword] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [rangeAnchor, setRangeAnchor] = useState('');
  const [messageEdge, setMessageEdge] = useState({ top: false, bottom: false });
  const conversationRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const messageViewportRef = useRef<HTMLDivElement | null>(null);

  const requestedStatus = searchParams.get('status');
  const status = isInboxStatus(requestedStatus) ? requestedStatus : 'processing';
  const navAgentId = searchParams.get('agent') ?? '';
  const datePreset = isDateFilterPreset(searchParams.get('datePreset')) ? searchParams.get('datePreset') as DateFilterPreset : '';
  const dateStart = searchParams.get('dateStart') ?? '';
  const dateEnd = searchParams.get('dateEnd') ?? '';
  const filterAgentIds = useMemo(() => searchParams.getAll('filterAgent'), [searchParams]);
  const channelIds = useMemo(() => searchParams.getAll('channel'), [searchParams]);
  const keyword = searchParams.get('q') ?? '';
  const selectedId = searchParams.get('conversation') ?? '';
  const demoState = searchParams.get('demo') ?? '';
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 });
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const previewDragRef = useRef<{ pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    if (!previewImage) return;
    setPreviewScale(1);
    setPreviewOffset({ x: 0, y: 0 });
    const closePreview = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreviewImage(null); };
    window.addEventListener('keydown', closePreview);
    return () => window.removeEventListener('keydown', closePreview);
  }, [previewImage]);

  const clampPreviewOffset = useCallback((offset: { x: number; y: number }, scale: number) => {
    const stage = previewStageRef.current;
    const image = previewImageRef.current;
    if (!stage || !image) return { x: 0, y: 0 };
    const maxX = Math.max(0, (image.clientWidth * scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (image.clientHeight * scale - stage.clientHeight) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, offset.x)), y: Math.min(maxY, Math.max(-maxY, offset.y)) };
  }, []);

  const updatePreviewScale = useCallback((nextScale: number) => {
    const scale = Math.min(3, Math.max(.25, Number(nextScale.toFixed(2))));
    setPreviewScale(scale);
    setPreviewOffset((offset) => clampPreviewOffset(offset, scale));
  }, [clampPreviewOffset]);

  const resetPreview = useCallback(() => {
    setPreviewScale(1);
    setPreviewOffset({ x: 0, y: 0 });
  }, []);

  const showOriginalSize = useCallback(() => {
    const image = previewImageRef.current;
    if (!image?.naturalWidth || !image.clientWidth) return;
    updatePreviewScale(image.naturalWidth / image.clientWidth);
  }, [updatePreviewScale]);

  const handlePreviewWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    updatePreviewScale(previewScale + (event.deltaY < 0 ? .15 : -.15));
  }, [previewScale, updatePreviewScale]);

  const handlePreviewPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (previewScale <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    previewDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: previewOffset.x, offsetY: previewOffset.y };
  }, [previewOffset, previewScale]);

  const handlePreviewPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = previewDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPreviewOffset(clampPreviewOffset({ x: drag.offsetX + event.clientX - drag.startX, y: drag.offsetY + event.clientY - drag.startY }, previewScale));
  }, [clampPreviewOffset, previewScale]);

  const handlePreviewPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (previewDragRef.current?.pointerId === event.pointerId) previewDragRef.current = null;
  }, []);

  const updateParams = useCallback((patch: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      next.delete(key);
      if (Array.isArray(value)) value.filter(Boolean).forEach((item) => next.append(key, item));
      else if (value) next.set(key, value);
    });
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const dateRange = useMemo(() => status === 'processing' || !datePreset ? null : getDateRange(datePreset, dateStart, dateEnd), [dateEnd, datePreset, dateStart, status]);
  const appliedFilterTypes = useMemo<FilterType[]>(() => [
    ...(datePreset && status !== 'processing' ? ['date' as const] : []),
    ...(filterAgentIds.length ? ['agent' as const] : []),
    ...(channelIds.length ? ['channel' as const] : []),
  ], [channelIds, datePreset, filterAgentIds, status]);
  const agentFilterKey = filterAgentIds.join('|');
  const channelFilterKey = channelIds.join('|');
  const dateFilterKey = `${datePreset}|${dateStart}|${dateEnd}`;

  useEffect(() => {
    setDraftAgentIds(filterAgentIds);
    setDraftChannelIds(channelIds);
    setDraftFilterTypes(appliedFilterTypes);
  }, [agentFilterKey, channelFilterKey, dateFilterKey, filterAgentIds, appliedFilterTypes, channelIds]);

  useEffect(() => {
    if (datePreset !== 'custom') {
      setRangeAnchor('');
      return;
    }
    const anchorDate = parseDateParam(dateStart || dateEnd);
    if (anchorDate) setCalendarMonth(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
  }, [dateEnd, datePreset, dateStart]);

  const visibleFilterCount = appliedFilterTypes.length;
  const availableFilterTypeCount = status === 'processing' ? 2 : 3;
  const syncedAgents = useMemo(() => Object.fromEntries(agentOptions.map((agent) => [agent.id, resolveInboxAgent(state.agents, agent)])), [agentOptions, state.agents]);

  useEffect(() => {
    if (!pendingFilter || !draftFilterTypes.includes(pendingFilter)) return;
    const timer = window.setTimeout(() => {
      setFilterKeyword('');
      setActiveFilter(pendingFilter);
      setPendingFilter(null);
    });
    return () => window.clearTimeout(timer);
  }, [draftFilterTypes, pendingFilter]);

  useEffect(() => {
    setListState('loading');
    const timer = window.setTimeout(() => setListState(demoState === 'error' ? 'error' : 'ready'), 420);
    return () => window.clearTimeout(timer);
  }, [demoState]);

  const statusCounts = useMemo(() => ({
    processing: allConversations.filter((item) => item.state === 'processing').length,
    resolved: allConversations.filter((item) => item.closedReason === 'ai_resolved').length,
    ended: allConversations.filter((item) => item.state === 'closed').length,
  }), [allConversations]);

  const agentCounts = useMemo(() => Object.fromEntries(agentOptions.map((agent) => [
    agent.id,
    allConversations.filter((item) => item.state === 'processing' && item.agentId === agent.id).length,
  ])), [agentOptions, allConversations]);

  const filteredConversations = useMemo(() => {
    if (demoState === 'empty') return [];
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();
    return allConversations
      .filter((item) => {
        if (status === 'processing' && item.state !== 'processing') return false;
        if (status === 'resolved' && item.closedReason !== 'ai_resolved') return false;
        if (status === 'ended' && item.state !== 'closed') return false;
        if (status === 'processing' && navAgentId && item.agentId !== navAgentId) return false;
        if (dateRange && !isDateWithinRange(item.createdAt, dateRange)) return false;
        if (filterAgentIds.length && !filterAgentIds.includes(item.agentId)) return false;
        if (channelIds.length && !channelIds.includes(item.channelId)) return false;
        if (normalizedKeyword && !item.messages.some((message) => message.role !== 'system' && message.content.toLocaleLowerCase().includes(normalizedKeyword))) return false;
        return true;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [allConversations, channelIds, dateRange, demoState, filterAgentIds, keyword, navAgentId, status]);

  const selectedConversation = useMemo(() => allConversations.find((item) => item.id === selectedId) ?? null, [allConversations, selectedId]);

  useEffect(() => {
    if (!requestedStatus || isInboxStatus(requestedStatus)) return;
    updateParams({ status: selectedConversation ? getStatusForConversation(selectedConversation) : 'processing', agent: null });
  }, [requestedStatus, selectedConversation, updateParams]);

  useEffect(() => {
    if (requestedStatus && !isInboxStatus(requestedStatus)) return;
    if (listState !== 'ready') return;
    if (!filteredConversations.length) {
      if (selectedId) updateParams({ conversation: null });
      return;
    }
    if (!filteredConversations.some((item) => item.id === selectedId)) updateParams({ conversation: filteredConversations[0].id });
  }, [filteredConversations, listState, requestedStatus, selectedId, updateParams]);

  const updateMessageEdge = useCallback(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    const threshold = 32;
    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    setMessageEdge({
      top: viewport.scrollTop <= threshold,
      bottom: maxScrollTop - viewport.scrollTop <= threshold,
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setMessageState('loading');
    setMessageEdge({ top: false, bottom: false });
    const timer = window.setTimeout(() => setMessageState(demoState === 'message-error' ? 'error' : 'ready'), 280);
    return () => window.clearTimeout(timer);
  }, [demoState, selectedId]);

  useEffect(() => {
    if (listState === 'ready' && selectedId) conversationRefs.current[selectedId]?.scrollIntoView({ block: 'nearest' });
  }, [listState, selectedId]);

  useEffect(() => {
    if (messageState === 'ready') {
      const viewport = messageViewportRef.current;
      viewport?.scrollTo({ top: viewport.scrollHeight });
      window.requestAnimationFrame(updateMessageEdge);
    }
  }, [messageState, selectedId, updateMessageEdge]);

  const history = useMemo(() => {
    if (!selectedConversation) return [];
    return allConversations
      .filter((item) => item.visitorId === selectedConversation.visitorId && item.channelId === selectedConversation.channelId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allConversations, selectedConversation]);
  const historyIndex = history.findIndex((item) => item.id === selectedId);
  const canSwitchHistory = history.length > 1 && historyIndex >= 0;
  const previousHistoryConversation = canSwitchHistory ? history[(historyIndex - 1 + history.length) % history.length] : undefined;
  const nextHistoryConversation = canSwitchHistory ? history[(historyIndex + 1) % history.length] : undefined;

  const selectStatus = (nextStatus: InboxStatus) => updateParams({ status: nextStatus, agent: null, conversation: null, ...(nextStatus === 'processing' ? { datePreset: null, dateStart: null, dateEnd: null } : {}) });
  const selectConversation = (id: string) => updateParams({ conversation: id });
  const switchHistory = (target: InboxConversation | undefined) => {
    if (!target) return;
    updateParams({ status: getStatusForConversation(target), agent: null, filterAgent: null, channel: null, q: null, conversation: target.id });
  };
  const retryList = () => updateParams({ demo: null });
  const retryMessages = () => updateParams({ demo: null });
  const chooseFilterType = (type: FilterType) => {
    setDraftFilterTypes((types) => types.includes(type) ? types : [...types, type]);
    setFilterKeyword('');
    setFilterMenuOpen(false);
    setActiveFilter(null);
    setPendingFilter(type);
  };
  const toggleFilterValue = (type: FilterType, id: string) => {
    const update = (values: string[]) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
    if (type === 'agent') {
      const nextAgentIds = update(draftAgentIds);
      setDraftAgentIds(nextAgentIds);
      setDraftFilterTypes([
        ...(datePreset && status !== 'processing' ? ['date' as const] : []),
        ...(nextAgentIds.length ? ['agent' as const] : []),
        ...(draftChannelIds.length ? ['channel' as const] : []),
      ]);
      updateParams({ filterAgent: nextAgentIds, channel: draftChannelIds, conversation: null });
    } else {
      const nextChannelIds = update(draftChannelIds);
      setDraftChannelIds(nextChannelIds);
      setDraftFilterTypes([
        ...(datePreset && status !== 'processing' ? ['date' as const] : []),
        ...(draftAgentIds.length ? ['agent' as const] : []),
        ...(nextChannelIds.length ? ['channel' as const] : []),
      ]);
      updateParams({ filterAgent: draftAgentIds, channel: nextChannelIds, conversation: null });
    }
  };
  const removeFilterType = (type: FilterType) => {
    setDraftFilterTypes((types) => types.filter((item) => item !== type));
    if (type === 'agent') {
      setDraftAgentIds([]);
      updateParams({ filterAgent: null, conversation: null });
    } else if (type === 'date') {
      updateParams({ datePreset: null, dateStart: null, dateEnd: null, conversation: null });
    } else {
      setDraftChannelIds([]);
      updateParams({ channel: null, conversation: null });
    }
    setActiveFilter(null);
  };
  const clearAppliedFilters = () => {
    setDraftFilterTypes([]);
    setDraftAgentIds([]);
    setDraftChannelIds([]);
    setFilterMenuOpen(false);
    setActiveFilter(null);
    updateParams({ datePreset: null, dateStart: null, dateEnd: null, filterAgent: null, channel: null, conversation: null });
  };
  const getFilterLabel = (type: FilterType) => {
    if (type === 'date') {
      if (!datePreset) return '日期';
      if (datePreset === 'custom' && dateStart && dateEnd) return `${dateStart} 至 ${dateEnd}`;
      return dateFilterOptions.find((item) => item.key === datePreset)?.label ?? '日期';
    }
    const values = type === 'agent' ? draftAgentIds : draftChannelIds;
    const options = type === 'agent' ? agentOptions : channelOptions;
    if (!values.length) return type === 'agent' ? 'AI Agent' : '渠道';
    if (values.length === 1) return options.find((item) => item.id === values[0])?.name ?? (type === 'agent' ? 'AI Agent' : '渠道');
    return `${type === 'agent' ? 'AI Agent' : '渠道'} ${values.length}`;
  };
  const renderFilterPicker = (type: FilterType) => {
    if (type === 'date') {
      const monthCells = getMonthCells(calendarMonth);
      const selectDatePreset = (preset: DateFilterPreset) => {
        setRangeAnchor('');
        if (preset === 'custom') {
          const anchorDate = parseDateParam(dateStart || dateEnd) ?? new Date();
          setCalendarMonth(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
          updateParams({ datePreset: preset, conversation: null });
          return;
        }
        updateParams({ datePreset: preset, dateStart: null, dateEnd: null, conversation: null });
      };
      const selectCalendarDate = (date: Date) => {
        const value = toDateParam(date);
        if (datePreset !== 'custom') updateParams({ datePreset: 'custom', dateStart: value, dateEnd: null, conversation: null });
        else if (!rangeAnchor || (dateStart && dateEnd)) updateParams({ datePreset: 'custom', dateStart: value, dateEnd: null, conversation: null });
        else updateParams({ datePreset: 'custom', dateStart: rangeAnchor <= value ? rangeAnchor : value, dateEnd: rangeAnchor <= value ? value : rangeAnchor, conversation: null });
        setRangeAnchor(datePreset !== 'custom' || !rangeAnchor || (dateStart && dateEnd) ? value : '');
      };
      const jumpMonth = (months: number) => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + months, 1));
      return <div className={`inbox-filter-picker inbox-date-filter-picker ${datePreset === 'custom' ? 'has-calendar' : ''}`}>
        <div className="inbox-date-filter-options">
          {dateFilterOptions.map((item) => <button type="button" className={`inbox-date-filter-option ${datePreset === item.key ? 'is-selected' : ''}`} key={item.key} onClick={() => selectDatePreset(item.key)}>
            <span>{item.label}</span>{datePreset === item.key && <IconCheck />}
          </button>)}
        </div>
        {datePreset === 'custom' && <div className="inbox-calendar-panel">
          <div className="inbox-calendar-header">
            <button type="button" aria-label="上一年" onClick={() => jumpMonth(-12)}><IconDoubleLeft /></button>
            <button type="button" aria-label="上一月" onClick={() => jumpMonth(-1)}><IconLeft /></button>
            <strong>{formatMonthTitle(calendarMonth)}</strong>
            <button type="button" aria-label="下一月" onClick={() => jumpMonth(1)}><IconRight /></button>
            <button type="button" aria-label="下一年" onClick={() => jumpMonth(12)}><IconDoubleRight /></button>
          </div>
          <div className="inbox-calendar-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="inbox-calendar-grid">
            {monthCells.map((date) => {
              const value = toDateParam(date);
              const outside = date.getMonth() !== calendarMonth.getMonth();
              const rangeStart = isSameDateValue(value, dateStart);
              const rangeEnd = isSameDateValue(value, dateEnd);
              const inRange = isDateBetween(value, dateStart, dateEnd);
              const pending = isSameDateValue(value, rangeAnchor) && datePreset === 'custom' && !dateEnd;
              return <button type="button" key={value} className={`inbox-calendar-day ${outside ? 'is-outside' : ''} ${inRange ? 'is-in-range' : ''} ${rangeStart || rangeEnd || pending ? 'is-selected' : ''}`} onClick={() => selectCalendarDate(date)}>
                <span>{date.getDate()}</span>
              </button>;
            })}
          </div>
        </div>}
      </div>;
    }
    const options = type === 'agent' ? agentOptions : channelOptions;
    const values = type === 'agent' ? draftAgentIds : draftChannelIds;
    const normalized = filterKeyword.trim().toLocaleLowerCase();
    const visibleOptions = options.filter((item) => item.name.toLocaleLowerCase().includes(normalized));
    const allSelected = visibleOptions.length > 0 && visibleOptions.every((item) => values.includes(item.id));
    const toggleAll = () => {
      const next = allSelected
        ? values.filter((value) => !visibleOptions.some((item) => item.id === value))
        : Array.from(new Set([...values, ...visibleOptions.map((item) => item.id)]));
      if (type === 'agent') {
        setDraftAgentIds(next);
        setDraftFilterTypes([
          ...(datePreset && status !== 'processing' ? ['date' as const] : []),
          ...(next.length ? ['agent' as const] : []),
          ...(draftChannelIds.length ? ['channel' as const] : []),
        ]);
        updateParams({ filterAgent: next, channel: draftChannelIds, conversation: null });
      } else {
        setDraftChannelIds(next);
        setDraftFilterTypes([
          ...(datePreset && status !== 'processing' ? ['date' as const] : []),
          ...(draftAgentIds.length ? ['agent' as const] : []),
          ...(next.length ? ['channel' as const] : []),
        ]);
        updateParams({ filterAgent: draftAgentIds, channel: next, conversation: null });
      }
    };
    return <div className="inbox-filter-picker">
      <Input autoFocus allowClear value={filterKeyword} prefix={<IconSearch />} placeholder={`搜索${type === 'agent' ? ' AI Agent' : '渠道'}`} onChange={setFilterKeyword} />
      <button type="button" className={`inbox-filter-option is-select-all ${allSelected ? 'is-selected' : ''}`} onClick={toggleAll}>
        <span>全选</span>{allSelected && <IconCheck />}
      </button>
      <div className="inbox-filter-options">
        {visibleOptions.map((item) => {
          const selected = values.includes(item.id);
          const syncedAgent = type === 'agent' ? syncedAgents[item.id] : undefined;
          return <button type="button" className={`inbox-filter-option ${selected ? 'is-selected' : ''}`} key={item.id} onClick={() => toggleFilterValue(type, item.id)}>
            <span className={type === 'agent' ? 'inbox-filter-agent-avatar' : 'inbox-filter-channel-icon'}>{type === 'agent' ? <SyncedAgentAvatar agent={syncedAgent} /> : <ChannelLogo type={channelOptions.find((channel) => channel.id === item.id)?.type ?? 'livechat'} />}</span>
            <span className="inbox-filter-option-name">{item.name}</span>
            {selected && <IconCheck />}
          </button>;
        })}
        {!visibleOptions.length && <span className="inbox-filter-no-result">没有匹配项</span>}
      </div>
    </div>;
  };

  const hasActiveDateFilter = status !== 'processing' && Boolean(datePreset);
  const emptyText = keyword || hasActiveDateFilter || filterAgentIds.length || channelIds.length
    ? '没有符合筛选条件的会话'
    : status === 'processing'
      ? '暂无处理中会话'
      : status === 'resolved'
        ? '暂无已解决会话'
        : '暂无已结束会话';
  const listTitle = statusItems.find((item) => item.key === status)?.label ?? '处理中';
  const selectedFooterText = selectedConversation?.state === 'processing'
    ? 'AI Agent 正在处理中'
    : selectedConversation?.closedReason === 'ai_resolved'
      ? '该会话已由 AI Agent 解决'
      : selectedConversation?.closedReason === 'human_handoff'
        ? '该会话已转接给人工客服'
        : '该会话已关闭';

  return <section className="page-content inbox-page" aria-label="收件箱">
    <div className="inbox-workspace">
      <aside className="inbox-status-rail" aria-label="会话状态">
        <div className="inbox-rail-header">
          <h1>收件箱</h1>
        </div>
        <div className="inbox-rail-title">聊天</div>
        {statusItems.map((item) => <div key={item.key}>
          <div className="inbox-status-row">
            <button type="button" className={`inbox-status-button ${item.key !== 'processing' && status === item.key && !navAgentId ? 'is-active' : ''} ${item.key === 'processing' ? 'is-disclosure' : ''}`} onClick={() => item.key === 'processing' ? setProcessingExpanded((value) => !value) : selectStatus(item.key)}>
              <span>{item.label}</span>{item.key !== 'processing' && <span className="inbox-status-count">{statusCounts[item.key]}</span>}
            </button>
            {item.key === 'processing' && <button type="button" className="inbox-expand-button" aria-label={processingExpanded ? '收起 AI Agents' : '展开 AI Agents'} onClick={() => setProcessingExpanded((value) => !value)}><span className={`inbox-chevron ${processingExpanded ? 'is-expanded' : ''}`} /></button>}
          </div>
          {item.key === 'processing' && processingExpanded && <div className="inbox-agent-tree">
            <button type="button" className={status === 'processing' && !navAgentId ? 'is-active' : ''} onClick={() => updateParams({ status: 'processing', agent: null, datePreset: null, dateStart: null, dateEnd: null, conversation: null })}><span>全部</span><span>{statusCounts.processing}</span></button>
            {agentOptions.map((agent) => <button type="button" className={status === 'processing' && navAgentId === agent.id ? 'is-active' : ''} key={agent.id} onClick={() => updateParams({ status: 'processing', agent: agent.id, datePreset: null, dateStart: null, dateEnd: null, conversation: null })}>
              <span className="inbox-agent-nav-copy"><span className="inbox-agent-nav-avatar"><SyncedAgentAvatar agent={syncedAgents[agent.id]} /></span><span>{agent.name}</span></span>
              <span>{agentCounts[agent.id]}</span>
            </button>)}
          </div>}
        </div>)}
      </aside>

      <section className="inbox-list-panel" aria-label="会话列表">
        <div className="inbox-list-toolbar">
          <div className="inbox-list-heading">
            <div className="inbox-list-title"><strong>{listTitle}</strong><span>{filteredConversations.length} 个会话</span></div>
            <div className="inbox-filter-actions">
              <Popover
                trigger="click"
                position="br"
                popupVisible={filterMenuOpen}
                onVisibleChange={(visible: boolean) => { setFilterMenuOpen(visible); if (visible) setActiveFilter(null); }}
                triggerProps={{ autoFitPosition: true, boundaryDistance: { right: 12, bottom: 12 } }}
                content={<div className="inbox-filter-category-menu">
                  {status !== 'processing' && !draftFilterTypes.includes('date') && <button type="button" onClick={() => chooseFilterType('date')}><IconCalendar /><span>日期</span></button>}
                  {!draftFilterTypes.includes('agent') && <button type="button" onClick={() => chooseFilterType('agent')}><IconRobot /><span>AI Agent</span></button>}
                  {!draftFilterTypes.includes('channel') && <button type="button" onClick={() => chooseFilterType('channel')}><IconApps /><span>渠道</span></button>}
                  {draftFilterTypes.length === availableFilterTypeCount && <span className="inbox-filter-all-added">所有筛选条件已添加</span>}
                </div>}
              >
                <button type="button" className={`inbox-filter-trigger ${visibleFilterCount ? 'is-active' : ''}`} aria-label="筛选会话">
                  <IconFilter /><span>筛选</span>{visibleFilterCount > 0 && <b>{visibleFilterCount}</b>}
                </button>
              </Popover>
            </div>
          </div>
        </div>
        <div className="inbox-list-tools">
          <Select className="inbox-mobile-status" value={status} aria-label="会话状态" onChange={(value) => selectStatus(value as InboxStatus)} options={statusItems.map((item) => ({ value: item.key, label: `${item.label} ${statusCounts[item.key]}` }))} />
          <Input value={keyword} prefix={<IconSearch />} suffix={keyword ? <button className="inbox-search-clear" type="button" aria-label="清除搜索内容" onMouseDown={(event) => event.preventDefault()} onClick={() => updateParams({ q: null, conversation: null })}><IconClose /></button> : null} aria-label="搜索消息内容" placeholder="搜索消息内容" onChange={(value) => updateParams({ q: value || null, conversation: null })} />
          {draftFilterTypes.length > 0 && <div className="inbox-filter-chips">
            {draftFilterTypes.map((type) => <Popover
              key={type}
              trigger="click"
              position="bl"
              popupVisible={activeFilter === type}
              onVisibleChange={(visible: boolean) => { setActiveFilter(visible ? type : null); if (visible) { setFilterKeyword(''); setFilterMenuOpen(false); } }}
              triggerProps={{ autoFitPosition: true, boundaryDistance: { left: 12, bottom: 12 } }}
              content={renderFilterPicker(type)}
            >
              <span className={`inbox-filter-chip ${activeFilter === type ? 'is-open' : ''}`}>
                <button type="button" className="inbox-filter-chip-main" onClick={() => setActiveFilter(type)}>{type === 'date' ? <IconCalendar /> : type === 'agent' ? <IconRobot /> : <IconApps />}<span>{getFilterLabel(type)}</span></button>
                <button type="button" className="inbox-filter-chip-remove" aria-label={`移除 ${type === 'date' ? '日期' : type === 'agent' ? 'AI Agent' : '渠道'} 筛选`} onClick={(event) => { event.stopPropagation(); removeFilterType(type); }}><IconClose /></button>
              </span>
            </Popover>)}
          </div>}
        </div>

        <div className="inbox-conversation-list">
          {listState === 'loading' && <ListSkeleton />}
          {listState === 'error' && <div className="inbox-centered-state"><IconExclamationCircle /><strong>会话加载失败</strong><span>请检查网络后重新加载</span><Button type="primary" icon={<IconRefresh />} onClick={retryList}>重新加载</Button></div>}
          {listState === 'ready' && !filteredConversations.length && <div className="inbox-centered-state"><Empty description={emptyText}>{(hasActiveDateFilter || filterAgentIds.length > 0 || channelIds.length > 0) && <Button type="text" onClick={clearAppliedFilters}>重置筛选</Button>}</Empty></div>}
          {listState === 'ready' && filteredConversations.map((conversation) => <button
            type="button"
            key={conversation.id}
            ref={(node) => { conversationRefs.current[conversation.id] = node; }}
            className={`inbox-conversation-item ${selectedId === conversation.id ? 'is-active' : ''}`}
            onClick={() => selectConversation(conversation.id)}
          >
            <span className={`inbox-customer-avatar ${avatarTone(conversation.customerName)}`}>{initials(conversation.customerName)}</span>
            <span className="inbox-conversation-copy">
              <span className="inbox-conversation-topline"><strong>{conversation.customerName}</strong><time>{formatListTime(conversation.updatedAt)}</time></span>
              <span className="inbox-latest-message">{getLatestMessage(conversation)}</span>
              <span className="inbox-conversation-meta">
                <span><ChannelLogo type={conversation.channelType} />{conversation.channelName}</span>
                <span><IconRobot />{conversation.agentName}</span>
              </span>
            </span>
          </button>)}
        </div>
      </section>

      <section className="inbox-detail-panel" aria-label="会话详情">
        {!selectedConversation || listState !== 'ready' ? <div className="inbox-detail-empty"><IconMessage /><strong>选择会话查看详情</strong><span>消息记录将在这里展示</span></div> : <>
          <header className="inbox-detail-header">
            <strong>{selectedConversation.customerName}</strong>
          </header>
          <div className="inbox-message-viewport" ref={messageViewportRef} onScroll={updateMessageEdge}>
            {messageState === 'loading' && <MessageSkeleton />}
            {messageState === 'error' && <div className="inbox-centered-state"><IconExclamationCircle /><strong>消息加载失败</strong><span>当前会话暂时无法读取</span><Button type="primary" icon={<IconRefresh />} onClick={retryMessages}>重新加载</Button></div>}
            {messageState === 'ready' && <>
              {previousHistoryConversation && messageEdge.top && <button type="button" className="inbox-thread-jump is-top" onClick={() => switchHistory(previousHistoryConversation)}><IconArrowUp /> 上一个会话</button>}
              {selectedConversation.messages.map((message) => message.role === 'system'
                ? <div className="inbox-system-message" key={message.id}><span>{message.content} · {formatMessageTime(message.sentAt)}</span></div>
                : <div className={`inbox-message-row is-${message.role}`} key={message.id}>
                  {message.role === 'customer' && <span className={`inbox-customer-avatar is-message ${avatarTone(selectedConversation.customerName)}`}>{initials(selectedConversation.customerName)}</span>}
                  <div className="inbox-message-content">
                    <span className="inbox-message-author">{message.role === 'agent' ? currentUsername : selectedConversation.customerName}</span>
                    {message.type === 'image'
                      ? <figure className="inbox-message-image-card">
                          {(message.fileUrl || message.imageUrl) && <button type="button" className="inbox-message-image-trigger" aria-label="全屏预览图片" onClick={() => setPreviewImage({ src: message.fileUrl || message.imageUrl || '', alt: message.content })}><img src={message.fileUrl || message.imageUrl} alt={message.content} /><span aria-hidden="true"><IconEye /></span></button>}
                          <figcaption>{message.content}</figcaption>
                        </figure>
                      : message.type === 'video' && message.fileUrl
                        ? <video className="inbox-message-media" src={message.fileUrl} controls />
                        : message.type === 'audio' && message.fileUrl
                          ? <audio className="inbox-message-audio" src={message.fileUrl} controls />
                          : message.type === 'file'
                            ? <div className="inbox-message-file"><span className="inbox-message-file-icon"><IconFile /></span><span>{message.fileUrl ? <a href={message.fileUrl} download={message.fileName || message.content}>{message.fileName || message.content}</a> : <strong>{message.fileName || message.content}</strong>}<small>{message.fileSize ? `${Math.ceil(message.fileSize / 1024)} KB` : ''}</small></span></div>
                      : <div className="inbox-message-bubble">{message.content}</div>}
                    <time>{formatMessageTime(message.sentAt)}</time>
                  </div>
                  {message.role === 'agent' && <MemberAvatar username={currentUsername} size={30} />}
                </div>)}
              {nextHistoryConversation && messageEdge.bottom && <button type="button" className="inbox-thread-jump is-bottom" onClick={() => switchHistory(nextHistoryConversation)}><IconArrowDown /> 下一个会话</button>}
            </>}
          </div>
          <footer className="inbox-detail-footer"><span>{selectedFooterText}</span></footer>
        </>}
      </section>
    </div>
    {previewImage && <div className="inbox-image-preview" role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setPreviewImage(null)}>
      <div className="inbox-image-preview-toolbar" role="toolbar" aria-label="图片缩放操作" onClick={(event) => event.stopPropagation()}>
        <button type="button" aria-label="缩小图片" title="缩小" disabled={previewScale <= .25} onClick={() => updatePreviewScale(previewScale - .25)}><IconZoomOut /></button>
        <button type="button" aria-label="放大图片" title="放大" disabled={previewScale >= 3} onClick={() => updatePreviewScale(previewScale + .25)}><IconZoomIn /></button>
        <button type="button" aria-label="适应屏幕" title="适应屏幕" onClick={resetPreview}><IconFullscreen /></button>
        <button type="button" aria-label="原始尺寸" title="原始尺寸" onClick={showOriginalSize}><IconOriginalSize /></button>
      </div>
      <button type="button" className="inbox-image-preview-close" aria-label="关闭图片预览" title="关闭" onClick={() => setPreviewImage(null)}><IconClose /></button>
      <div ref={previewStageRef} className={`inbox-image-preview-stage${previewScale > 1 ? ' is-draggable' : ''}`} onClick={(event) => event.stopPropagation()} onWheel={handlePreviewWheel} onPointerDown={handlePreviewPointerDown} onPointerMove={handlePreviewPointerMove} onPointerUp={handlePreviewPointerEnd} onPointerCancel={handlePreviewPointerEnd}>
        <img ref={previewImageRef} src={previewImage.src} alt={previewImage.alt} style={{ transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewScale})` }} />
      </div>
    </div>}
  </section>;
}
