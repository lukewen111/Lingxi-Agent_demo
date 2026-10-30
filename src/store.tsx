import { createContext, useContext, useEffect, useMemo, useReducer, useState, useCallback, useRef } from 'react';
import { seedWorkflows, snapshot, validateWorkflow, normalizeLegacyWorkflow } from './workflows/model';
import type { Workflow, WorkflowDraft } from './workflows/model';
import type { AppState, Agent, AgentConfig, Channel, ChatTimeoutSettings, Flow, Guard, InboxClosedReason, InboxConversation, InboxMessage, KnowledgeDocument, KnowledgeFolder, KnowledgeQa, ReceptionConfig, Skill, Team, TeamMember, TenantAccount, TenantMember, TenantRole } from './types';
import type { AppLanguage, WorkspaceMode } from './i18n';
import { BOUND_DELETE_DEMO_DOCUMENT_ID, KNOWLEDGE_DELETE_DEMO_VERSION, MEMBERS_PERMISSIONS_DEMO_VERSION, now, SEED_CURRENT_MEMBER_ID, seedKnowledgeFolders, seedKnowledgeQas, seedMembers, seedRoles, seedState, UNBOUND_DELETE_DEMO_DOCUMENT_ID } from './mockData';
import { DEFAULT_TEAM_ID, DEFAULT_TEAM_NAME, isDefaultTeam } from './teamDefaults';
import { LOGIN_SESSION_KEY, readDemoSession } from './auth';
import { currentMember } from './permissions';
import { formatAnonymousVisitorName } from './utils/visitor';

type Action =
  | { type: 'session.login'; username: string }
  | { type: 'ui.language'; language: AppLanguage }
  | { type: 'ui.workspace'; workspaceMode: WorkspaceMode; lastAgentsPath?: string }
  | { type: 'session.logout' }
  | { type: 'workflow.add'; workflow: Workflow }
  | { type: 'workflow.save'; id: string; draft: WorkflowDraft }
  | { type: 'workflow.publish'; id: string }
  | { type: 'workflow.delete'; id: string }
  | { type: 'agent.workflows'; id: string; workflowIds: string[] }
  | { type: 'agent.update'; id: string; patch: Partial<Agent> }
  | { type: 'agent.config'; id: string; config: AgentConfig }
  | { type: 'agent.publish'; id: string }
  | { type: 'agent.add'; agent: Agent }
  | { type: 'agent.delete'; id: string }
  | { type: 'agent.assignTeams'; id: string; teamIds: string[] }
  | { type: 'team.save'; team: Team }
  | { type: 'team.delete'; id: string }
  | { type: 'document.add'; document: KnowledgeDocument }
  | { type: 'document.update'; id: string; patch: Partial<KnowledgeDocument> }
  | { type: 'document.delete'; id: string }
  | { type: 'knowledge.folder.save'; folder: KnowledgeFolder }
  | { type: 'knowledge.folder.delete'; id: string }
  | { type: 'knowledge.qa.save'; qa: KnowledgeQa }
  | { type: 'knowledge.qa.toggle'; id: string; enabled: boolean }
  | { type: 'knowledge.qa.delete'; ids: string[] }
  | { type: 'skill.add'; skill: Skill }
  | { type: 'skill.toggle'; id: string; enabled: boolean }
  | { type: 'skill.delete'; id: string }
  | { type: 'channel.save'; channel: Channel }
  | { type: 'channel.toggle'; id: string; enabled: boolean }
  | { type: 'channel.installDetected'; id: string; checkedAt: string }
  | { type: 'channel.delete'; id: string }
  | { type: 'conversation.upsert'; conversation: InboxConversation }
  | { type: 'conversation.message'; conversationId: string; message: InboxMessage }
  | { type: 'conversation.close'; conversationId: string; reason: Exclude<InboxClosedReason, null>; closedAt: string }
  | { type: 'state.sync'; state: AppState }
  | { type: 'member.add'; member: TenantMember }
  | { type: 'member.updateRole'; id: string; roleId: string }
  | { type: 'member.toggleEnabled'; id: string; enabled: boolean }
  | { type: 'member.delete'; id: string }
  | { type: 'role.add'; role: TenantRole }
  | { type: 'role.update'; id: string; patch: Partial<TenantRole> }
  | { type: 'role.delete'; id: string }
  | { type: 'settings.saveChatTimeout'; value: ChatTimeoutSettings }
  | { type: 'tenant.add'; tenant: TenantAccount }
  | { type: 'tenant.update'; id: string; patch: Partial<Pick<TenantAccount, 'tenantName' | 'workspacePermissions' | 'enabled'>> }
  | { type: 'tenant.toggle'; id: string; enabled: boolean };

