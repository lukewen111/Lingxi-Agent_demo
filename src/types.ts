export type Status = 'draft' | 'published';
export type KnowledgeStatus = 'adding' | 'success' | 'failed';
export type SessionStatus = 'active' | 'ended' | 'human' | 'error';

export interface Flow {
  id: string;
  name: string;
  trigger: string;
  content: string;
  contentHtml: string;
  updatedAt: string;
}

export interface Guard {
  id: string;
  name: string;
  prompt: string;
  action: 'end' | 'fixed';
  fixedReply: string;
  enabled: boolean;
  updatedAt: string;
}

export interface EnvironmentVariable {
  id: string;
  name: string;
  value: string;
  description: string;
  updatedAt: string;
}

export interface AgentConfig {
  workflowIds?: string[];
  prompt: string;
  language: string;
  style: string;
  memoryEnabled: boolean;
  memoryDays: number | 'permanent';
  historyRounds: number;
  errorMessage: string;
  transferToHuman: TransferToHumanConfig;
  reception: ReceptionConfig;
  flows: Flow[];
  skillIds: string[];
  knowledgeIds: string[];
  guards: Guard[];
  variables: EnvironmentVariable[];
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  teamIds: string[];
  acceptingChats: boolean;
  status: Status;
  updatedAt: string;
  draft: AgentConfig;
  published: AgentConfig | null;
}

export interface TransferToHumanConfig {
  enabled: boolean;
  mode: 'automatic' | 'specified';
  teamId?: string;
}

export interface ReceptionConfig {
  welcomeEnabled: boolean;
  welcomeMessage: string;
  noMessageFollowUpEnabled: boolean;
  noMessageFollowUpDelaySeconds: number;
  noMessageFollowUpMessage: string;
  afterReplyFollowUpEnabled: boolean;
  afterReplyFollowUpDelaySeconds: number;
  afterReplyFollowUpMessage: string;
  closingMessageEnabled: boolean;
  closingMessage: string;
}

export type TeamMemberKind = 'human' | 'ai';
export type TeamPriority = 'primary' | 'backup';

export interface TeamMember {
  id: string;
  kind: TeamMemberKind;
  name: string;
  serviceId: string;
  avatar?: string;
  online: boolean;
  acceptingChats: boolean;
  priority: TeamPriority;
}

export interface Team {
  id: string;
  name: string;
  builtin?: boolean;
  createdAt: string;
  updatedAt: string;
  members: TeamMember[];
}

export interface KnowledgeDocument {
  id: string;
  type: string;
  name: string;
  source: string;
  size?: number;
  creator: string;
  status: KnowledgeStatus;
  content: string;
  createdAt?: string;
  updatedAt: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  updatedAt: string;
}

export type ChannelType = 'web-widget' | 'livechat' | 'telegram' | 'chat-page';

export interface Channel {
  id: string;
  type?: ChannelType;
  name: string;
  agentId?: string;
  enabled: boolean;
  accountId?: string;
  accessToken?: string;
  botToken?: string;
  webhookUrl?: string;
  language?: string;
  websiteDomain?: string;
  allowedDomains?: string[];
  installCode?: string;
  installStatus?: 'unchecked' | 'success' | 'failed';
  installCheckedAt?: string;
  chatPageUrl?: string;
  brandName?: string;
  brandSignature?: string;
  brandAvatar?: string;
  themeColor?: string;
  widgetIcon?: 'message' | 'message-dark' | 'message-line' | 'robot' | 'support' | 'custom';
  widgetCustomIcon?: string;
  widgetPosition?: 'bottom-left' | 'bottom-right';
  widgetOffsetX?: number;
  widgetOffsetY?: number;
  widgetDesktopVisible?: boolean;
  widgetMobileVisible?: boolean;
  widgetMobilePosition?: 'bottom-left' | 'bottom-right';
  widgetMobileOffsetX?: number;
  widgetMobileOffsetY?: number;
  soundEnabled?: boolean;
  receiveGroups?: string[];
  humanGroups?: string[];
  opening?: string;
  hotQuestions?: string[];
  ending?: string;
  humanEnabled?: boolean;
  humanFallback?: string;
  createdAt?: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  title: string;
  channel: string;
  agentId: string;
  startedAt: string;
  messageCount: number;
  status: SessionStatus;
  hits: string[];
  messages: { role: 'user' | 'agent' | 'system'; content: string }[];
}

export type InboxConversationState = 'processing' | 'closed';
export type InboxClosedReason = 'ai_resolved' | 'human_handoff' | 'timeout' | null;
export type InboxChannelType = 'livechat' | 'telegram' | 'web-widget' | 'chat-page';
export type InboxMessageRole = 'customer' | 'agent' | 'system';

export interface InboxMessage {
  id: string;
  role: InboxMessageRole;
  content: string;
  type?: 'text' | 'image' | 'video' | 'audio' | 'file';
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  sentAt: string;
}

export interface InboxConversation {
  id: string;
  visitorId: string;
  customerName: string;
  channelId: string;
  channelType: InboxChannelType;
  channelName: string;
  agentId: string;
  agentName: string;
  state: InboxConversationState;
  closedReason: InboxClosedReason;
  createdAt: string;
  updatedAt: string;
  messages: InboxMessage[];
}

export interface AppState {
  session?: import('./auth').DemoSession | null;
  ui: UiState;
  tenantAccounts: TenantAccount[];
  workflows: import('./workflows/model').Workflow[];
  workflowExamplesVersion?: number;
  demoDataVersion?: number;
  channelDemoVersion?: number;
  agents: Agent[];
  teams: Team[];
  documents: KnowledgeDocument[];
  skills: Skill[];
  channels: Channel[];
  channelConversations: InboxConversation[];
  sessions: Session[];
  members: TenantMember[];
  roles: TenantRole[];
  currentMemberId: string;
  settings: SettingsConfig;
}

export interface TenantRole {
  id: string;
  name: string;
  builtin?: boolean;
  menuKeys: string[];
  createdAt: string;
}

export interface TenantMember {
  id: string;
  username: string;
  roleId: string;
  enabled: boolean;
  createdAt: string;
}

export type TenantWorkspacePermission = 'agents' | 'livechat';

export interface TenantAccount {
  id: string;
  tenantName: string;
  ownerUsername: string;
  password: string;
  workspacePermissions: TenantWorkspacePermission[];
  enabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface ChatTimeoutSettings {
  enabled: boolean;
  minutes: number;
}

export interface SettingsConfig {
  chatTimeout: ChatTimeoutSettings;
}

export interface UiState {
  language: import('./i18n').AppLanguage;
  workspaceMode: import('./i18n').WorkspaceMode;
  lastAgentsPath?: string;
}
