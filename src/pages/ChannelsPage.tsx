import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Dropdown, Empty, Input, InputNumber, Menu, Message, Modal, Switch, Table } from '../components/ui';
import { IconArrowLeft, IconCopy, IconExclamationCircle, IconMore, IconNotification, IconNotificationClose, IconPlus, IconRobot, IconSearch, IconSend, IconUpload } from '@arco-design/web-react/icon';
import { now } from '../mockData';
import { useAppStore } from '../store';
import type { Agent, Channel, ChannelType } from '../types';
import { ChannelTypeIcon } from '../components/ChannelTypeIcon';
import channelEmptyState from '../assets/channel-empty-state-v2.png';

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const formatDate = (value?: string) => (value || '').replace('T', ' ').slice(0, 16);
const channelTypes: ChannelType[] = ['web-widget', 'livechat', 'telegram', 'chat-page'];
const modernChannelTypes: ChannelType[] = ['web-widget', 'chat-page'];
const replyLanguageOptions = ['简体中文', '繁体中文', '英语', '越南语', '泰语', '高棉语', '缅甸语', '老挝语'];
const interfaceLanguageOptions = [
  { label: '自动', value: 'auto' },
  ...replyLanguageOptions.map((value) => ({ label: value, value })),
];
const normalizeInterfaceLanguage = (language?: string) => {
  if (language === 'zh-CN') return '简体中文';
  if (language === 'zh-TW') return '繁体中文';
  if (language === 'en') return '英语';
  return language || 'auto';
};

const signaturePlaceholder = '有问题？我们随时为您提供帮助。';
const foregroundForTheme = (background?: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(background || '');
  if (!match) return '#ffffff';
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (red * 299 + green * 587 + blue * 114) / 1000 > 156 ? '#16191f' : '#ffffff';
};
type RouteMode = 'all' | 'list' | 'create' | 'edit' | 'detail';

const channelMeta: Record<ChannelType, { name: string; title: string; description: string; tokenLabel?: string; tokenField?: 'accessToken' | 'botToken' }> = {
  'web-widget': {
    name: '网站小部件',
    title: '网站小部件',
    description: '在客户浏览网站时，与他们实时聊天。',
  },
  livechat: {
    name: 'Livechat',
    title: 'Livechat',
    description: 'Livechat 消息会以会话形式进入你的收件箱。',
    tokenLabel: 'Access Token',
    tokenField: 'accessToken',
  },
  telegram: {
    name: 'Telegram',
    title: 'Telegram',
    description: 'Telegram 消息会以会话形式进入你的收件箱。',
    tokenLabel: 'Bot Token',
    tokenField: 'botToken',
  },
  'chat-page': {
    name: '聊天页面',
    title: '聊天页面',
    description: '向客户分享聊天链接，让他们可以随时发起咨询。',
  },
};

type Draft = {
  name: string;
  agentId?: string;
  accessToken: string;
  botToken: string;
  webhookUrl: string;
  language: string;
  websiteDomain: string;
};

type ConfigModalState = {
  mode: 'create' | 'edit';
  channel?: Channel;
};

type ChannelFeedback = {
  id: number;
  type: 'success' | 'warning';
  text: string;
};

function ChannelLogo({ type }: { type: ChannelType }) {
  return <ChannelTypeIcon type={type} />;
}

type ChannelSelectOption = { label: string; value: string; agent?: Agent };

function ChannelOptionSelect({ value, options, placeholder, onChange, renderOption, renderValue }: { value?: string; options: ChannelSelectOption[]; placeholder?: string; onChange: (value: string) => void; renderOption?: (option: ChannelSelectOption) => React.ReactNode; renderValue?: (option: ChannelSelectOption) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div className="channel-option-select" ref={rootRef}>
    <button type="button" className={`channel-option-select-trigger ${open ? 'is-open' : ''}`} onClick={() => setOpen((current) => !current)}>
      <span className={!selected ? 'is-placeholder' : undefined}>{selected ? (renderValue?.(selected) ?? selected.label) : placeholder}</span>
      <i aria-hidden="true" />
    </button>
    {open && <div className="channel-option-select-menu">
      {options.map((option) => <button type="button" key={option.value} className={option.value === value ? 'is-selected' : ''} onClick={() => { onChange(option.value); setOpen(false); }}>
        {renderOption?.(option) ?? option.label}
      </button>)}
    </div>}
  </div>;
}

function normalizeChannel(channel: Channel): Channel {
  const type = channel.type ?? 'livechat';
  const language = normalizeInterfaceLanguage(channel.language);
  return {
    ...channel,
    type,
    language,
    createdAt: channel.createdAt ?? channel.updatedAt,
    webhookUrl: channel.webhookUrl ?? (type === 'livechat' ? `https://im-support.example.com/webhooks/livechat/${channel.id}` : undefined),
  };
}

function parseWebsiteDomain(rawValue: string): { domain?: string; error?: string } {
  const value = rawValue.trim();
  if (!value) return { error: '请输入网站域名' };
  if (/^http:\/\//i.test(value)) return { error: '请输入 HTTPS 网站地址' };
  const source = /^https:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(source);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const labels = hostname.split('.');
    const hasInvalidPart = labels.length < 2 || labels.some((label) => !label || label.length > 63 || !/^[a-z0-9-]+$/i.test(label) || label.startsWith('-') || label.endsWith('-'));
    const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
    if (url.protocol !== 'https:') return { error: '请输入 HTTPS 网站地址' };
    if (url.username || url.password || url.port || url.search || url.hash || !['', '/'].includes(url.pathname)) return { error: '网站地址不能包含路径、端口或参数' };
    if (hasInvalidPart || isIpAddress || hostname.length > 253) return { error: '请输入正确的网站域名，例如：www.example.com' };
    return { domain: hostname };
  } catch {
    return { error: '请输入正确的网站域名，例如：www.example.com' };
  }
}


function imageFileToDataUrl(file?: File): Promise<string> {
  if (!file) return Promise.reject(new Error('请选择图片文件'));
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('仅支持图片文件'));
  if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error('图片大小不能超过 2 MB'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败，请重试'));
    reader.readAsDataURL(file);
  });
}

function pathFor(type?: ChannelType, suffix = '') {
  return type ? `/channels/${type}${suffix}` : '/channels';
}

function addLabel(type: ChannelType) {
  return type === 'web-widget' ? '添加网站' : '添加新连接';
}

function useChannelRoute() {
  const location = useLocation();
  const [, section, rawType, rawAction] = location.pathname.split('/');
  if (section !== 'channels') return { type: undefined, mode: 'all' as RouteMode, channelId: undefined };
  const type = channelTypes.includes(rawType as ChannelType) ? rawType as ChannelType : undefined;
  const mode: RouteMode = rawAction === 'new' ? 'create' : rawAction ? (type && modernChannelTypes.includes(type) ? 'detail' : 'edit') : type ? 'list' : 'all';
  return { type, mode, channelId: mode === 'edit' || mode === 'detail' ? rawAction : undefined };
}

function ChannelSideNav({ activeType, mode }: { activeType?: ChannelType; mode: RouteMode }) {
  const navigate = useNavigate();
  const activeKey = mode === 'all' ? 'all' : activeType;
  return <aside className="channels-subnav">
    <div className="channels-subnav-title">渠道</div>
    <button type="button" className={activeKey === 'all' ? 'active' : ''} onClick={() => navigate('/channels')}>全部</button>
    {channelTypes.map((type) => <button type="button" key={type} className={activeKey === type ? 'active' : ''} onClick={() => navigate(pathFor(type))}><ChannelLogo type={type} />{channelMeta[type].name}</button>)}
  </aside>;
}

function getAgent(agents: Agent[], agentId?: string) {
  return agentId ? agents.find((agent) => agent.id === agentId) : undefined;
}

function AgentAvatar({ agent }: { agent?: Agent }) {
  if (!agent) return <span className="channel-agent-avatar is-empty"><IconExclamationCircle /></span>;
  if (agent.avatar) return <span className="channel-agent-avatar"><img src={agent.avatar} alt="" /></span>;
  return <span className="channel-agent-avatar"><IconRobot /></span>;
}