const STORAGE_KEY = 'lingxi-agent-prototype:v3:ai-customer-20260720';
const CHANNEL_DEMO_VERSION = 3;
const AVATAR_REFERENCE_PREFIX = '__agent_avatar_ref__:';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const LEGACY_TEAM_IDS: Record<string, string> = { 'team-support': '100001', 'team-sales': '100002', 'team-vip': '100003' };
const LEGACY_CREATOR_NAMES: Record<string, string> = {
  当前用户: 'Owen',
  运营管理员: 'Lana',
  物流运营: 'Mia',
  产品团队: 'Mia',
  客户体验团队: 'Ethan',
  会员运营: 'Sophia',
  商业化团队: 'Leo',
  市场运营: 'Emma',
  商品运营: 'Ryan',
  客服培训组: 'Ava',
  售后运营: 'Noah',
};

const DEFAULT_RECEPTION_CONFIG: ReceptionConfig = {
  welcomeEnabled: false,
  welcomeMessage: '',
  noMessageFollowUpEnabled: false,
  noMessageFollowUpDelaySeconds: 30,
  noMessageFollowUpMessage: '',
  afterReplyFollowUpEnabled: false,
  afterReplyFollowUpDelaySeconds: 60,
  afterReplyFollowUpMessage: '',
  closingMessageEnabled: false,
  closingMessage: '',
};

const normalizeReception = (reception?: Partial<ReceptionConfig>): ReceptionConfig => ({
  ...DEFAULT_RECEPTION_CONFIG,
  ...reception,
});

function keepDefaultTeam(state: AppState): AppState {
  const existing = state.teams.find(isDefaultTeam);
  const humanMembers = new Map<string, TeamMember>();
  state.teams.forEach((team) => team.members.filter((member) => member.kind === 'human').forEach((member) => humanMembers.set(member.id, member)));
  const aiMembers = state.agents.map<TeamMember>((agent) => ({ id: agent.id, kind: 'ai', name: agent.name, serviceId: `AI-${agent.id.slice(-6).toUpperCase()}`, avatar: agent.avatar, online: agent.status === 'published' && agent.acceptingChats, acceptingChats: agent.acceptingChats, priority: 'backup' }));
  const defaultTeam: Team = {
    id: DEFAULT_TEAM_ID,
    name: DEFAULT_TEAM_NAME,
    builtin: true,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: existing?.updatedAt ?? now(),
    members: [...humanMembers.values(), ...aiMembers],
  };
  return {
    ...state,
    agents: state.agents.map((agent) => ({ ...agent, teamIds: Array.from(new Set([DEFAULT_TEAM_ID, ...agent.teamIds])) })),
    teams: [defaultTeam, ...state.teams.filter((team) => !isDefaultTeam(team))],
  };
}

function normalizeTeamIds(state: AppState): AppState {
  const used = new Set<string>();
  const idMap = new Map<string, string>();
  let nextId = 100001;
  state.teams.forEach((team) => {
    const legacy = LEGACY_TEAM_IDS[team.id];
    let normalized = legacy || (/^\d+$/.test(team.id) ? team.id : '');
    if (!normalized || used.has(normalized)) {
      while (used.has(String(nextId))) nextId += 1;
      normalized = String(nextId++);
    }
    used.add(normalized);
    idMap.set(team.id, normalized);
  });
  const remap = (id?: string) => id ? (idMap.get(id) || LEGACY_TEAM_IDS[id] || id) : id;
  const remapConfig = (config: AgentConfig): AgentConfig => ({ ...config, transferToHuman: { ...config.transferToHuman, teamId: remap(config.transferToHuman.teamId) } });
  return keepDefaultTeam({
    ...state,
    documents: state.documents.map((document) => ({ ...document, creator: LEGACY_CREATOR_NAMES[document.creator] || document.creator })),
    teams: state.teams.map((team) => ({ ...team, id: remap(team.id)!, builtin: isDefaultTeam(team) || team.id === DEFAULT_TEAM_ID ? true : team.builtin })),
    agents: state.agents.map((agent) => ({
      ...agent,
      teamIds: Array.from(new Set(agent.teamIds.map((id) => remap(id)!).filter(Boolean))),
      draft: remapConfig(agent.draft),
      published: agent.published ? remapConfig(agent.published) : null,
    })),
  });
}

function ensureKnowledgeDeleteDemoData(state: AppState): AppState {
  if ((state.demoDataVersion ?? 0) >= KNOWLEDGE_DELETE_DEMO_VERSION) return state;
  const demoDocumentIds = new Set([BOUND_DELETE_DEMO_DOCUMENT_ID, UNBOUND_DELETE_DEMO_DOCUMENT_ID]);
  const existingDocumentIds = new Set(state.documents.map((document) => document.id));
  const demoDocuments = seedState.documents.filter((document) => demoDocumentIds.has(document.id) && !existingDocumentIds.has(document.id));
  const bindDemoDocument = (config: AgentConfig): AgentConfig => ({ ...config, knowledgeIds: Array.from(new Set([...config.knowledgeIds, BOUND_DELETE_DEMO_DOCUMENT_ID])) });
  return {
    ...state,
    demoDataVersion: KNOWLEDGE_DELETE_DEMO_VERSION,
    documents: [...demoDocuments, ...state.documents],
    agents: state.agents.map((agent) => ['agent-support', 'agent-refund'].includes(agent.id) ? {
      ...agent,
      draft: bindDemoDocument(agent.draft),
      published: agent.published ? bindDemoDocument(agent.published) : null,
    } : agent),
  };
}

function ensureMembersPermissionsData(state: AppState): AppState {
  if ((state.demoDataVersion ?? 0) >= MEMBERS_PERMISSIONS_DEMO_VERSION && state.members && state.roles && state.currentMemberId) return state;
  return {
    ...state,
    demoDataVersion: MEMBERS_PERMISSIONS_DEMO_VERSION,
    members: seedMembers,
    roles: seedRoles,
    currentMemberId: SEED_CURRENT_MEMBER_ID,
  };
}

function ensureModernChannelDemoData(state: AppState): AppState {
  if ((state.channelDemoVersion ?? 0) >= CHANNEL_DEMO_VERSION) return state;
  const demoIds = new Set(['channel-web-widget-main', 'channel-chat-page-support']);
  const existingIds = new Set(state.channels.map((channel) => channel.id));
  const additions = seedState.channels.filter((channel) => demoIds.has(channel.id) && !existingIds.has(channel.id));
  const channelConversations = state.channelConversations.map((conversation) => conversation.channelType === 'web-widget' || conversation.channelType === 'chat-page'
    ? { ...conversation, customerName: formatAnonymousVisitorName(conversation.visitorId) }
    : conversation);
  return { ...state, channelDemoVersion: CHANNEL_DEMO_VERSION, channels: [...additions, ...state.channels], channelConversations };
}

function serializeState(state: AppState): string {
  const avatarOwners = new Map<string, string>();
  const agents = state.agents.map((agent) => {
    if (!agent.avatar?.startsWith('data:')) return agent;
    const ownerId = avatarOwners.get(agent.avatar);
    if (ownerId) return { ...agent, avatar: `${AVATAR_REFERENCE_PREFIX}${ownerId}` };
    avatarOwners.set(agent.avatar, agent.id);
    return agent;
  });
  const teams = state.teams.map((team) => ({
    ...team,
    members: team.members.map((member) => member.kind === 'ai' && member.avatar ? { ...member, avatar: undefined } : member),
  }));
  const { session: _session, ...businessState } = state;
  return JSON.stringify({ ...businessState, agents, teams });
}

function withStateDefaults(state: AppState): AppState {
  return {
    ...state,
    ui: { language: state.ui?.language ?? 'zh-CN', workspaceMode: state.ui?.workspaceMode ?? 'agents', lastAgentsPath: state.ui?.lastAgentsPath },
    tenantAccounts: state.tenantAccounts ?? seedState.tenantAccounts,
    channelConversations: state.channelConversations ?? [],
    knowledgeFolders: state.knowledgeFolders ?? seedKnowledgeFolders,
    knowledgeQas: state.knowledgeQas ?? seedKnowledgeQas,
  };
}