function AgentCell({ agent }: { agent?: Agent }) {
  if (!agent) return <span className="channel-unconfigured"><AgentAvatar />未配置</span>;
  return <span className="channel-agent-cell"><AgentAvatar agent={agent} />{agent.name}</span>;
}

export function ChannelsPage() {
  const route = useChannelRoute();
  return <div className="page-content channels-page"><div className={`channels-layout${route.mode === 'detail' ? ' is-detail' : ''}`}>{route.mode !== 'detail' && <ChannelSideNav activeType={route.type} mode={route.mode} />}<main className="channels-main">{route.mode === 'all' && <AllChannelsPage />}{route.type && route.mode === 'detail' && route.channelId && <ModernChannelDetail type={route.type} channelId={route.channelId} />}{route.type && route.mode !== 'all' && route.mode !== 'detail' && <ChannelTypePage type={route.type} routeMode={route.mode} routeChannelId={route.channelId} />}</main></div></div>;
}

function AllChannelsPage() {
  const { state } = useAppStore();
  const navigate = useNavigate();
  const channels = useMemo(() => state.channels.map(normalizeChannel), [state.channels]);
  return <section className="channels-panel"><div className="channels-panel-header"><h1>全部渠道</h1></div><div className="channel-type-grid">{channelTypes.map((type) => {
    const count = channels.filter((channel) => channel.type === type).length;
    return <article className="channel-type-card" key={type}>
      <div className="channel-type-card-head"><ChannelLogo type={type} /><div><h2>{channelMeta[type].name}</h2>{count > 0 && <span className="channel-connected-pill">已连接 {count}</span>}</div></div>
      <p>{channelMeta[type].description}</p>
      <Button className={count > 0 ? 'channel-card-link' : 'channel-connect-button'} type={count > 0 ? 'text' : 'secondary'} onClick={() => navigate(count > 0 ? pathFor(type) : pathFor(type, '/new'))}>{count > 0 ? '管理' : addLabel(type)}</Button>
    </article>;
  })}</div></section>;
}

function ChannelTypePage({ type, routeMode, routeChannelId }: { type: ChannelType; routeMode: RouteMode; routeChannelId?: string }) {
  const { state, dispatch } = useAppStore();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<Channel>();
  const [deleteName, setDeleteName] = useState('');
  const [query, setQuery] = useState('');
  const [configModal, setConfigModal] = useState<ConfigModalState | null>(null);
  const [postCreateChannel, setPostCreateChannel] = useState<Channel | null>(null);
  const [feedback, setFeedback] = useState<ChannelFeedback | null>(null);
  const normalizedChannels = useMemo(() => state.channels.map(normalizeChannel), [state.channels]);
  const channels = useMemo(() => normalizedChannels.filter((channel) => channel.type === type).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [normalizedChannels, type]);
  const filteredChannels = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return channels.filter((channel) => !keyword || channel.name.toLowerCase().includes(keyword));
  }, [channels, query]);

  useEffect(() => {
    if (routeMode === 'create') {
      setConfigModal({ mode: 'create' });
      return;
    }
    if (routeMode === 'edit' && routeChannelId) {
      const target = channels.find((channel) => channel.id === routeChannelId);
      setConfigModal(target ? { mode: 'edit', channel: target } : null);
    }
  }, [channels, routeChannelId, routeMode]);

  const closeConfig = () => {
    setConfigModal(null);
    if (routeMode === 'create' || routeMode === 'edit') navigate(pathFor(type), { replace: true });
  };
  const closeDelete = () => { setDeleteTarget(undefined); setDeleteName(''); };
  const copy = (value: string, label: string) => { void navigator.clipboard?.writeText(value); Message.success(`${label}已复制`); };
  const showFeedback = (type: ChannelFeedback['type'], text: string) => {
    const id = Date.now();
    setFeedback({ id, type, text });
    window.setTimeout(() => {
      setFeedback((current) => current?.id === id ? null : current);
    }, 2000);
  };
  const remove = () => {
    if (!deleteTarget || deleteName !== deleteTarget.name) return;
    dispatch({ type: 'channel.delete', id: deleteTarget.id });
    Message.success('渠道已删除，历史会话数据已保留');
    closeDelete();
  };
  const toggleEnabled = (channel: Channel, enabled: boolean) => {
    const agent = getAgent(state.agents, channel.agentId);
    if (enabled && (!agent || agent.status !== 'published' || !agent.acceptingChats)) {
      showFeedback('warning', '请先配置已发布且正在接待的 AI Agent');
      Message.warning('请先配置已发布且正在接待的 AI Agent');
      return;
    }
    const commit = () => {
      dispatch({ type: 'channel.toggle', id: channel.id, enabled });
      showFeedback('success', enabled ? '渠道已启用' : '渠道已停用');
      Message.success(enabled ? '渠道已启用' : '渠道已停用');
    };
    if (!enabled) {
      Modal.confirm({ title: `停用渠道「${channel.name}」？`, content: '停用后将立即停止接收新的客户消息，已有历史会话仍会保留。', okText: '确认停用', cancelText: '取消', onOk: commit });
      return;
    }
    commit();
  };
  const more = (channel: Channel) => <Menu>
    <Menu.Item key="edit" onClick={() => modernChannelTypes.includes(type) ? navigate(pathFor(type, `/${channel.id}`)) : setConfigModal({ mode: 'edit', channel })}>编辑</Menu.Item>
    <Menu.Item key="delete" className="danger-menu-item" disabled={modernChannelTypes.includes(type) && channel.enabled} onClick={() => { setDeleteTarget(channel); setDeleteName(''); }}>删除</Menu.Item>
  </Menu>;
  const hasSearchResult = filteredChannels.length > 0;

  return <section className="channels-panel">{feedback && <div className={`channel-feedback-toast is-${feedback.type}`} role="status" aria-live="polite">{feedback.text}</div>}<div className="channels-panel-header"><h1>{channelMeta[type].title}</h1><Button className="channel-add-button" type="primary" onClick={() => setConfigModal({ mode: 'create' })}><span><IconPlus />{addLabel(type)}</span></Button></div>
    <div className="channel-list-content">{channels.length > 0 && <div className="channel-list-toolbar"><Input prefix={<IconSearch />} value={query} onChange={setQuery} placeholder="搜索渠道名称" allowClear /></div>}
    {hasSearchResult ? <Table rowKey="id" dataSource={filteredChannels} pagination={{ pageSize: 20, showTotal: true }} columns={[
      { title: '渠道名称', dataIndex: 'name', render: (value: string, item: Channel) => <button type="button" className={`channel-name-cell${modernChannelTypes.includes(type) ? ' is-link' : ''}`} onClick={() => modernChannelTypes.includes(type) && navigate(pathFor(type, `/${item.id}`))}><ChannelLogo type={type} /><div><strong>{value}</strong></div></button> },
      { title: '接待 AI Agent', dataIndex: 'agentId', render: (value?: string) => <AgentCell agent={getAgent(state.agents, value)} /> },
      { title: '创建时间', dataIndex: 'createdAt', render: (value?: string) => <span className="channel-created-at">{formatDate(value)}</span> },
      ...(type === 'web-widget' ? [{ title: '状态', dataIndex: 'installStatus', width: 96, render: (value?: Channel['installStatus']) => <span className={`channel-install-status ${value === 'success' ? 'is-connected' : 'is-unconnected'}`}>{value === 'success' ? '已连接' : '未连接'}</span> }] : []),
      { title: '启用状态', dataIndex: 'enabled', width: 96, render: (value: boolean, item: Channel) => <Switch checked={Boolean(value)} onChange={(checked) => toggleEnabled(item, checked)} /> },
      { title: '操作', width: 72, render: (_: unknown, item: Channel) => <Dropdown trigger="click" droplist={more(item)}><Button type="text" className="table-more-button" icon={<IconMore />} aria-label={`${item.name} 更多操作`} /></Dropdown> },
    ]} /> : channels.length ? <Empty description="没有找到匹配的渠道" /> : <ChannelEmptyState type={type} onAdd={() => setConfigModal({ mode: 'create' })} />}</div>
    <DeleteChannelModal target={deleteTarget} value={deleteName} onChange={setDeleteName} onCancel={closeDelete} onConfirm={remove} />
    <ChannelConfigModal type={type} modal={configModal} onClose={closeConfig} onSaved={(channel) => { if (modernChannelTypes.includes(channel.type ?? type)) setPostCreateChannel(channel); }} />
    <InstallCodeModal open={postCreateChannel?.type === 'web-widget'} onClose={() => setPostCreateChannel(null)} code={postCreateChannel?.installCode ?? ''} copy={copy} />
    <ChatPageSetupModal open={postCreateChannel?.type === 'chat-page'} channel={postCreateChannel ?? undefined} onClose={() => setPostCreateChannel(null)} copy={copy} />
  </section>;
}

function ChannelEmptyState({ type, onAdd }: { type: ChannelType; onAdd: () => void }) {
  return <div className="channel-empty-state"><img src={channelEmptyState} alt="" /><h2>将 {channelMeta[type].name} 消息接入收件箱</h2><p>{channelMeta[type].description} 添加连接后，你可以为该渠道指定接待 AI Agent。</p><Button type="primary" icon={<IconPlus />} onClick={onAdd}>{addLabel(type)}</Button></div>;
}

function DeleteChannelModal({ target, value, onChange, onCancel, onConfirm }: { target?: Channel; value: string; onChange: (value: string) => void; onCancel: () => void; onConfirm: () => void }) {
  return <Modal open={Boolean(target)} title={target ? `删除渠道「${target.name}」？` : '删除渠道？'} okText="确认删除" cancelText="取消" okButtonProps={{ status: 'danger', disabled: !target || value !== target.name }} onCancel={onCancel} onOk={onConfirm} destroyOnHidden>
    <div className="channel-delete-confirm"><p>删除后该渠道的入站消息将立即停止，历史会话保留但不可继续接收。请输入渠道名称以确认。</p><label><span>渠道名称</span><Input value={value} onChange={onChange} placeholder={target?.name ?? '请输入渠道名称'} /></label></div>
  </Modal>;
}

function buildInitialDraft(type: ChannelType, channel?: Channel): Draft {
  const normalized = channel ? normalizeChannel(channel) : undefined;
  const id = normalized?.id ?? makeId(`channel-${type}`);
  return {
    name: normalized?.name ?? '',
    agentId: normalized?.agentId,
    accessToken: normalized?.accessToken ?? '',
    botToken: normalized?.botToken ?? '',
    webhookUrl: normalized?.webhookUrl ?? (type === 'livechat' ? `https://im-support.example.com/webhooks/livechat/${id}` : ''),
    language: normalized?.language ?? 'auto',
    websiteDomain: normalized?.websiteDomain ?? '',
  };
}

function ChannelConfigModal({ type, modal, onClose, onSaved }: { type: ChannelType; modal: ConfigModalState | null; onClose: () => void; onSaved?: (channel: Channel) => void }) {
  const { state, dispatch } = useAppStore();
  const mode = modal?.mode ?? 'create';
  const existing = modal?.channel ? normalizeChannel(modal.channel) : undefined;
  const [draft, setDraft] = useState<Draft>(() => buildInitialDraft(type, existing));
  const [dirty, setDirty] = useState(mode === 'create');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [domainError, setDomainError] = useState('');
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const selectedAgent = getAgent(state.agents, draft.agentId);

  useEffect(() => {
    setDraft(buildInitialDraft(type, existing));
    setDirty(mode === 'create');
    setError('');
    setDomainError('');
    setSaving(false);
    setAgentPickerOpen(false);
  }, [existing, mode, type]);

  const update = (patch: Partial<Draft>) => {
    setDraft((value) => ({ ...value, ...patch }));
    setDirty(true);
    setError('');
  };
  const updateWebsiteDomain = (websiteDomain: string) => {
    update({ websiteDomain });
    setDomainError('');
  };
  const normalizeWebsiteDomain = () => {
    const result = parseWebsiteDomain(draft.websiteDomain);
    if (result.error) { setDomainError(result.error); return; }
    setDomainError('');
    if (result.domain !== draft.websiteDomain) setDraft((value) => ({ ...value, websiteDomain: result.domain ?? '' }));
  };
  const validate = () => {
    const name = draft.name.trim();
    if (!name) return '请输入渠道名称';
    if (state.channels.some((channel) => channel.id !== existing?.id && channel.name.trim().toLowerCase() === name.toLowerCase())) return '渠道名称已存在，请使用唯一名称';
    if (!draft.agentId) return '请选择接待 AI Agent';
    if (type === 'livechat') {
      if (draft.accessToken.trim().length < 8) return 'Access Token 至少需要 8 个字符';
      if (/fail|invalid/i.test(draft.accessToken)) return 'Access Token 校验失败，请检查 Livechat 后台凭证';
    }
    if (type === 'telegram') {
      if (!/^\d+:\S+$/.test(draft.botToken.trim())) return 'Bot Token 格式不正确，示例：123456789:token';
      if (/fail|invalid/i.test(draft.botToken)) return 'Bot Token 校验失败，请检查 Telegram Bot 凭证';
      if (state.channels.some((channel) => channel.id !== existing?.id && normalizeChannel(channel).type === 'telegram' && channel.botToken === draft.botToken.trim())) return '该 Telegram Bot 已绑定其他渠道';
    }
    return '';
  };
  const submit = () => {
    const domainResult = type === 'web-widget' ? parseWebsiteDomain(draft.websiteDomain ?? '') : {};
    if (domainResult.error) { setDomainError(domainResult.error); return; }
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    const savedAt = now();
    const id = existing?.id ?? makeId(`channel-${type}`);
    const normalizedDomain = domainResult.domain;
    const channel: Channel = {
        ...existing,
        id,
        type,
        name: draft.name.trim(),
        agentId: draft.agentId,
        enabled: existing?.enabled ?? true,
        accessToken: type === 'livechat' ? draft.accessToken.trim() : undefined,
        botToken: type === 'telegram' ? draft.botToken.trim() : undefined,
        webhookUrl: type === 'livechat' ? draft.webhookUrl : undefined,
        language: modernChannelTypes.includes(type) ? draft.language : undefined,
        websiteDomain: type === 'web-widget' ? normalizedDomain : undefined,
        allowedDomains: type === 'web-widget' ? (existing?.allowedDomains ?? []) : undefined,
        installCode: type === 'web-widget' ? (existing?.installCode ?? `<script src="https://cdn.example.com/widget.js" data-channel="${id}" async></script>`) : undefined,
        installStatus: type === 'web-widget' ? (existing?.installStatus ?? 'unchecked') : undefined,
        chatPageUrl: type === 'chat-page' ? `${window.location.origin}${window.location.pathname}#/chat/${id}` : undefined,
        brandName: modernChannelTypes.includes(type) ? existing?.brandName : undefined,
        brandSignature: modernChannelTypes.includes(type) ? (existing?.brandSignature ?? signaturePlaceholder) : undefined,
        themeColor: modernChannelTypes.includes(type) ? (existing?.themeColor ?? '#1c1f26') : undefined,
        widgetIcon: type === 'web-widget' ? (existing?.widgetIcon ?? 'message') : undefined,
        widgetPosition: type === 'web-widget' ? (existing?.widgetPosition ?? 'bottom-right') : undefined,
        widgetOffsetX: type === 'web-widget' ? (existing?.widgetOffsetX ?? 24) : undefined,
        widgetOffsetY: type === 'web-widget' ? (existing?.widgetOffsetY ?? 24) : undefined,
        widgetDesktopVisible: type === 'web-widget' ? (existing?.widgetDesktopVisible ?? true) : undefined,
        widgetMobileVisible: type === 'web-widget' ? (existing?.widgetMobileVisible ?? true) : undefined,
        widgetMobilePosition: type === 'web-widget' ? (existing?.widgetMobilePosition ?? existing?.widgetPosition ?? 'bottom-right') : undefined,
        widgetMobileOffsetX: type === 'web-widget' ? (existing?.widgetMobileOffsetX ?? existing?.widgetOffsetX ?? 24) : undefined,
        widgetMobileOffsetY: type === 'web-widget' ? (existing?.widgetMobileOffsetY ?? existing?.widgetOffsetY ?? 24) : undefined,
        soundEnabled: modernChannelTypes.includes(type) ? (existing?.soundEnabled ?? true) : undefined,
        receiveGroups: existing?.receiveGroups ?? [],
        humanGroups: existing?.humanGroups ?? [],
        opening: existing?.opening ?? '',
        hotQuestions: existing?.hotQuestions ?? [],
        ending: existing?.ending ?? '',
        humanEnabled: existing?.humanEnabled ?? false,
        humanFallback: existing?.humanFallback ?? '',
        createdAt: existing?.createdAt ?? savedAt,
        updatedAt: savedAt,
    };
    dispatch({ type: 'channel.save', channel });
    onClose();
    if (mode === 'create') onSaved?.(channel);
    Message.success(mode === 'create' ? '渠道已连接' : '渠道已保存');
  };
  const copyWebhook = () => {
    void navigator.clipboard?.writeText(draft.webhookUrl);
    Message.success('Webhook URL 已复制');
  };
  const closeWithConfirm = () => {
    if (!dirty) { onClose(); return; }
    Modal.confirm({ title: '放弃未保存的内容？', content: '关闭后本次填写内容不会保存。', okText: '放弃内容', cancelText: '继续编辑', onOk: onClose });
  };
  const tokenField = channelMeta[type].tokenField;

  const title = <span className="channel-config-title"><ChannelLogo type={type} />{mode === 'create' ? `接入 ${channelMeta[type].name}` : `编辑 ${channelMeta[type].name}`}</span>;

  return <Modal className="channel-config-modal" open={Boolean(modal)} title={title} footer={null} onCancel={closeWithConfirm} destroyOnHidden>
    <div className="channel-config-form">
      <label className="channel-field"><span>渠道名称</span><Input value={draft.name} onChange={(name) => update({ name })} placeholder="请输入渠道名称" /></label>
      {tokenField && <label className="channel-field"><span>{channelMeta[type].tokenLabel}</span><Input.Password value={draft[tokenField]} onChange={(value) => update({ [tokenField]: value })} placeholder={type === 'telegram' ? '123456789:telegram_bot_token' : '输入 Livechat Access Token'} /></label>}
      {type === 'livechat' && <label className="channel-field"><span>Webhook URL</span><div className="channel-copy-field"><Input value={draft.webhookUrl} readOnly /><Button icon={<IconCopy />} onClick={copyWebhook}>复制</Button></div></label>}
      {type === 'web-widget' && <label className="channel-field"><span>网站域名</span><Input value={draft.websiteDomain} onChange={updateWebsiteDomain} onBlur={normalizeWebsiteDomain} status={domainError ? 'error' : undefined} placeholder="输入您的网站域名" />{domainError && <small className="channel-field-error" role="alert">{domainError}</small>}</label>}
      {modernChannelTypes.includes(type) && <label className="channel-field"><span>界面语言</span><ChannelOptionSelect value={draft.language} onChange={(language) => update({ language })} options={interfaceLanguageOptions} /></label>}
      <div className="channel-field"><span>接待 AI Agent</span><div className="channel-agent-select">
        <button type="button" className={`channel-agent-select-trigger ${agentPickerOpen ? 'is-open' : ''}`} onClick={() => setAgentPickerOpen((open) => !open)}>
          <span>{selectedAgent ? <><AgentAvatar agent={selectedAgent} />{selectedAgent.name}</> : '选择接待 AI Agent'}</span>
          <i aria-hidden="true" />
        </button>
        {agentPickerOpen && <div className="channel-agent-options">
          {state.agents.map((agent) => <button type="button" key={agent.id} className={agent.id === draft.agentId ? 'is-selected' : ''} onClick={() => { update({ agentId: agent.id }); setAgentPickerOpen(false); }}>
            <AgentAvatar agent={agent} />
            <span>{agent.name || '未命名'}</span>
          </button>)}
        </div>}
      </div></div>
      {error && <div className="channel-form-error">{error}</div>}
      <div className="channel-form-actions"><Button onClick={onClose}>取消</Button><Button type="primary" loading={saving} disabled={mode === 'edit' && !dirty} onClick={submit}>{mode === 'create' ? (type === 'web-widget' ? '添加网站' : '创建') : '保存'}</Button></div>
    </div>
  </Modal>;
}