function migrateKnowledgeV1(state: AppState): AppState {
  const folders = state.knowledgeFolders?.length ? state.knowledgeFolders : seedKnowledgeFolders;
  const topFolderIds = new Set(folders.filter((folder) => folder.level === 1).map((folder) => folder.id));
  const defaultFolder = folders.find((folder) => folder.isDefault)?.id || 'folder-service-default';
  const normalizeConfig = (config: AgentConfig): AgentConfig => ({
    ...config,
    knowledgeIds: config.knowledgeIds.some((id) => topFolderIds.has(id)) ? config.knowledgeIds.filter((id) => topFolderIds.has(id)) : ['folder-service'],
  });
  return {
    ...state,
    knowledgeFolders: folders,
    knowledgeQas: state.knowledgeQas?.length ? state.knowledgeQas : seedKnowledgeQas,
    documents: state.documents.map((document) => ({ ...document, folderId: document.folderId || defaultFolder, enabled: document.enabled ?? true })),
    agents: state.agents.map((agent) => ({ ...agent, draft: normalizeConfig(agent.draft), published: agent.published ? normalizeConfig(agent.published) : null })),
  };
}

function deserializeState(stored: string): AppState {
  const state = JSON.parse(stored) as AppState;
  const avatars = new Map(state.agents.map((agent) => [agent.id, agent.avatar]));
  const validLanguages = new Set(['简体中文', '繁体中文', '英语', '越南语', '泰语', '高棉语', '缅甸语', '老挝语']);
  const normalizeConfig = (config: AgentConfig | null): AgentConfig | null => {
    if (!config) return null;
    return { ...config, language: validLanguages.has(config.language) ? config.language : '英语', reception: normalizeReception(config.reception) };
  };
  const resolveAvatar = (agent: Agent) => {
    let avatar = agent.avatar;
    const visited = new Set<string>();
    while (avatar?.startsWith(AVATAR_REFERENCE_PREFIX)) {
      const ownerId = avatar.slice(AVATAR_REFERENCE_PREFIX.length);
      if (visited.has(ownerId)) return '';
      visited.add(ownerId);
      avatar = avatars.get(ownerId) ?? '';
    }
    return avatar;
  };
  return migrateKnowledgeV1(withStateDefaults({ ...state, settings: state.settings ?? { chatTimeout: { enabled: true, minutes: 15 } }, agents: state.agents.map((agent) => ({ ...agent, avatar: resolveAvatar(agent), draft: normalizeConfig(agent.draft) ?? agent.draft, published: normalizeConfig(agent.published) })) }));
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'state.sync': return { ...action.state, session: state.session };
    case 'session.login': return { ...state, session: { username: action.username }, tenantAccounts: state.tenantAccounts.map((tenant) => tenant.ownerUsername === action.username ? { ...tenant, lastLoginAt: now() } : tenant) };
    case 'session.logout': return { ...state, session: null };
    case 'ui.language': return { ...state, ui: { ...state.ui, language: action.language } };
    case 'ui.workspace': return { ...state, ui: { ...state.ui, workspaceMode: action.workspaceMode, lastAgentsPath: action.lastAgentsPath ?? state.ui.lastAgentsPath } };
    case 'workflow.add': return { ...state, workflows: [action.workflow, ...state.workflows] };
    case 'workflow.save': return { ...state, workflows: state.workflows.map((flow) => flow.id === action.id ? { ...flow, draft: action.draft, updatedAt: now() } : flow) };
    case 'workflow.publish': return { ...state, workflows: state.workflows.map((flow) => flow.id === action.id && !validateWorkflow(flow.draft, state.knowledgeFolders.filter((folder) => folder.level === 1).map((folder) => folder.id)).length ? { ...flow, published: snapshot(flow.draft), publishedAt: now(), updatedAt: now() } : flow) };
    case 'workflow.delete': return state.agents.some((agent) => agent.draft.workflowIds?.includes(action.id) || agent.published?.workflowIds?.includes(action.id)) ? state : { ...state, workflows: state.workflows.filter((flow) => flow.id !== action.id) };
    case 'agent.workflows': return { ...state, agents: state.agents.map((agent) => agent.id === action.id ? { ...agent, draft: { ...agent.draft, workflowIds: [...new Set(action.workflowIds)].filter((id) => state.workflows.some((flow) => flow.id === id && flow.published)) }, updatedAt: now() } : agent) };
    case 'agent.update': {
      const agents = state.agents.map((item) => item.id === action.id ? { ...item, ...action.patch, updatedAt: now() } : item);
      const changed = agents.find((item) => item.id === action.id);
      return {
        ...state,
        agents,
        teams: changed ? state.teams.map((team) => ({ ...team, members: team.members.map((member) => member.kind === 'ai' && member.id === changed.id ? { ...member, name: changed.name, avatar: changed.avatar, acceptingChats: changed.acceptingChats, online: changed.status === 'published' && changed.acceptingChats } : member) })) : state.teams,
      };
    }
    case 'agent.config': return { ...state, agents: state.agents.map((item) => item.id === action.id ? { ...item, draft: action.config, updatedAt: now() } : item) };
    case 'agent.publish': return { ...state, agents: state.agents.map((item) => item.id === action.id ? { ...item, status: 'published', published: clone(item.draft), updatedAt: now() } : item) };
    case 'agent.add': {
      const agent = { ...action.agent, teamIds: Array.from(new Set([DEFAULT_TEAM_ID, ...action.agent.teamIds])) };
      const member: TeamMember = { id: agent.id, kind: 'ai', name: agent.name, serviceId: `AI-${agent.id.slice(-6).toUpperCase()}`, avatar: agent.avatar, online: false, acceptingChats: false, priority: 'backup' };
      return { ...state, agents: [agent, ...state.agents], teams: state.teams.map((team) => agent.teamIds.includes(team.id) ? { ...team, members: [...team.members, member], updatedAt: now() } : team) };
    }
    case 'agent.delete': return {
      ...state,
      agents: state.agents.filter((item) => item.id !== action.id),
      channels: state.channels.map((item) => item.agentId === action.id ? { ...item, agentId: undefined, enabled: false, updatedAt: now() } : item),
      teams: state.teams.map((team) => ({ ...team, members: team.members.filter((member) => member.id !== action.id) })),
    };
    case 'agent.assignTeams': {
      const agent = state.agents.find((item) => item.id === action.id);
      if (!agent) return state;
      const member: TeamMember = { id: agent.id, kind: 'ai', name: agent.name, serviceId: `AI-${agent.id.slice(-6).toUpperCase()}`, avatar: agent.avatar, online: agent.status === 'published' && agent.acceptingChats, acceptingChats: agent.acceptingChats, priority: 'backup' };
      return {
        ...state,
        agents: state.agents.map((item) => item.id === action.id ? { ...item, teamIds: Array.from(new Set([DEFAULT_TEAM_ID, ...action.teamIds])), updatedAt: now() } : item),
        teams: state.teams.map((team) => [DEFAULT_TEAM_ID, ...action.teamIds].includes(team.id) ? { ...team, members: team.members.some((item) => item.id === agent.id) ? team.members : [...team.members, member], updatedAt: now() } : { ...team, members: team.members.filter((item) => item.id !== agent.id), updatedAt: now() }),
      };
    }
    case 'team.save': {
      if (isDefaultTeam(action.team)) return keepDefaultTeam(state);
      const previous = state.teams.find((item) => item.id === action.team.id);
      const teams = previous ? state.teams.map((item) => item.id === action.team.id ? action.team : item) : [action.team, ...state.teams];
      const memberIds = new Set(action.team.members.filter((member) => member.kind === 'ai').map((member) => member.id));
      const previousIds = new Set(previous?.members.filter((member) => member.kind === 'ai').map((member) => member.id) ?? []);
      return {
        ...state,
        teams,
        agents: state.agents.map((agent) => {
          if (!memberIds.has(agent.id) && !previousIds.has(agent.id)) return agent;
          const teamIds = memberIds.has(agent.id) ? Array.from(new Set([...agent.teamIds, action.team.id])) : agent.teamIds.filter((id) => id !== action.team.id);
          return { ...agent, teamIds, updatedAt: now() };
        }),
      };
    }
    case 'team.delete': return action.id === DEFAULT_TEAM_ID ? state : { ...state, teams: state.teams.filter((item) => item.id !== action.id), agents: state.agents.map((agent) => ({ ...agent, teamIds: agent.teamIds.filter((id) => id !== action.id) })) };
    case 'document.add': return { ...state, documents: [action.document, ...state.documents] };
    case 'document.update': return { ...state, documents: state.documents.map((item) => item.id === action.id ? { ...item, ...action.patch, updatedAt: now() } : item) };
    case 'document.delete': {
      return { ...state, documents: state.documents.filter((item) => item.id !== action.id), knowledgeQas: state.knowledgeQas.filter((item) => item.sourceDocumentId !== action.id) };
    }
    case 'knowledge.folder.save': {
      const siblingDuplicate = state.knowledgeFolders.some((item) => item.id !== action.folder.id && item.parentId === action.folder.parentId && item.name.trim().toLowerCase() === action.folder.name.trim().toLowerCase());
      if (siblingDuplicate) return state;
      return { ...state, knowledgeFolders: state.knowledgeFolders.some((item) => item.id === action.folder.id) ? state.knowledgeFolders.map((item) => item.id === action.folder.id ? action.folder : item) : [...state.knowledgeFolders, action.folder] };
    }
    case 'knowledge.folder.delete': {
      const target = state.knowledgeFolders.find((item) => item.id === action.id);
      if (!target || target.isDefault) return state;
      if (target.level === 1) {
        const boundByAgent = state.agents.some((agent) => agent.draft.knowledgeIds.includes(target.id) || Boolean(agent.published?.knowledgeIds.includes(target.id)));
        const boundByWorkflow = state.workflows.some((workflow) => [workflow.draft, workflow.published].filter(Boolean).some((draft) => draft!.nodes.some((node) => {
          try { return (JSON.parse(node.data.config.knowledgeIds || '[]') as unknown[]).includes(target.id); } catch { return false; }
        })));
        if (boundByAgent || boundByWorkflow) return state;
      }
      const removeIds = new Set<string>([action.id]);
      let changed = true;
      while (changed) {
        changed = false;
        state.knowledgeFolders.forEach((folder) => { if (folder.parentId && removeIds.has(folder.parentId) && !removeIds.has(folder.id)) { removeIds.add(folder.id); changed = true; } });
      }
      return {
        ...state,
        knowledgeFolders: state.knowledgeFolders.filter((item) => !removeIds.has(item.id)),
        knowledgeQas: state.knowledgeQas.filter((item) => !removeIds.has(item.folderId)),
        documents: state.documents.filter((item) => !item.folderId || !removeIds.has(item.folderId)),
      };
    }
    case 'knowledge.qa.save': return { ...state, knowledgeQas: state.knowledgeQas.some((item) => item.id === action.qa.id) ? state.knowledgeQas.map((item) => item.id === action.qa.id ? action.qa : item) : [action.qa, ...state.knowledgeQas] };
    case 'knowledge.qa.toggle': return { ...state, knowledgeQas: state.knowledgeQas.map((item) => item.id === action.id ? { ...item, enabled: action.enabled, updatedAt: now() } : item) };
    case 'knowledge.qa.delete': return { ...state, knowledgeQas: state.knowledgeQas.filter((item) => !action.ids.includes(item.id)) };
    case 'skill.add': return { ...state, skills: [action.skill, ...state.skills] };
    case 'skill.toggle': return { ...state, skills: state.skills.map((item) => item.id === action.id ? { ...item, enabled: action.enabled, updatedAt: now() } : item), agents: action.enabled ? state.agents : state.agents.map((item) => ({ ...item, draft: { ...item.draft, skillIds: item.draft.skillIds.filter((id) => id !== action.id) }, published: item.published ? { ...item.published, skillIds: item.published.skillIds.filter((id) => id !== action.id) } : null })) };
    case 'skill.delete': return { ...state, skills: state.skills.filter((item) => item.id !== action.id), agents: state.agents.map((item) => ({ ...item, draft: { ...item.draft, skillIds: item.draft.skillIds.filter((id) => id !== action.id) }, published: item.published ? { ...item.published, skillIds: item.published.skillIds.filter((id) => id !== action.id) } : null })) };
    case 'channel.save': return { ...state, channels: state.channels.some((item) => item.id === action.channel.id) ? state.channels.map((item) => item.id === action.channel.id ? action.channel : item) : [action.channel, ...state.channels] };
    case 'channel.toggle': return { ...state, channels: state.channels.map((item) => item.id === action.id ? { ...item, enabled: action.enabled, updatedAt: now() } : item) };
    case 'channel.installDetected': return { ...state, channels: state.channels.map((item) => item.id === action.id ? { ...item, installStatus: 'success', installCheckedAt: action.checkedAt } : item) };
    case 'channel.delete': return { ...state, channels: state.channels.filter((item) => item.id !== action.id) };
    case 'conversation.upsert': return { ...state, channelConversations: state.channelConversations.some((item) => item.id === action.conversation.id) ? state.channelConversations.map((item) => item.id === action.conversation.id ? action.conversation : item) : [action.conversation, ...state.channelConversations] };
    case 'conversation.message': return { ...state, channelConversations: state.channelConversations.map((item) => item.id === action.conversationId ? { ...item, updatedAt: action.message.sentAt, messages: [...item.messages, action.message] } : item) };
    case 'conversation.close': return { ...state, channelConversations: state.channelConversations.map((item) => item.id === action.conversationId && item.state === 'processing' ? { ...item, state: 'closed', closedReason: action.reason, updatedAt: action.closedAt, messages: [...item.messages, { id: `system-${action.conversationId}-${action.closedAt}`, role: 'system', content: action.reason === 'timeout' ? '会话因长时间无新消息自动结束' : '会话已结束', sentAt: action.closedAt }] } : item) };
    case 'member.add': {
      const duplicate = state.members.some((item) => item.username.trim().toLowerCase() === action.member.username.trim().toLowerCase());
      if (duplicate) return state;
      return { ...state, members: [action.member, ...state.members] };
    }
    case 'member.updateRole': {
      const target = state.members.find((item) => item.id === action.id);
      const role = state.roles.find((item) => item.id === action.roleId);
      if (!target || !role || target.roleId === action.roleId) return state;
      if (target.roleId === 'role-owner') return state;
      return { ...state, members: state.members.map((item) => item.id === action.id ? { ...item, roleId: action.roleId } : item) };
    }
    case 'member.toggleEnabled': {
      const target = state.members.find((item) => item.id === action.id);
      if (!target || target.id === currentMember(state)?.id) return state;
      if (target.roleId === 'role-owner' && !action.enabled) return state;
      return { ...state, members: state.members.map((item) => item.id === action.id ? { ...item, enabled: action.enabled } : item) };
    }
    case 'member.delete': {
      const target = state.members.find((item) => item.id === action.id);
      if (!target || target.id === currentMember(state)?.id) return state;
      if (target.roleId === 'role-owner') return state;
      return { ...state, members: state.members.filter((item) => item.id !== action.id) };
    }
    case 'role.add': {
      const name = action.role.name.trim();
      if (!name || name === 'Owner' || name === '超级管理员') return state;
      if (state.roles.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) return state;
      return { ...state, roles: [action.role, ...state.roles] };
    }
    case 'role.update': {
      const target = state.roles.find((item) => item.id === action.id);
      if (!target || target.builtin) return state;
      const name = action.patch.name?.trim();
      if (name !== undefined) {
        if (!name || name === 'Owner' || name === '超级管理员') return state;
        if (state.roles.some((item) => item.id !== action.id && item.name.trim().toLowerCase() === name.toLowerCase())) return state;
      }
      return { ...state, roles: state.roles.map((item) => item.id === action.id ? { ...item, ...action.patch } : item) };
    }
    case 'role.delete': {
      const target = state.roles.find((item) => item.id === action.id);
      if (!target || target.builtin) return state;
      if (state.members.some((member) => member.roleId === action.id)) return state;
      return { ...state, roles: state.roles.filter((item) => item.id !== action.id) };
    }
    case 'settings.saveChatTimeout': return { ...state, settings: { ...state.settings, chatTimeout: action.value } };
    case 'tenant.add': {
      const duplicate = state.tenantAccounts.some((tenant) => tenant.ownerUsername.trim().toLowerCase() === action.tenant.ownerUsername.trim().toLowerCase());
      if (duplicate) return state;
      return { ...state, tenantAccounts: [action.tenant, ...state.tenantAccounts] };
    }
    case 'tenant.update': return { ...state, tenantAccounts: state.tenantAccounts.map((tenant) => tenant.id === action.id ? { ...tenant, ...action.patch } : tenant) };
    case 'tenant.toggle': return { ...state, tenantAccounts: state.tenantAccounts.map((tenant) => tenant.id === action.id ? { ...tenant, enabled: action.enabled } : tenant) };
    default: return state;
  }
}