type ModernSection = 'basic' | 'appearance' | 'display' | 'link';
type PreviewMessageKind = 'text' | 'image' | 'video' | 'audio' | 'file';
type PreviewMessage = {
  id: string;
  role: 'customer' | 'agent';
  content: string;
  timestamp: string;
  kind?: PreviewMessageKind;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
};

const formatPreviewTime = (date = new Date()) => date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const formatPreviewFileSize = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const previewFileExtension = (fileName = '') => fileName.includes('.') ? fileName.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE' : 'FILE';
const getPreviewMessageKind = (file: File): PreviewMessageKind => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  const extension = previewFileExtension(file.name).toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) return 'image';
  if (['mp4', 'webm', 'mov', 'm4v', 'ogg'].includes(extension)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'flac'].includes(extension)) return 'audio';
  return 'file';
};

function previewSeedMessages(language?: string): PreviewMessage[] {
  const normalized = normalizeInterfaceLanguage(language);
  const copy: Record<string, { agent: string; customer: string }> = {
    auto: { agent: '您好，请问有什么可以帮您？', customer: '我想查询订单状态。' },
    简体中文: { agent: '您好，请问有什么可以帮您？', customer: '我想查询订单状态。' },
    繁体中文: { agent: '您好，請問有什麼可以幫您？', customer: '我想查詢訂單狀態。' },
    英语: { agent: 'Hi, how can I help you today?', customer: 'I want to check my order status.' },
    越南语: { agent: 'Xin chào, tôi có thể giúp gì cho bạn?', customer: 'Tôi muốn kiểm tra trạng thái đơn hàng.' },
    泰语: { agent: 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ?', customer: 'ฉันต้องการตรวจสอบสถานะคำสั่งซื้อ' },
    高棉语: { agent: 'សួស្តី តើខ្ញុំអាចជួយអ្វីបានខ្លះ?', customer: 'ខ្ញុំចង់ពិនិត្យស្ថានភាពការបញ្ជាទិញ។' },
    缅甸语: { agent: 'မင်္ဂလာပါ၊ ဘာများကူညီပေးရမလဲ။', customer: 'အော်ဒါအခြေအနေ စစ်ဆေးချင်ပါတယ်။' },
    老挝语: { agent: 'ສະບາຍດີ ຂ້ອຍຊ່ວຍຫຍັງໄດ້ແດ່?', customer: 'ຂ້ອຍຕ້ອງການກວດສະຖານະຄໍາສັ່ງຊື້.' },
  };
  const selected = copy[normalized] ?? copy.auto;
  const timestamp = formatPreviewTime();
  return [
    { id: makeId('preview-agent'), role: 'agent', content: selected.agent, timestamp },
    { id: makeId('preview-customer'), role: 'customer', content: selected.customer, timestamp },
  ];
}

function ModernChannelDetail({ type, channelId }: { type: ChannelType; channelId: string }) {
  const { state, dispatch } = useAppStore();
  const navigate = useNavigate();
  const channel = state.channels.find((item) => item.id === channelId && normalizeChannel(item).type === type);
  const [active, setActive] = useState<ModernSection>('basic');
  const [sectionDrafts, setSectionDrafts] = useState<Record<ModernSection, Partial<Channel>>>({ basic: {}, appearance: {}, display: {}, link: {} });
  const [domainInput, setDomainInput] = useState('');
  const [domainError, setDomainError] = useState('');
  const [allowedDomainError, setAllowedDomainError] = useState('');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [widgetOpen, setWidgetOpen] = useState(true);
  const [previewInput, setPreviewInput] = useState('');
  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [visibleTimestampId, setVisibleTimestampId] = useState<string | null>(null);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const attachmentUrlsRef = useRef<string[]>([]);
  const draft = channel ? { ...normalizeChannel(channel), ...sectionDrafts.basic, ...sectionDrafts.appearance, ...sectionDrafts.display } : null;
  const previewLanguage = draft?.language;
  const hasChanges = (section?: ModernSection) => Object.keys(sectionDrafts[section ?? active] ?? {}).length > 0;
  const hasUnsavedChanges = Object.values(sectionDrafts).some((patch) => Object.keys(patch).length > 0);

  useEffect(() => {
    setActive('basic');
    setSectionDrafts({ basic: {}, appearance: {}, display: {}, link: {} });
    setDomainError('');
    setAllowedDomainError('');
  }, [channelId]);

  useEffect(() => {
    const staleUrls = attachmentUrlsRef.current;
    attachmentUrlsRef.current = [];
    setMessages(previewSeedMessages(previewLanguage));
    setPreviewInput('');
    setVisibleTimestampId(null);
    window.setTimeout(() => staleUrls.forEach((url) => URL.revokeObjectURL(url)), 0);
  }, [channelId, previewLanguage]);

  useEffect(() => () => {
    const staleUrls = attachmentUrlsRef.current;
    attachmentUrlsRef.current = [];
    window.setTimeout(() => staleUrls.forEach((url) => URL.revokeObjectURL(url)), 0);
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  if (!channel || !draft) return <section className="channels-panel"><Empty description="渠道不存在"><Button onClick={() => navigate(pathFor(type))}>返回渠道列表</Button></Empty></section>;

  const sections: { key: ModernSection; label: string }[] = type === 'web-widget'
    ? [{ key: 'basic', label: '基本设置' }, { key: 'appearance', label: '品牌外观' }, { key: 'display', label: '可见性与位置' }]
    : [{ key: 'basic', label: '基本设置' }, { key: 'appearance', label: '品牌外观' }, { key: 'link', label: '聊天链接' }];
  const update = (patch: Partial<Channel>) => setSectionDrafts((value) => ({ ...value, [active]: { ...value[active], ...patch } }));
  const validate = (candidate: Channel) => {
    if (active === 'basic' && !candidate.name.trim()) return '请输入渠道名称';
    if (active === 'basic' && !candidate.agentId) return '请选择接待 AI Agent';
    if (active === 'appearance' && !/^#[0-9a-f]{6}$/i.test(candidate.themeColor || '')) return '请输入合法的 6 位 HEX 主题颜色';
    const offsets = [candidate.widgetOffsetX, candidate.widgetOffsetY, candidate.widgetMobileOffsetX, candidate.widgetMobileOffsetY];
    if (active === 'display' && offsets.some((value) => (value ?? 0) < 0 || (value ?? 0) > 100)) return '边距仅支持 0～100 的整数';
    return '';
  };
  const save = () => {
    if (!hasChanges()) return;
    const candidate = { ...normalizeChannel(channel), ...sectionDrafts[active] };
    const domainResult = type === 'web-widget' && active === 'basic' ? parseWebsiteDomain(candidate.websiteDomain ?? '') : {};
    if (domainResult.error) {
      setDomainError(domainResult.error);
      setActive('basic');
      Message.error(domainResult.error);
      return;
    }
    const error = validate(candidate);
    if (error) { Message.error(error); return; }
    const normalizedDraft = {
      ...(domainResult.domain
      ? {
          ...candidate,
          websiteDomain: domainResult.domain ?? '',
          allowedDomains: candidate.allowedDomains ?? [],
        }
      : candidate),
    };
    dispatch({ type: 'channel.save', channel: { ...normalizedDraft, updatedAt: now() } });
    setSectionDrafts((value) => ({ ...value, [active]: {} }));
    setDomainError('');
    setAllowedDomainError('');
    Message.success('当前分组已保存');
  };
  const cancel = () => { setSectionDrafts((value) => ({ ...value, [active]: {} })); setDomainError(''); setAllowedDomainError(''); Message.info('已恢复当前分组的最近保存配置'); };
  const leave = () => {
    if (!hasUnsavedChanges) { navigate(pathFor(type)); return; }
    Modal.confirm({ title: '放弃未保存的修改？', content: '当前配置尚未保存，离开后修改不会生效。', okText: '放弃修改', cancelText: '继续编辑', onOk: () => navigate(pathFor(type)) });
  };
  const copy = (value: string, label: string) => { void navigator.clipboard?.writeText(value); Message.success(`${label}已复制`); };
  const addDomain = () => {
    const result = parseWebsiteDomain(domainInput);
    if (result.error || !result.domain) { setAllowedDomainError(result.error ?? '请输入正确的网站域名'); Message.error(result.error ?? '请输入正确的网站域名'); return; }
    if (draft.allowedDomains?.includes(result.domain)) { setAllowedDomainError(''); Message.warning('该域名已添加'); return; }
    update({ allowedDomains: [...(draft.allowedDomains ?? []), result.domain] });
    setDomainInput('');
    setAllowedDomainError('');
  };
  const sendPreview = () => {
    const content = previewInput.trim();
    if (!content) return;
    setMessages((value) => [...value, { id: makeId('preview-customer'), role: 'customer', content, timestamp: formatPreviewTime() }]);
    setPreviewInput('');
  };
  const sendPreviewAttachment = (file: File) => {
    const fileUrl = URL.createObjectURL(file);
    attachmentUrlsRef.current.push(fileUrl);
    setMessages((value) => [...value, {
      id: makeId('preview-customer'),
      role: 'customer',
      content: file.name,
      timestamp: formatPreviewTime(),
      kind: getPreviewMessageKind(file),
      fileName: file.name,
      fileUrl,
      fileSize: file.size,
      mimeType: file.type,
    }]);
    Message.success('文件已添加');
  };
  const toggleTimestamp = (messageId: string) => setVisibleTimestampId((value) => value === messageId ? null : messageId);
  const toggleWidget = () => setWidgetOpen((value) => !value);
  const toggleDraftEnabled = (enabled: boolean) => {
    const selectedAgent = getAgent(state.agents, draft.agentId);
    if (enabled && (!selectedAgent || selectedAgent.status !== 'published' || !selectedAgent.acceptingChats)) {
      Message.warning('请先配置已发布且正在接待的 AI Agent');
      return;
    }
    const commit = () => {
      dispatch({ type: 'channel.toggle', id: channel.id, enabled });
      Message.success(enabled ? '渠道已启用' : '渠道已停用');
    };
    if (!enabled && draft.enabled) {
      Modal.confirm({ title: `停用渠道「${draft.name}」？`, content: '停用后将立即停止接收新的客户消息，已有历史会话仍会保留。', okText: '确认停用', cancelText: '取消', onOk: commit });
      return;
    }
    commit();
  };
  return <section className="channels-panel modern-channel-detail">
    <div className="channels-panel-header modern-channel-header">
      <div className="modern-channel-title"><Button type="text" shape="circle" icon={<IconArrowLeft />} aria-label="返回渠道列表" onClick={leave} /><ChannelLogo type={type} /><div><h1>{draft.name}</h1></div></div>
      <div className="modern-channel-toolbar">{type === 'web-widget' && <Button className="top-install-button" onClick={() => setInstallModalOpen(true)}><CodeMark />安装代码</Button>}<div className="modern-channel-status"><span>{draft.enabled ? '已启用' : '已停用'}</span><Switch checked={draft.enabled} onChange={toggleDraftEnabled} /></div></div>
    </div>
    <div className="modern-channel-workspace">
      <nav className="modern-channel-nav">{sections.map((item) => <button type="button" key={item.key} className={active === item.key ? 'active' : ''} onClick={() => setActive(item.key)}>{item.label}{hasChanges(item.key) && <i />}</button>)}</nav>
      <main className="modern-channel-config">
        <ChannelDetailSection title={sections.find((item) => item.key === active)?.label || ''}>
          {active === 'basic' && <BasicChannelSettings draft={draft} agents={state.agents} update={update} showWebsiteDomain={type === 'web-widget'} domainError={domainError} setDomainError={setDomainError} />}
          {active === 'appearance' && <AppearanceSettings draft={draft} update={update} />}
          {active === 'display' && <WidgetDisplaySettings draft={draft} update={update} device={device} setDevice={setDevice} domainInput={domainInput} setDomainInput={(value) => { setDomainInput(value); if (!value.trim()) setAllowedDomainError(''); }} domainError={allowedDomainError} addDomain={addDomain} />}
          {active === 'link' && <ChatPageLinkSettings draft={draft} copy={copy} />}
        </ChannelDetailSection>
        <div className="modern-channel-actions"><Button onClick={cancel} disabled={!hasChanges()}>取消</Button><Button type="primary" onClick={save} disabled={!hasChanges()}>保存</Button></div>
      </main>
      <ChannelPreview type={type} draft={draft} messages={messages} visibleTimestampId={visibleTimestampId} toggleTimestamp={toggleTimestamp} input={previewInput} setInput={setPreviewInput} send={sendPreview} sendAttachment={sendPreviewAttachment} device={device} widgetOpen={widgetOpen} toggleWidget={toggleWidget} previewMuted={previewMuted} togglePreviewMuted={() => setPreviewMuted((value) => !value)} />
    </div>
    <InstallCodeModal open={installModalOpen} onClose={() => setInstallModalOpen(false)} code={draft.installCode ?? ''} copy={copy} />
  </section>;
}

function ChannelDetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="modern-config-section"><h2>{title}</h2><div className="modern-config-fields">{children}</div></section>;
}

function BasicChannelSettings({ draft, agents, update, showWebsiteDomain, domainError, setDomainError }: { draft: Channel; agents: Agent[]; update: (patch: Partial<Channel>) => void; showWebsiteDomain?: boolean; domainError?: string; setDomainError?: (value: string) => void }) {
  const availableAgents = agents.filter((agent) => agent.status === 'published' && agent.acceptingChats);
  const normalizeWebsiteDomain = () => {
    const result = parseWebsiteDomain(draft.websiteDomain ?? '');
    if (result.error) { setDomainError?.(result.error); return; }
    setDomainError?.('');
    if (result.domain !== (draft.websiteDomain ?? '')) update({ websiteDomain: result.domain ?? '' });
  };
  return <>
    <label className="channel-field"><span>渠道名称</span><Input value={draft.name} onChange={(name) => update({ name })} /></label>
    {showWebsiteDomain && <label className="channel-field"><span>网站域名</span><Input value={draft.websiteDomain ?? ''} onChange={(websiteDomain) => { update({ websiteDomain }); setDomainError?.(''); }} onBlur={normalizeWebsiteDomain} status={domainError ? 'error' : undefined} placeholder="输入您的网站域名" />{domainError && <small className="channel-field-error" role="alert">{domainError}</small>}</label>}
    <label className="channel-field"><span>界面语言</span><ChannelOptionSelect value={draft.language ?? 'auto'} onChange={(language) => update({ language })} options={interfaceLanguageOptions} /></label>
    <label className="channel-field"><span>接待 AI Agent</span><ChannelOptionSelect value={draft.agentId} placeholder="选择接待 AI Agent" onChange={(agentId) => update({ agentId })} options={availableAgents.map((agent) => ({ label: agent.name || '未命名', value: agent.id, agent }))} renderValue={(option) => option.agent ? <><AgentAvatar agent={option.agent} />{option.label}</> : option.label} renderOption={(option) => option.agent ? <><AgentAvatar agent={option.agent} /><span>{option.label}</span></> : option.label} /><small className="channel-field-tip">更换接待 AI Agent 仅对新会话生效。</small></label>
  </>;
}

function AppearanceSettings({ draft, update }: { draft: Channel; update: (patch: Partial<Channel>) => void }) {
  const uploadAvatar = async (file?: File) => {
    try {
      update({ brandAvatar: await imageFileToDataUrl(file) });
      Message.success('品牌头像已更新');
    } catch (error) {
      Message.error(error instanceof Error ? error.message : '头像上传失败');
    }
  };
  return <>
    <div className="brand-appearance-grid">
      <div className="brand-copy-fields">
        <label className="channel-field"><span>品牌名称</span><Input value={draft.brandName ?? ''} onChange={(brandName) => update({ brandName })} placeholder={draft.name || '输入品牌名称'} /></label>
        <label className="channel-field"><span>签名</span><Input value={draft.brandSignature ?? ''} onChange={(brandSignature) => update({ brandSignature })} placeholder={signaturePlaceholder} /></label>
      </div>
      <div className="channel-field brand-avatar-field"><span>品牌 LOGO</span><label className="brand-avatar-upload" aria-label="上传品牌 LOGO">{draft.brandAvatar ? <img src={draft.brandAvatar} alt="品牌 LOGO" /> : <IconUpload />}<i>{draft.brandAvatar ? '更换' : '上传'}</i><input type="file" accept="image/*" onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>{draft.brandAvatar && <Button type="text" onClick={() => update({ brandAvatar: undefined })}>删除</Button>}</div>
    </div>
    <label className="channel-field"><span>主题色</span><div className="theme-color-control"><input type="color" value={draft.themeColor ?? '#1c1f26'} onChange={(event) => update({ themeColor: event.target.value })} /><Input value={draft.themeColor ?? '#1c1f26'} onChange={(themeColor) => update({ themeColor })} /></div></label>
  </>;
}

function WidgetGlyph({ type, customIcon }: { type: Channel['widgetIcon']; customIcon?: string }) {
  if (type === 'custom' && customIcon) return <img className="widget-custom-icon" src={customIcon} alt="自定义图标" />;
  const normalized = type === 'robot' ? 'message-dark' : type === 'support' ? 'message-line' : type ?? 'message';
  if (normalized === 'message-line') return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 2C21.6569 2 23 3.34315 23 5V21C23 21.3344 22.8329 21.6466 22.5547 21.832C22.2765 22.0175 21.9239 22.0514 21.6152 21.9229L15.8008 19.5H4C2.34315 19.5 1 18.1569 1 16.5V5C1 3.34315 2.34315 2 4 2H20ZM9 12C8.44772 12 8 12.4477 8 13C8 13.5523 8.44772 14 9 14H15C15.5523 14 16 13.5523 16 13C16 12.4477 15.5523 12 15 12H9ZM6 7.5C5.44772 7.5 5 7.94772 5 8.5C5 9.05228 5.44772 9.5 6 9.5H18C18.5523 9.5 19 9.05228 19 8.5C19 7.94772 18.5523 7.5 18 7.5H6Z" fill="currentColor" /></svg>;
  if (normalized === 'message-dark') return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M20 2C21.6569 2 23 3.34315 23 5V21C23 21.3344 22.8329 21.6466 22.5547 21.832C22.2765 22.0175 21.9239 22.0514 21.6152 21.9229L15.8008 19.5H4C2.34315 19.5 1 18.1569 1 16.5V5C1 3.34315 2.34315 2 4 2H20ZM17.6406 8.23145C17.2163 7.87788 16.585 7.93607 16.2314 8.36035C16.2252 8.36729 16.2134 8.37957 16.1973 8.39648C16.1615 8.43403 16.102 8.49424 16.0186 8.56934C15.8508 8.72029 15.5893 8.9302 15.2354 9.14258C14.5313 9.565 13.4571 10 12 10C10.5429 10 9.46874 9.565 8.76465 9.14258C8.41068 8.9302 8.14917 8.72029 7.98145 8.56934C7.89801 8.49424 7.83851 8.43403 7.80273 8.39648C7.78624 8.37917 7.77369 8.3672 7.76758 8.36035C7.41401 7.93607 6.78365 7.87788 6.35938 8.23145C5.93519 8.58502 5.87791 9.21638 6.23145 9.64062L7 9C6.27894 9.60089 6.23386 9.638 6.23145 9.64062L6.2334 9.6416L6.23438 9.64355C6.23541 9.64479 6.23703 9.64598 6.23828 9.64746C6.24077 9.6504 6.24374 9.65433 6.24707 9.6582C6.25374 9.66596 6.26243 9.67524 6.27246 9.68652C6.29274 9.70934 6.31943 9.73959 6.35352 9.77539C6.42193 9.84723 6.51894 9.94351 6.64355 10.0557C6.89247 10.2797 7.2561 10.5699 7.73535 10.8574C8.69793 11.435 10.1238 12 12 12C13.8762 12 15.3021 11.435 16.2646 10.8574C16.7439 10.5699 17.1075 10.2797 17.3564 10.0557C17.4811 9.94351 17.5781 9.84723 17.6465 9.77539C17.6806 9.7396 17.7073 9.70934 17.7275 9.68652C17.7376 9.67524 17.7463 9.66596 17.7529 9.6582C17.7563 9.65433 17.7592 9.6504 17.7617 9.64746C17.763 9.64598 17.7646 9.64479 17.7656 9.64355L17.7666 9.6416L17.7676 9.64062C17.7652 9.638 17.7211 9.6009 17 9L17.7676 9.64062C18.1211 9.21638 18.0648 8.58502 17.6406 8.23145Z" fill="currentColor" /></svg>;
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2C17.9734 2 23 6.38065 23 12C23 13.971 22.3711 15.8017 21.2998 17.3408C21.2017 17.4818 21.1767 17.6623 21.2393 17.8223L22.4443 20.8936C22.9499 22.1837 21.5849 23.4109 20.3555 22.7715L17.0957 21.0752C16.9599 21.0046 16.8 21.0007 16.6592 21.0605C15.2414 21.6638 13.6616 22 12 22C6.02658 22 1 17.6193 1 12C1 6.38065 6.02658 2 12 2ZM7.5 10.5C6.67157 10.5 6 11.1716 6 12C6 12.8284 6.67157 13.5 7.5 13.5C8.32843 13.5 9 12.8284 9 12C9 11.1716 8.32843 10.5 7.5 10.5ZM12 10.5C11.1716 10.5 10.5 11.1716 10.5 12C10.5 12.8284 11.1716 13.5 12 13.5C12.8284 13.5 13.5 12.8284 13.5 12C13.5 11.1716 12.8284 10.5 12 10.5ZM16.5 10.5C15.6716 10.5 15 11.1716 15 12C15 12.8284 15.6716 13.5 16.5 13.5C17.3284 13.5 18 12.8284 18 12C18 11.1716 17.3284 10.5 16.5 10.5Z" fill="currentColor" /></svg>;
}

function WidgetDisplaySettings({ draft, update, device, setDevice, domainInput, setDomainInput, domainError, addDomain }: { draft: Channel; update: (patch: Partial<Channel>) => void; device: 'desktop' | 'mobile'; setDevice: (value: 'desktop' | 'mobile') => void; domainInput: string; setDomainInput: (value: string) => void; domainError: string; addDomain: () => void }) {
  const isMobile = device === 'mobile';
  const visible = isMobile ? draft.widgetMobileVisible ?? true : draft.widgetDesktopVisible ?? true;
  const position = isMobile ? draft.widgetMobilePosition ?? draft.widgetPosition ?? 'bottom-right' : draft.widgetPosition ?? 'bottom-right';
  const offsetX = isMobile ? draft.widgetMobileOffsetX ?? draft.widgetOffsetX ?? 24 : draft.widgetOffsetX ?? 24;
  const offsetY = isMobile ? draft.widgetMobileOffsetY ?? draft.widgetOffsetY ?? 24 : draft.widgetOffsetY ?? 24;
  const uploadIcon = async (file?: File) => {
    try {
      update({ widgetCustomIcon: await imageFileToDataUrl(file), widgetIcon: 'custom' });
      Message.success('悬浮按钮图标已更新');
    } catch (error) {
      Message.error(error instanceof Error ? error.message : '图标上传失败');
    }
  };
  const updateDevice = (desktopPatch: Partial<Channel>, mobilePatch: Partial<Channel>) => update(isMobile ? mobilePatch : desktopPatch);
  const allowedDomains = draft.allowedDomains ?? [];
  return <>
    <div className="channel-field"><span>允许域名</span><div className="allowed-domain-input">{allowedDomains.map((domain) => <span key={domain}>{domain}<button type="button" aria-label={`移除 ${domain}`} onClick={() => { update({ allowedDomains: allowedDomains.filter((item) => item !== domain) }); setDomainInput(''); }}>×</button></span>)}<input value={domainInput} onChange={(event) => setDomainInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDomain(); } }} placeholder={allowedDomains.length ? '' : '留空则所有域名可显示；输入域名后按 Enter 添加'} /></div>{domainError && <small className="channel-field-error" role="alert">{domainError}</small>}</div>
    <div className="channel-field"><span>悬浮按钮图标</span><div className="widget-icon-picker">
      <label className={`widget-icon-option is-upload${draft.widgetIcon === 'custom' ? ' is-selected' : ''}`} aria-label="上传自定义图标">{draft.widgetIcon === 'custom' && draft.widgetCustomIcon ? <WidgetGlyph type="custom" customIcon={draft.widgetCustomIcon} /> : <strong>＋</strong>}<input type="file" accept="image/*" onChange={(event) => { void uploadIcon(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
      {(['message', 'message-dark', 'message-line'] as const).map((icon) => <button type="button" key={icon} className={`widget-icon-option${(draft.widgetIcon ?? 'message') === icon ? ' is-selected' : ''}`} aria-label={icon === 'message' ? '默认消息图标' : icon === 'message-dark' ? '深色消息图标' : '文本消息图标'} onClick={() => update({ widgetIcon: icon })}><WidgetGlyph type={icon} /></button>)}
    </div></div>
    {draft.widgetIcon === 'custom' && <Button type="text" size="small" onClick={() => update({ widgetIcon: 'message', widgetCustomIcon: undefined })}>恢复默认图标</Button>}
    <div className="widget-device-tabs" role="tablist" aria-label="设备类型"><button type="button" role="tab" aria-selected={!isMobile} className={!isMobile ? 'active' : ''} onClick={() => setDevice('desktop')}><span className="device-desktop-icon" />桌面端</button><button type="button" role="tab" aria-selected={isMobile} className={isMobile ? 'active' : ''} onClick={() => setDevice('mobile')}><span className="device-mobile-icon" />移动端</button></div>
    <div className="widget-device-settings">
      <div className="modern-switch-row"><div><strong>展示</strong><span>控制网站小部件是否在{isMobile ? '移动端' : '桌面端'}显示</span></div><Switch checked={visible} onChange={(value) => updateDevice({ widgetDesktopVisible: value }, { widgetMobileVisible: value })} /></div>
      <div className="channel-field"><span>按钮位置</span><div className="widget-position-picker"><button type="button" className={position === 'bottom-left' ? 'active' : ''} onClick={() => updateDevice({ widgetPosition: 'bottom-left' }, { widgetMobilePosition: 'bottom-left' })}><i className="is-left" />左侧</button><div className={`widget-device-outline${isMobile ? ' is-mobile' : ''}`}><i className={position === 'bottom-left' ? 'is-left' : 'is-right'} /></div><button type="button" className={position === 'bottom-right' ? 'active' : ''} onClick={() => updateDevice({ widgetPosition: 'bottom-right' }, { widgetMobilePosition: 'bottom-right' })}>右侧<i className="is-right" /></button></div></div>
      <div className="channel-field"><span>边缘距离</span><div className="widget-offset-row"><label>侧边<InputNumber min={0} max={100} precision={0} value={offsetX} onChange={(value: number) => updateDevice({ widgetOffsetX: value }, { widgetMobileOffsetX: value })} suffix="px" /></label><label>底部<InputNumber min={0} max={100} precision={0} value={offsetY} onChange={(value: number) => updateDevice({ widgetOffsetY: value }, { widgetMobileOffsetY: value })} suffix="px" /></label></div></div>
    </div>
    {draft.widgetDesktopVisible === false && draft.widgetMobileVisible === false && <div className="channel-field-tip">所有设备均已隐藏，客户将看不到网站小部件。</div>}
  </>;
}

function InstallCodeModal({ open, onClose, code, copy }: { open: boolean; onClose: () => void; code: string; copy: (value: string, label: string) => void }) {
  return <Modal className="install-code-modal" open={open} title="安装网站小部件" footer={null} onCancel={onClose} destroyOnHidden>
    <p>将以下代码粘贴到页面 <code>&lt;/body&gt;</code> 标签之前。</p>
    <pre><code>{code}</code></pre>
    <div className="install-code-modal-actions"><Button className="install-code-copy-button" type="primary" icon={<IconCopy />} onClick={() => copy(code, '安装代码')}>复制代码</Button></div>
  </Modal>;
}

function ChatPageSetupModal({ open, channel, onClose, copy }: { open: boolean; channel?: Channel; onClose: () => void; copy: (value: string, label: string) => void }) {
  const url = channel ? `${window.location.origin}${window.location.pathname}#/chat/${channel.id}` : '';
  return <Modal className="chat-page-setup-modal" open={open} title="与客户分享您的聊天页面" footer={null} onCancel={onClose} destroyOnHidden>
    <div className="chat-page-setup-content">
      <p>在新闻简报、网站和社交媒体上分享您的聊天链接，以便客户随时可以与您聊天。</p>
      <div className="chat-page-share-row"><Input value={url} readOnly /><Button icon={<IconCopy />} onClick={() => copy(url, '聊天页面链接')}>复制链接</Button></div>
      <div className="chat-page-link-actions"><Button onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>打开聊天页面</Button></div>
    </div>
  </Modal>;
}

function ChatPageLinkSettings({ draft, copy }: { draft: Channel; copy: (value: string, label: string) => void }) {
  const url = `${window.location.origin}${window.location.pathname}#/chat/${draft.id}`;
  return <div className="chat-page-link-card">
    <label className="chat-link-field"><span>聊天页面 URL</span><div><Input value={url} readOnly /><Button aria-label="复制聊天链接" icon={<IconCopy />} onClick={() => copy(url, '聊天页面链接')} /></div></label>
    <div className="chat-page-link-actions"><Button onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>打开聊天页面</Button></div>
  </div>;
}

function CodeMark() {
  return <span className="install-code-mark" aria-hidden="true">&lt;/&gt;</span>;
}

function PreviewMessageContent({ message, expanded, toggleTimestamp, onMediaReady }: { message: PreviewMessage; expanded: boolean; toggleTimestamp: () => void; onMediaReady: () => void }) {
  const kind = message.kind ?? 'text';
  if (kind === 'image' && message.fileUrl) {
    return <button type="button" className="channel-preview-media is-image" aria-label={`查看图片 ${message.fileName ?? ''}`} aria-expanded={expanded} onClick={toggleTimestamp}><img src={message.fileUrl} alt={message.fileName ?? '上传的图片'} width="260" height="180" onLoad={onMediaReady} /></button>;
  }
  if (kind === 'video' && message.fileUrl) {
    return <div className="channel-preview-media is-video" aria-label={`播放视频 ${message.fileName ?? ''}`} onClick={toggleTimestamp}><video src={message.fileUrl} controls preload="metadata" onLoadedMetadata={onMediaReady} /></div>;
  }
  if (kind === 'audio' && message.fileUrl) {
    return <div className="channel-preview-media is-audio" aria-label={`播放音频 ${message.fileName ?? ''}`} onClick={toggleTimestamp}><span title={message.fileName}>{message.fileName}</span><audio src={message.fileUrl} controls preload="metadata" /></div>;
  }
  if (kind === 'file') {
    return <button type="button" className="channel-preview-file" aria-expanded={expanded} onClick={toggleTimestamp}>
      <span className="channel-preview-file-type" aria-hidden="true">{previewFileExtension(message.fileName)}</span>
      <span className="channel-preview-file-copy"><strong title={message.fileName}>{message.fileName}</strong><small>{formatPreviewFileSize(message.fileSize)}</small></span>
    </button>;
  }
  return <button type="button" className={`channel-preview-message is-${message.role}`} aria-expanded={expanded} onClick={toggleTimestamp}>{message.content}</button>;
}

function ChannelPreview({ type, draft, messages, visibleTimestampId, toggleTimestamp, input, setInput, send, sendAttachment, device, widgetOpen, toggleWidget, previewMuted, togglePreviewMuted }: { type: ChannelType; draft: Channel; messages: PreviewMessage[]; visibleTimestampId: string | null; toggleTimestamp: (messageId: string) => void; input: string; setInput: (value: string) => void; send: () => void; sendAttachment: (file: File) => void; device: 'desktop' | 'mobile'; widgetOpen: boolean; toggleWidget: () => void; previewMuted: boolean; togglePreviewMuted: () => void }) {
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const scrollMessagesToEnd = () => requestAnimationFrame(() => {
    const element = messagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  });
  useEffect(() => { scrollMessagesToEnd(); }, [messages]);
  const theme = draft.themeColor ?? '#1c1f26';
  const chat = <div className="channel-chat-surface" style={{ '--channel-theme': theme, '--channel-theme-foreground': foregroundForTheme(theme) } as React.CSSProperties}>
    <header><div className="preview-brand-logo">{draft.brandAvatar ? <img src={draft.brandAvatar} alt="" /> : draft.brandName?.slice(0, 1).toUpperCase() || '品'}</div><div><strong>{draft.brandName || draft.name}</strong>{draft.brandSignature && <span>{draft.brandSignature}</span>}</div><button type="button" className="preview-notification-button" aria-label={previewMuted ? '打开消息通知' : '关闭消息通知'} onClick={togglePreviewMuted}>{previewMuted ? <IconNotificationClose /> : <IconNotification />}</button>{type === 'web-widget' && <button type="button" aria-label="收起聊天窗口" onClick={toggleWidget}>—</button>}</header>
    <div ref={messagesRef} className="channel-preview-messages">{messages.map((message) => <div key={message.id} className={`channel-preview-message-row is-${message.role} is-${message.kind ?? 'text'}`}><PreviewMessageContent message={message} expanded={visibleTimestampId === message.id} toggleTimestamp={() => toggleTimestamp(message.id)} onMediaReady={scrollMessagesToEnd} />{visibleTimestampId === message.id && <time dateTime={message.timestamp}>{message.timestamp}</time>}</div>)}</div>
    <div className="channel-preview-composer"><button type="button" className="preview-attachment-button" aria-label="添加文件" onClick={() => attachmentInputRef.current?.click()}>＋</button><input ref={attachmentInputRef} className="preview-attachment-input" type="file" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) sendAttachment(file); event.currentTarget.value = ''; }} /><Input value={input} onChange={setInput} onPressEnter={send} placeholder="输入您的消息..." /><Button type="primary" shape="circle" icon={<IconSend />} onClick={send} /></div>
  </div>;
  const position = device === 'mobile' ? draft.widgetMobilePosition ?? draft.widgetPosition ?? 'bottom-right' : draft.widgetPosition ?? 'bottom-right';
  const offsetX = device === 'mobile' ? draft.widgetMobileOffsetX ?? draft.widgetOffsetX ?? 24 : draft.widgetOffsetX ?? 24;
  const offsetY = device === 'mobile' ? draft.widgetMobileOffsetY ?? draft.widgetOffsetY ?? 24 : draft.widgetOffsetY ?? 24;
  const visible = device === 'mobile' ? draft.widgetMobileVisible ?? true : draft.widgetDesktopVisible ?? true;
  return <aside className="modern-channel-preview"><div className="modern-preview-head"><h2>预览</h2></div><div className={`modern-preview-stage is-${device} is-${type}`}>
    {type === 'web-widget' ? visible ? <div className={`widget-preview-anchor is-${position}`} style={{ '--widget-offset-x': `${offsetX}px`, '--widget-offset-y': `${offsetY}px` } as React.CSSProperties}><div className={`widget-chat-motion ${widgetOpen ? 'is-open' : 'is-closed'}`}>{chat}</div>{!widgetOpen && <button type="button" className="widget-floating-button" style={{ background: theme, color: foregroundForTheme(theme) }} onClick={toggleWidget}><WidgetGlyph type={draft.widgetIcon ?? 'message'} customIcon={draft.widgetCustomIcon} /></button>}</div> : <div className="widget-hidden-preview">该设备已隐藏网站小部件</div> : chat}
  </div></aside>;
}