function loadState(): AppState {
  const withWorkflows = (state: AppState): AppState => {
    state = { ...state, workflows: (state.workflows ?? []).map(normalizeLegacyWorkflow) };
    if (state.workflowExamplesVersion === 1) return state;
    const examples = seedWorkflows();
    const workflows = state.workflows ?? [];
    const additions = examples.filter((flow) => !workflows.some((existing) => existing.id === flow.id));
    const fresh = workflows.length === 0;
    const bindingId = fresh ? 'workflow-order-demo' : additions.find((flow) => flow.id === 'workflow-deposit-demo')?.id;
    const agentId = state.agents.find((agent) => agent.published)?.id;
    return { ...state, workflowExamplesVersion: 1, workflows: [...workflows, ...additions], agents: state.agents.map((agent) => {
      if (!bindingId || agent.id !== agentId || !agent.published) return agent;
      return { ...agent, draft: { ...agent.draft, workflowIds: [...new Set([...(agent.draft.workflowIds ?? []), bindingId])] }, published: { ...agent.published, workflowIds: [...new Set([...(agent.published.workflowIds ?? []), bindingId])] } };
    }) };
  };
  const withMembers = (state: AppState): AppState => withStateDefaults({ ...ensureMembersPermissionsData(state), session: readDemoSession() });
  try { const stored = localStorage.getItem(STORAGE_KEY); return migrateKnowledgeV1(withMembers(withWorkflows(ensureModernChannelDemoData(ensureKnowledgeDeleteDemoData(normalizeTeamIds(stored ? deserializeState(stored) : seedState)))))); } catch { return migrateKnowledgeV1(withMembers(withWorkflows(ensureModernChannelDemoData(ensureKnowledgeDeleteDemoData(normalizeTeamIds(seedState)))))); }
}

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action>; saveStatus: 'saving' | 'saved' | 'error'; retrySave: () => void; login: (username: string) => void; logout: () => void } | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, baseDispatch] = useReducer(reducer, undefined, loadState);
  const [persisted, setPersisted] = useState<AppState | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const persist = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeState(state));
      setPersisted(state);
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }, [state]);
  useEffect(persist, [persist]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('lingxi-channel-runtime');
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<Action>) => {
      if (event.data?.type === 'conversation.upsert' || event.data?.type === 'conversation.message' || event.data?.type === 'conversation.close' || event.data?.type === 'channel.installDetected') baseDispatch(event.data);
    };
    return () => { channel.close(); channelRef.current = null; };
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { baseDispatch({ type: 'state.sync', state: deserializeState(event.newValue) }); } catch { /* ignore invalid external state */ }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const dispatch = useCallback((action: Action) => {
    baseDispatch(action);
    if (action.type === 'conversation.upsert' || action.type === 'conversation.message' || action.type === 'conversation.close' || action.type === 'channel.installDetected') channelRef.current?.postMessage(action);
  }, []);
  const saveStatus: 'error' | 'saved' | 'saving' = saveFailed ? 'error' : persisted === state ? 'saved' : 'saving';
  const login = useCallback((username: string) => {
    sessionStorage.setItem(LOGIN_SESSION_KEY, JSON.stringify({ username: username.trim() }));
    baseDispatch({ type: 'session.login', username: username.trim() });
  }, []);
  const logout = useCallback(() => {
    sessionStorage.removeItem(LOGIN_SESSION_KEY);
    baseDispatch({ type: 'session.logout' });
  }, []);
  const value = useMemo(() => ({ state, dispatch, saveStatus, retrySave: persist, login, logout }), [state, dispatch, saveStatus, persist, login, logout]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useAppStore must be used inside AppProvider');
  return context;
}

export const updateAgentConfig = (id: string, current: AgentConfig, patch: Partial<AgentConfig>) => ({ type: 'agent.config' as const, id, config: { ...current, ...patch } });
export const updateFlow = (config: AgentConfig, flow: Flow) => ({ ...config, flows: config.flows.map((item) => item.id === flow.id ? flow : item) });
export const updateGuards = (config: AgentConfig, guards: Guard[]) => ({ ...config, guards });
