import type { AgentConfig, AppState, Channel, Flow, Guard, KnowledgeFolder, KnowledgeQa, Session, Skill, Team, TenantMember, TenantRole } from './types';
import { MENU_LEAF_KEYS } from './permissions';

export const now = () => new Date().toISOString();

const at = (day: string, time: string) => `2026-07-${day}T${time}:00+08:00`;
const cloneConfig = (config: AgentConfig): AgentConfig => JSON.parse(JSON.stringify(config));

export const KNOWLEDGE_DELETE_DEMO_VERSION = 1;
export const MEMBERS_PERMISSIONS_DEMO_VERSION = 4;
export const BOUND_DELETE_DEMO_DOCUMENT_ID = 'doc-delete-bound-confirmation';
export const UNBOUND_DELETE_DEMO_DOCUMENT_ID = 'doc-delete-unbound-confirmation';

export const seedRoles: TenantRole[] = [
  { id: 'role-owner', name: 'Owner', builtin: true, menuKeys: [], createdAt: at('01', '09:00') },
  { id: 'role-admin', name: '超级管理员', builtin: true, menuKeys: [...MENU_LEAF_KEYS], createdAt: at('01', '09:10') },
  { id: 'role-ai-ops', name: 'AI运营', menuKeys: ['inbox', 'agents', 'knowledge', 'workflows'], createdAt: at('08', '10:12') },
  { id: 'role-support-lead', name: '客服主管', menuKeys: ['inbox', 'agents', 'channels', 'settings:chat-timeout', 'settings:members', 'settings:roles'], createdAt: at('06', '14:40') },
  { id: 'role-finance', name: '财务专员', menuKeys: ['inbox'], createdAt: at('03', '11:05') },
];

export const seedMembers: TenantMember[] = [
  { id: 'member-lusenbao49', username: 'lusenbao49', roleId: 'role-owner', enabled: true, createdAt: at('01', '09:00') },
  { id: 'member-boss', username: 'boss', roleId: 'role-admin', enabled: true, createdAt: at('01', '09:15') },
  { id: 'member-owen88', username: 'owen88', roleId: 'role-support-lead', enabled: true, createdAt: at('20', '16:20') },
  { id: 'member-ava99', username: 'ava99', roleId: 'role-support-lead', enabled: true, createdAt: at('18', '10:02') },
  { id: 'member-jason01', username: 'jason01', roleId: 'role-ai-ops', enabled: true, createdAt: at('15', '09:45') },
  { id: 'member-david88', username: 'david88', roleId: 'role-ai-ops', enabled: true, createdAt: at('14', '15:30') },
  { id: 'member-lina88', username: 'lina88', roleId: 'role-ai-ops', enabled: true, createdAt: at('13', '11:18') },
  { id: 'member-carlos88', username: 'carlos88', roleId: 'role-ai-ops', enabled: false, createdAt: at('12', '17:26') },
  { id: 'member-emma88', username: 'emma88', roleId: 'role-ai-ops', enabled: true, createdAt: at('11', '10:54') },
  { id: 'member-noah88', username: 'noah88', roleId: 'role-ai-ops', enabled: true, createdAt: at('09', '14:37') },
  { id: 'member-olivia88', username: 'olivia88', roleId: 'role-ai-ops', enabled: true, createdAt: at('07', '09:24') },
  { id: 'member-henry88', username: 'henry88', roleId: 'role-ai-ops', enabled: false, createdAt: at('05', '16:08') },
];

export const SEED_CURRENT_MEMBER_ID = 'member-lusenbao49';

const flow = (id: string, name: string, trigger: string, steps: string[], updatedAt: string): Flow => ({
  id,
  name,
  trigger,
  content: steps.join('\n'),
  contentHtml: `<h2>${name}</h2><ol>${steps.map((step) => `<li>${step}</li>`).join('')}</ol>`,
  updatedAt,
});

const guard = (id: string, name: string, action: Guard['action'], prompt: string, enabled: boolean, updatedAt: string, fixedReply = ''): Guard => ({
  id,
  name,
  prompt,
  action,
  fixedReply: action === 'fixed' ? fixedReply : '',
  enabled,
  updatedAt,
});

const createConfig = (patch: Partial<AgentConfig> = {}): AgentConfig => ({
  prompt: '你是企业客户支持智能体。回答应准确、清晰且可执行；无法确认的信息不得猜测，必要时转交人工客服。',
  language: '英语',
  style: '自然',
  memoryEnabled: true,
  memoryDays: 30,
  historyRounds: 12,
  transferToHuman: { enabled: true, mode: 'automatic' },
  reception: {
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
  },
  errorMessage: '抱歉，当前服务暂时无法完成回复，请稍后重试或联系人工客服。',
  flows: [],
  skillIds: [],
  knowledgeIds: [],
  guards: [],
  variables: [],
  ...patch,
});

const orderFlow = flow('flow-order', '订单状态查询', '用户询问订单状态、发货时间、物流进度或预计送达时间', [
  '请用户提供订单号或下单手机号后四位。',
  '调用“查询订单”技能获取订单与物流状态。',
  '结合“物流配送说明”解释预计送达时间。',
  '查询失败或订单异常时创建售后工单并建议转人工。',
], at('10', '14:28'));

const refundFlow = flow('flow-refund', '退款申请处理', '用户提出退款、取消订单或询问退款到账时间', [
  '确认订单号、退款原因和商品当前状态。',
  '引用“退款政策与时效”判断是否满足申请条件。',
  '满足条件时调用“提交退款申请”技能。',
  '不满足条件或存在争议时转人工处理。',
], at('09', '17:16'));

const ticketFlow = flow('flow-ticket', '售后问题建单', '用户反馈商品破损、少件、错发或多次处理未解决', [
  '收集订单号、问题类型和必要的凭证信息。',
  '调用“创建售后工单”技能生成工单。',
  '向用户返回工单编号和预计响应时间。',
], at('08', '11:42'));

const humanFlow = flow('flow-human', '转人工处理', '用户明确要求人工客服，或自动处理连续两次失败', [
  '确认当前 LiveChat 渠道已开启转人工。',
  '保留本轮会话摘要并转入对应人工 Group。',
  '转接失败时发送渠道配置的失败话术。',
], at('07', '16:05'));

const productFlow = flow('flow-product', '产品能力咨询', '用户咨询产品功能、套餐差异、价格或试用方式', [
  '识别用户所属行业、团队规模和主要使用场景。',
  '引用“产品能力介绍”和“套餐与权益说明”回答问题。',
  '用户表达购买意向时记录销售线索。',
], at('10', '10:18'));

const leadFlow = flow('flow-lead', '销售线索收集', '用户询价、申请演示或表达采购意向', [
  '收集联系人、公司名称、团队规模和预计上线时间。',
  '调用“记录销售线索”技能保存线索。',
  '告知用户销售顾问的预计联系时间。',
], at('09', '15:32'));

const logisticsFlow = flow('flow-logistics-exception', '物流异常处理', '物流超过承诺时效、轨迹停滞或显示签收但用户未收到', [
  '调用“查询订单”技能获取最新物流轨迹。',
  '按照“物流异常处理规范”判断异常类型。',
  '调用“发起物流核查”技能提交核查任务。',
  '高价值订单或重复异常时转人工。',
], at('10', '08:50'));

const vipFlow = flow('flow-vip', '会员权益咨询', '用户询问会员等级、积分、专属权益或生日礼遇', [
  '调用“查询客户信息”技能确认会员等级。',
  '引用“会员权益说明”返回当前可用权益。',
  '涉及补发权益或账户争议时转人工。',
], at('08', '13:24'));

const skills: Skill[] = [
  { id: 'skill-order', name: '查询订单', description: '根据订单号查询订单状态、商品明细、物流轨迹和预计送达时间，并返回可用于客服解释的结构化结果。', enabled: true, updatedAt: at('10', '14:30') },
  { id: 'skill-ticket', name: '创建售后工单', description: '记录售后问题、客户诉求和处理优先级，创建工单后返回工单编号与预计响应时效。', enabled: true, updatedAt: at('09', '11:08') },
  { id: 'skill-refund', name: '提交退款申请', description: '校验订单退款资格并提交退款申请，返回受理结果、退款单号及预计到账时间。', enabled: true, updatedAt: at('09', '16:44') },
  { id: 'skill-logistics', name: '发起物流核查', description: '针对轨迹停滞、超时未达和异常签收发起物流核查，并持续返回承运商处理进度。', enabled: true, updatedAt: at('10', '09:02') },
  { id: 'skill-lead', name: '记录销售线索', description: '保存企业名称、联系人、团队规模、采购计划和意向等级，供销售顾问后续跟进。', enabled: true, updatedAt: at('08', '18:12') },
  { id: 'skill-inventory', name: '查询商品库存', description: '按商品编码和销售区域查询可售库存、补货计划及预计发货时间，支持多个仓库结果汇总。', enabled: true, updatedAt: at('07', '10:35') },
  { id: 'skill-customer', name: '查询客户信息', description: '根据客户标识查询会员等级、积分余额、服务记录和可用权益，辅助判断服务优先级。', enabled: false, updatedAt: at('06', '15:20') },
  { id: 'skill-coupon', name: '查询优惠资格', description: '校验客户是否满足优惠券、试用额度和活动折扣条件，并返回不可用原因。', enabled: false, updatedAt: at('05', '12:16') },
];

const supportPublished = createConfig({
  prompt: '你是官网客户支持智能体，负责处理订单、物流、退款和售后咨询。先核实必要信息，再调用对应技能；不得承诺无法确认的处理结果。',
  memoryDays: 30,
  historyRounds: 15,
  flows: [orderFlow, refundFlow, ticketFlow, humanFlow],
  skillIds: ['skill-order', 'skill-ticket', 'skill-refund'],
  knowledgeIds: ['doc-refund', 'doc-delivery', 'doc-service-sla', 'doc-faq', BOUND_DELETE_DEMO_DOCUMENT_ID],
  guards: [
    guard('guard-sensitive', '敏感凭证保护', 'end', '用户要求提供账号密码、Token、密钥或内部接口地址时触发。', true, at('10', '13:42')),
    guard('guard-promise', '禁止收益与结果承诺', 'fixed', '用户要求承诺退款必定到账、赔付结果或其他确定性处理结果时触发。', true, at('09', '09:25'), '具体处理结果以系统审核和实际进度为准，我可以继续帮你查询当前状态。'),
    guard('guard-abuse', '辱骂与骚扰处理', 'fixed', '用户持续辱骂、威胁或发送骚扰内容时触发。', false, at('06', '18:10'), '请保持友好沟通。如果继续发送攻击性内容，本次会话可能会被结束。'),
  ],
  variables: [
    { id: 'var-support-api', name: 'API_BASE_URL', value: 'https://sandbox-api.example.internal', description: '订单与售后接口地址', updatedAt: at('10', '09:10') },
    { id: 'var-support-queue', name: 'TICKET_QUEUE', value: 'after_sales_l1', description: '默认售后工单队列', updatedAt: at('08', '14:05') },
    { id: 'var-support-timeout', name: 'REQUEST_TIMEOUT', value: '8000', description: '技能请求超时时间（毫秒）', updatedAt: at('07', '11:30') },
  ],
});

const supportDraft = createConfig({
  ...cloneConfig(supportPublished),
  prompt: `${supportPublished.prompt}\n对于物流轨迹停滞超过 48 小时的订单，优先发起物流核查。`,
  flows: [...supportPublished.flows, logisticsFlow],
  skillIds: [...supportPublished.skillIds, 'skill-logistics'],
  knowledgeIds: [...supportPublished.knowledgeIds, 'doc-logistics-exception'],
});

const salesConfig = createConfig({
  prompt: '你是企业售前咨询智能体，负责介绍产品能力、套餐权益和接入方式，并识别有效采购需求。不得虚构价格、案例或交付承诺。',
  style: '专业',
  memoryDays: 14,
  historyRounds: 8,
  flows: [productFlow, leadFlow, humanFlow],
  skillIds: ['skill-lead', 'skill-inventory'],
  knowledgeIds: ['doc-product', 'doc-plan', 'doc-promotion'],
  guards: [guard('guard-sales-promise', '售前承诺限制', 'fixed', '用户要求保证效果、承诺未公开价格或交付日期时触发。', true, at('09', '10:40'), '具体价格与交付计划需要由销售顾问结合实际需求确认。')],
  variables: [{ id: 'var-sales-source', name: 'LEAD_SOURCE', value: 'official_livechat', description: '销售线索来源', updatedAt: at('08', '16:20') }],
});

const logisticsConfig = createConfig({
  prompt: '你是物流服务智能体，负责查询配送轨迹、解释预计送达时间并处理物流异常。只使用系统返回的物流数据。',
  style: '简洁',
  memoryEnabled: true,
  flows: [orderFlow, logisticsFlow, humanFlow],
  skillIds: ['skill-order', 'skill-logistics', 'skill-ticket'],
  knowledgeIds: ['doc-delivery', 'doc-logistics-exception', 'doc-service-sla'],
  guards: [guard('guard-logistics-data', '物流信息保护', 'end', '用户要求查询非本人订单、索取收件人完整手机号或地址时触发。', true, at('08', '09:36'))],
  variables: [{ id: 'var-logistics-region', name: 'DEFAULT_REGION', value: 'CN', description: '默认物流查询区域', updatedAt: at('07', '13:45') }],
});

const vipConfig = createConfig({
  prompt: '你是会员服务智能体，负责解释会员等级、积分和专属权益。涉及账户调整、积分补发或身份争议时必须转人工。',
  style: '亲切',
  memoryDays: 'permanent',
  historyRounds: 20,
  flows: [vipFlow, humanFlow],
  skillIds: [],
  knowledgeIds: ['doc-vip', 'doc-faq'],
  guards: [guard('guard-vip-privacy', '会员隐私保护', 'fixed', '用户要求查看其他会员账户、积分或服务记录时触发。', true, at('08', '13:48'), '为保护账户隐私，我只能协助查询当前已验证账户的信息。')],
  variables: [{ id: 'var-vip-queue', name: 'VIP_HUMAN_GROUP', value: 'vip_service', description: 'VIP 人工服务组', updatedAt: at('08', '12:04') }],
});

const refundDraft = createConfig({
  prompt: '',
  memoryEnabled: true,
  flows: [refundFlow],
  skillIds: ['skill-refund'],
  knowledgeIds: ['doc-refund', 'doc-return', BOUND_DELETE_DEMO_DOCUMENT_ID],
  guards: [guard('guard-refund-promise', '退款承诺限制', 'fixed', '用户要求保证具体到账日期或审核结果时触发。', true, at('10', '12:22'), '退款结果和到账时间以审核进度及支付机构处理为准。')],
});

const afterSalesDraft = createConfig({
  prompt: '你是售后工单助手，负责收集问题信息并创建售后工单。回答应简洁，不处理退款审核结果。',
  memoryDays: 7,
  historyRounds: 6,
  flows: [ticketFlow, humanFlow],
  skillIds: ['skill-ticket'],
  knowledgeIds: ['doc-service-sla', 'doc-return'],
});

const makeSession = (input: {
  id: string; title: string; channel: string; agentId: string; startedAt: string; status: Session['status'];
  messageCount: number; hits: string[]; user: string; system?: string; reply?: string;
}): Session => ({
  id: input.id,
  title: input.title,
  channel: input.channel,
  agentId: input.agentId,
  startedAt: input.startedAt,
  messageCount: input.messageCount,
  status: input.status,
  hits: input.hits,
  messages: [
    { role: 'user', content: input.user },
    ...(input.system ? [{ role: 'system' as const, content: input.system }] : []),
    ...(input.reply ? [{ role: 'agent' as const, content: input.reply }] : []),
  ],
});

const channel = (patch: Channel): Channel => ({ ...patch, createdAt: patch.createdAt ?? patch.updatedAt });

const teams: Team[] = [
  {
    id: '100000', name: '通用', builtin: true, createdAt: at('07', '09:00'), updatedAt: at('11', '09:18'), members: [
      { id: 'staff-lin', kind: 'human', name: '林雨', serviceId: 'CS-10021', online: true, acceptingChats: true, priority: 'primary' },
      { id: 'staff-wang', kind: 'human', name: '王涵', serviceId: 'CS-10036', online: false, acceptingChats: false, priority: 'backup' },
      { id: 'staff-zhou', kind: 'human', name: '周宁', serviceId: 'CS-10052', online: true, acceptingChats: true, priority: 'primary' },
      { id: 'staff-chen', kind: 'human', name: '陈嘉', serviceId: 'CS-10068', online: true, acceptingChats: true, priority: 'primary' },
      { id: 'staff-liu', kind: 'human', name: '刘璇', serviceId: 'CS-10073', online: true, acceptingChats: true, priority: 'backup' },
      { id: 'agent-support', kind: 'ai', name: '客服接待', serviceId: 'AI-SUPPORT', online: true, acceptingChats: true, priority: 'backup' },
      { id: 'agent-sales', kind: 'ai', name: '售前咨询', serviceId: 'AI-SALES', online: false, acceptingChats: false, priority: 'backup' },
      { id: 'agent-logistics', kind: 'ai', name: '物流查询助手', serviceId: 'AI-ISTICS', online: false, acceptingChats: false, priority: 'backup' },
      { id: 'agent-vip', kind: 'ai', name: '会员服务', serviceId: 'AI-VIP', online: false, acceptingChats: false, priority: 'backup' },
      { id: 'agent-refund', kind: 'ai', name: '退款处理', serviceId: 'AI-EFUND', online: false, acceptingChats: false, priority: 'backup' },
      { id: 'agent-after-sales', kind: 'ai', name: '售后工单助手', serviceId: 'AI-SALES', online: false, acceptingChats: false, priority: 'backup' },
    ],
  },
  {
    id: '100001', name: '客户服务组', createdAt: at('08', '10:00'), updatedAt: at('11', '09:18'), members: [
      { id: 'staff-lin', kind: 'human', name: '林雨', serviceId: 'CS-10021', online: true, acceptingChats: true, priority: 'primary' },
      { id: 'staff-wang', kind: 'human', name: '王涵', serviceId: 'CS-10036', online: false, acceptingChats: false, priority: 'backup' },
      { id: 'agent-support', kind: 'ai', name: '客服接待', serviceId: 'AI-SUPPORT', online: true, acceptingChats: true, priority: 'backup' },
    ],
  },
  {
    id: '100002', name: '企业咨询组', createdAt: at('08', '11:30'), updatedAt: at('10', '18:36'), members: [
      { id: 'staff-zhou', kind: 'human', name: '周宁', serviceId: 'CS-10052', online: true, acceptingChats: true, priority: 'primary' },
      { id: 'agent-sales', kind: 'ai', name: '售前咨询', serviceId: 'AI-SALES', online: false, acceptingChats: false, priority: 'backup' },
    ],
  },
  {
    id: '100003', name: '会员服务组', createdAt: at('07', '09:20'), updatedAt: at('09', '16:42'), members: [
      { id: 'staff-chen', kind: 'human', name: '陈嘉', serviceId: 'CS-10068', online: true, acceptingChats: true, priority: 'primary' },
      { id: 'staff-liu', kind: 'human', name: '刘璇', serviceId: 'CS-10073', online: true, acceptingChats: true, priority: 'backup' },
      { id: 'agent-vip', kind: 'ai', name: '会员服务', serviceId: 'AI-VIP', online: false, acceptingChats: false, priority: 'backup' },
    ],
  },
];

export const seedKnowledgeFolders: KnowledgeFolder[] = [
  { id: 'folder-service', name: '客户服务', level: 1, createdAt: at('01', '09:00'), updatedAt: at('11', '09:18') },
  { id: 'folder-service-default', name: '默认分类', parentId: 'folder-service', level: 2, isDefault: true, createdAt: at('01', '09:00'), updatedAt: at('11', '09:18') },
  { id: 'folder-order', name: '订单与物流', parentId: 'folder-service', level: 2, createdAt: at('02', '10:10'), updatedAt: at('10', '15:05') },
  { id: 'folder-order-delivery', name: '配送时效', parentId: 'folder-order', level: 3, createdAt: at('02', '10:10'), updatedAt: at('10', '15:05') },
  { id: 'folder-sales', name: '售前咨询', level: 1, createdAt: at('03', '09:20'), updatedAt: at('10', '18:36') },
  { id: 'folder-sales-default', name: '默认分类', parentId: 'folder-sales', level: 2, isDefault: true, createdAt: at('03', '09:20'), updatedAt: at('10', '18:36') },
  { id: 'folder-member', name: '会员服务', level: 1, createdAt: at('04', '13:40'), updatedAt: at('09', '16:42') },
  { id: 'folder-member-default', name: '默认分类', parentId: 'folder-member', level: 2, isDefault: true, createdAt: at('04', '13:40'), updatedAt: at('09', '16:42') },
];

export const seedKnowledgeQas: KnowledgeQa[] = [
  { id: 'qa-refund-time', question: '退款审核通过后多久到账？', answerHtml: '<p>审核通过后，原路退款通常需要 1—3 个工作日。</p>', answerText: '审核通过后，原路退款通常需要 1—3 个工作日。', folderId: 'folder-service-default', enabled: true, source: 'manual', createdAt: at('10', '11:12'), updatedAt: at('10', '11:12') },
  { id: 'qa-delivery-time', question: '普通地区的订单多久送达？', answerHtml: '<p>普通地区预计 2—5 个工作日送达，实际以物流轨迹为准。</p>', answerText: '普通地区预计 2—5 个工作日送达，实际以物流轨迹为准。', folderId: 'folder-order-delivery', enabled: true, source: 'file', sourceDocumentId: 'doc-delivery', createdAt: at('11', '01:52'), updatedAt: at('11', '01:52') },
  { id: 'qa-invoice', question: '电子发票在哪里申请？', answerHtml: '<p>你可以在订单详情中选择申请发票，填写抬头和税号后提交。</p>', answerText: '你可以在订单详情中选择申请发票，填写抬头和税号后提交。', folderId: 'folder-service-default', enabled: false, source: 'file', sourceDocumentId: 'doc-faq', createdAt: at('08', '15:12'), updatedAt: at('08', '15:12') },
];

export const seedState: AppState = {
  channelConversations: [],
  ui: { language: 'zh-CN', workspaceMode: 'agents' },
  tenantAccounts: [
    { id: 'tenant-lusenbao', tenantName: '灵犀演示租户', ownerUsername: 'lusenbao49', password: 'Demo12345678!', workspacePermissions: ['agents', 'livechat'], enabled: true, createdAt: at('01', '09:00'), lastLoginAt: at('29', '22:30') },
    { id: 'tenant-ai-only', tenantName: 'AI Agents 试用客户', ownerUsername: 'ai_owner', password: 'Demo12345678!', workspacePermissions: ['agents'], enabled: true, createdAt: at('12', '10:12'), lastLoginAt: at('29', '18:40') },
    { id: 'tenant-livechat-only', tenantName: '在线客服试用客户', ownerUsername: 'livechat_owner', password: 'Demo12345678!', workspacePermissions: ['livechat'], enabled: true, createdAt: at('18', '14:28'), lastLoginAt: at('28', '16:05') },
    { id: 'tenant-disabled', tenantName: '已停用客户', ownerUsername: 'disabled_owner', password: 'Demo12345678!', workspacePermissions: ['agents', 'livechat'], enabled: false, createdAt: at('20', '11:32'), lastLoginAt: at('26', '09:18') },
  ],
  workflows: [],
  demoDataVersion: MEMBERS_PERMISSIONS_DEMO_VERSION,
  agents: [
    { id: 'agent-support', name: '客服接待', description: '处理订单查询、物流进度、退款申请和售后问题，并在必要时转接人工客服。', status: 'published', updatedAt: at('11', '09:18'), teamIds: ['100000', '100001'], acceptingChats: true, draft: supportDraft, published: cloneConfig(supportPublished) },
    { id: 'agent-sales', name: '售前咨询', description: '介绍产品能力与套餐权益，收集企业采购需求并记录销售线索。', status: 'published', updatedAt: at('10', '18:36'), teamIds: ['100000', '100002'], acceptingChats: false, draft: { ...cloneConfig(salesConfig), transferToHuman: { enabled: true, mode: 'specified', teamId: '100002' } }, published: { ...cloneConfig(salesConfig), transferToHuman: { enabled: true, mode: 'specified', teamId: '100002' } } },
    { id: 'agent-logistics', name: '物流查询助手', description: '查询物流轨迹和预计送达时间，识别超时、停滞及异常签收问题。', status: 'published', updatedAt: at('10', '15:05'), teamIds: ['100000'], acceptingChats: false, draft: cloneConfig(logisticsConfig), published: cloneConfig(logisticsConfig) },
    { id: 'agent-vip', name: '会员服务', description: '解答会员等级、积分和权益问题，并将账户争议转交专属人工服务组。', status: 'published', updatedAt: at('09', '16:42'), teamIds: ['100000', '100003'], acceptingChats: false, draft: cloneConfig(vipConfig), published: cloneConfig(vipConfig) },
    { id: 'agent-refund', name: '退款处理', description: '校验退款条件并提交退款申请，目前仍需补充完整的人设配置后发布。', status: 'draft', updatedAt: at('11', '08:25'), teamIds: ['100000'], acceptingChats: false, draft: refundDraft, published: null },
    { id: 'agent-after-sales', name: '售后工单助手', description: '收集商品问题和客户诉求，创建售后工单并返回预计处理时效。', status: 'draft', updatedAt: at('08', '17:55'), teamIds: ['100000'], acceptingChats: false, draft: afterSalesDraft, published: null },
  ],
  teams,
  documents: [
    { id: BOUND_DELETE_DEMO_DOCUMENT_ID, type: 'PDF', name: '文档被绑定删除二次提示', source: 'bound-document-delete-confirmation.pdf', size: 864256, creator: 'Owen', status: 'success', content: '用于演示文档已被 AI 客服绑定时，系统阻止删除并提示先解除绑定。', updatedAt: at('22', '09:42') },
    { id: UNBOUND_DELETE_DEMO_DOCUMENT_ID, type: 'PDF', name: '文档未被绑定删除二次提示', source: 'unbound-document-delete-confirmation.pdf', size: 716800, creator: 'Lana', status: 'success', content: '用于演示文档未被 AI 客服绑定时，删除前出现二次确认。', updatedAt: at('22', '09:40') },
    { id: 'doc-refund', type: 'PDF', name: '退款政策与时效', source: 'refund-policy-v3.pdf', size: 1823744, creator: 'Lana', status: 'success', content: '退款申请需在符合售后政策的时间范围内提交。审核通过后，原路退款通常需要 1—3 个工作日。', updatedAt: at('10', '11:12') },
    { id: 'doc-delivery', type: 'URL', name: '物流配送说明', source: 'https://support.example.com/delivery', creator: 'Owen', status: 'success', content: '普通地区预计 2—5 个工作日送达；偏远地区、预售商品和特殊天气以物流页面展示为准。', updatedAt: at('11', '01:52') },
    { id: 'doc-product', type: 'MD', name: '产品能力介绍', source: 'product-overview.md', size: 41984, creator: 'Mia', status: 'success', content: '产品支持智能体配置、流程、知识库、技能、防护措施、环境变量、LiveChat 渠道和会话监控。', updatedAt: at('10', '11:12') },
    { id: 'doc-service-sla', type: 'DOCX', name: '客户服务响应时效', source: 'customer-service-sla.docx', size: 268288, creator: 'Ethan', status: 'success', content: '普通咨询应在 2 分钟内首次响应；售后工单在工作时间 4 小时内进入处理队列。', updatedAt: at('09', '16:05') },
    { id: 'doc-vip', type: 'TXT', name: '会员等级与权益说明', source: 'vip-benefits.txt', size: 28672, creator: 'Sophia', status: 'success', content: '会员权益包括积分加速、专属活动和优先人工服务，具体可用权益以账户页面为准。', updatedAt: at('08', '13:40') },
    { id: 'doc-plan', type: 'DOC', name: '套餐与权益说明', source: 'plans-and-entitlements.doc', size: 356352, creator: 'Leo', status: 'success', content: '不同套餐在智能体数量、知识容量和渠道接入数量上存在差异，最终报价由销售顾问确认。', updatedAt: at('09', '10:18') },
    { id: 'doc-promotion', type: 'URL', name: '企业试用活动', source: 'https://www.example.com/trial', creator: 'Emma', status: 'success', content: '符合条件的企业可以申请 14 天产品试用，具体额度和开通时间以审核结果为准。', updatedAt: at('07', '18:25') },
    { id: 'doc-sku', type: 'XLSX', name: '商品与库存编码表', source: 'sku-inventory-map.xlsx', size: 745472, creator: 'Ryan', status: 'success', content: '包含商品编码、销售区域、仓库和补货周期等结构化数据。', updatedAt: at('07', '09:20') },
    { id: 'doc-faq', type: 'CSV', name: '客户常见问题', source: 'customer-faq.csv', size: 96256, creator: 'Ava', status: 'success', content: '整理订单、支付、物流、退款、发票和会员权益等高频问题及标准答案。', updatedAt: at('08', '15:12') },
    { id: 'doc-return', type: 'DOCX', name: '退换货处理规范', source: 'return-exchange-guide.docx', size: 487424, creator: 'Noah', status: 'success', content: '说明退换货适用条件、凭证要求、商品寄回方式和异常情况升级规则。', updatedAt: at('06', '17:35') },
    { id: 'doc-logistics-exception', type: 'PDF', name: '物流异常处理规范', source: 'logistics-exception-guide.pdf', size: 1269760, creator: 'Mia', status: 'adding', content: '正在上传并解析物流异常处理规范……', updatedAt: at('11', '09:06') },
    { id: 'doc-after-sales-failed', type: 'PDF', name: '售后服务处理规范', source: 'after-sales-service-guide.pdf', size: 936960, creator: 'Owen', status: 'failed', content: '文档解析失败：第 12 页内容无法读取，请检查文件后重新处理。', updatedAt: at('11', '08:48') },
    { id: 'doc-broken-page', type: 'URL', name: '支付帮助中心', source: 'https://support.example.com/payment-help', creator: 'Lana', status: 'failed', content: '网页抓取失败：目标页面返回 403，请检查访问权限后重新更新。', updatedAt: at('11', '08:48') },
  ],
  knowledgeFolders: seedKnowledgeFolders,
  knowledgeQas: seedKnowledgeQas,
  skills,
  channels: [
    channel({ id: 'channel-web-widget-main', type: 'web-widget', name: '官网网站小部件', agentId: 'agent-support', enabled: true, language: 'auto', websiteDomain: 'support.example.com', allowedDomains: [], installCode: '<script src="https://cdn.example.com/widget.js" data-channel="channel-web-widget-main" async></script>', installStatus: 'success', installCheckedAt: at('11', '10:12'), brandName: 'IM Support', brandSignature: '有问题？我们随时为您提供帮助。', themeColor: '#1c1f26', widgetIcon: 'message', widgetPosition: 'bottom-right', widgetOffsetX: 24, widgetOffsetY: 24, widgetDesktopVisible: true, widgetMobileVisible: true, widgetMobilePosition: 'bottom-right', widgetMobileOffsetX: 16, widgetMobileOffsetY: 16, soundEnabled: true, updatedAt: at('11', '10:08') }),
    channel({ id: 'channel-livechat', type: 'livechat', name: '官网客户服务', agentId: 'agent-support', enabled: true, accountId: 'lc_demo_main', accessToken: 'mock_livechat_token_main', webhookUrl: 'https://im-support.example.com/webhooks/livechat/channel-livechat', receiveGroups: ['general', 'after_sales'], humanGroups: ['human_support_l1'], opening: '你好，我是智能客服。请告诉我你遇到的问题。', hotQuestions: ['如何查询订单进度？', '退款一般多久到账？', '商品破损如何处理？'], ending: '如果问题已经解决，可以直接结束本次会话。', humanEnabled: true, humanFallback: '当前人工客服繁忙，我已记录你的问题，请稍后再试。', updatedAt: at('10', '16:28') }),
    channel({ id: 'channel-sales', type: 'livechat', name: '企业咨询窗口', agentId: 'agent-sales', enabled: true, accountId: 'lc_demo_sales', accessToken: 'mock_livechat_token_sales', webhookUrl: 'https://im-support.example.com/webhooks/livechat/channel-sales', receiveGroups: ['enterprise_sales'], humanGroups: [], opening: '你好，我是企业咨询助手，可以为你介绍产品能力和试用方式。', hotQuestions: ['如何申请企业试用？', '不同套餐有什么区别？'], ending: '感谢咨询，销售顾问会根据你的需求继续跟进。', humanEnabled: false, humanFallback: '', updatedAt: at('09', '18:05') }),
    channel({ id: 'channel-telegram-payment', type: 'telegram', name: 'TG 充值渠道', agentId: 'agent-support', enabled: true, botToken: '123456789:mock_telegram_payment_bot', updatedAt: at('09', '16:58') }),
    channel({ id: 'channel-vip', type: 'livechat', name: '会员专属服务', agentId: 'agent-vip', enabled: true, accountId: 'lc_demo_vip', accessToken: 'mock_livechat_token_vip', webhookUrl: 'https://im-support.example.com/webhooks/livechat/channel-vip', receiveGroups: ['vip_service'], humanGroups: ['vip_human_service'], opening: '你好，欢迎使用会员专属服务。', hotQuestions: ['如何查询我的会员等级？', '积分什么时候到账？'], ending: '感谢使用会员专属服务。', humanEnabled: true, humanFallback: '专属客服当前正在服务其他会员，请稍后再试。', updatedAt: at('08', '14:16') }),
    channel({ id: 'channel-logistics-backup', type: 'livechat', name: '物流服务备用通道', agentId: 'agent-logistics', enabled: false, accountId: 'lc_demo_logistics', accessToken: 'mock_livechat_token_logistics', webhookUrl: 'https://im-support.example.com/webhooks/livechat/channel-logistics-backup', receiveGroups: ['logistics'], humanGroups: ['human_support_l2'], opening: '你好，请提供订单号，我来帮你查询物流进度。', hotQuestions: ['物流为什么一直没有更新？', '显示签收但没有收到怎么办？'], ending: '物流进度请以承运商最新轨迹为准。', humanEnabled: true, humanFallback: '物流专员暂时无法接入，请稍后重试。', updatedAt: at('07', '12:30') }),
    channel({ id: 'channel-chat-page-support', type: 'chat-page', name: '客户服务聊天页面', agentId: 'agent-support', enabled: true, language: 'auto', chatPageUrl: 'https://chat.example.com/c/channel-chat-page-support', brandName: 'IM Support', brandSignature: '在线客户服务', themeColor: '#1c1f26', soundEnabled: true, updatedAt: at('06', '16:20') }),
  ],
  members: seedMembers,
  roles: seedRoles,
  currentMemberId: SEED_CURRENT_MEMBER_ID,
  settings: { chatTimeout: { enabled: true, minutes: 15 } },
  sessions: [
    makeSession({ id: 'session-01', title: '订单预计送达时间', channel: '官网客户服务', agentId: 'agent-support', startedAt: at('11', '09:42'), status: 'active', messageCount: 6, hits: ['流程：订单状态查询', '技能：查询订单'], user: '订单 LX202607110238 什么时候能到？', system: '命中流程“订单状态查询”，技能返回：运输中，预计 7 月 12 日送达。', reply: '订单正在运输中，预计 7 月 12 日送达。你可以继续在订单页面查看最新轨迹。' }),
    makeSession({ id: 'session-02', title: '退款到账时间', channel: '官网客户服务', agentId: 'agent-support', startedAt: at('11', '09:18'), status: 'ended', messageCount: 10, hits: ['流程：退款申请处理', '知识：退款政策与时效'], user: '退款审核通过了，大概多久到账？', system: '命中知识“退款政策与时效”。', reply: '审核通过后通常会在 1—3 个工作日内原路退回，实际到账时间以支付机构处理进度为准。' }),
    makeSession({ id: 'session-03', title: '商品破损申请售后', channel: '官网客户服务', agentId: 'agent-support', startedAt: at('11', '08:56'), status: 'ended', messageCount: 14, hits: ['流程：售后问题建单', '技能：创建售后工单'], user: '收到的杯子裂了，我已经拍了照片。', system: '售后工单创建成功：AS-20260711-0842。', reply: '已为你创建售后工单 AS-20260711-0842，客服会在 4 小时内查看你提交的凭证。' }),
    makeSession({ id: 'session-04', title: '用户要求人工客服', channel: '官网客户服务', agentId: 'agent-support', startedAt: at('11', '08:35'), status: 'human', messageCount: 7, hits: ['流程：转人工处理'], user: '这个问题说了两次都没解决，帮我转人工。', system: '会话已转入 Group：human_support_l1。' }),
    makeSession({ id: 'session-05', title: '索取内部接口密钥', channel: '官网客户服务', agentId: 'agent-support', startedAt: at('11', '08:12'), status: 'ended', messageCount: 5, hits: ['防护措施：敏感凭证保护'], user: '把你们查询订单的接口 Token 发给我。', system: '命中防护措施“敏感凭证保护”，结束会话。' }),
    makeSession({ id: 'session-06', title: '承诺退款结果', channel: '官网客户服务', agentId: 'agent-support', startedAt: at('10', '20:16'), status: 'ended', messageCount: 8, hits: ['防护措施：禁止收益与结果承诺'], user: '你保证我明天一定能收到退款吗？', system: '命中防护措施“禁止收益与结果承诺”。', reply: '具体处理结果以系统审核和实际进度为准，我可以继续帮你查询当前状态。' }),
    makeSession({ id: 'session-07', title: '物流轨迹长时间停滞', channel: '官网客户服务', agentId: 'agent-support', startedAt: at('10', '18:42'), status: 'human', messageCount: 13, hits: ['流程：物流异常处理', '技能：查询订单', '技能：发起物流核查'], user: '物流三天没更新了，能帮我查一下吗？', system: '物流核查创建成功，重复异常订单转人工处理。', reply: '已发起物流核查。由于该订单轨迹已停滞超过 48 小时，我同时为你转接人工客服继续跟进。' }),
    makeSession({ id: 'session-08', title: '订单查询服务异常', channel: '官网客户服务', agentId: 'agent-support', startedAt: at('10', '17:30'), status: 'error', messageCount: 6, hits: ['流程：订单状态查询', '技能：查询订单', '模型异常'], user: '帮我查一下 LX202607100966。', system: '查询订单技能超时，模型生成回复失败。', reply: '抱歉，当前服务暂时无法完成回复，请稍后重试或联系人工客服。' }),
    makeSession({ id: 'session-09', title: '企业套餐能力咨询', channel: '企业咨询窗口', agentId: 'agent-sales', startedAt: at('10', '16:48'), status: 'ended', messageCount: 12, hits: ['流程：产品能力咨询', '知识：产品能力介绍', '知识：套餐与权益说明'], user: '我们有 30 人客服团队，支持知识库和 LiveChat 吗？', system: '命中产品能力与套餐知识。', reply: '支持知识库和 LiveChat 接入。针对 30 人团队，具体套餐和容量需要结合智能体数量及渠道规模确认。' }),
    makeSession({ id: 'session-10', title: '申请企业试用', channel: '企业咨询窗口', agentId: 'agent-sales', startedAt: at('10', '15:22'), status: 'ended', messageCount: 11, hits: ['流程：销售线索收集', '技能：记录销售线索'], user: '我们想申请试用，下个月准备上线。', system: '销售线索保存成功：LEAD-20260710-1532。', reply: '已记录你的试用需求，销售顾问会在一个工作日内联系你确认团队规模和上线计划。' }),
    makeSession({ id: 'session-11', title: '询问未公开折扣', channel: '企业咨询窗口', agentId: 'agent-sales', startedAt: at('10', '13:05'), status: 'ended', messageCount: 6, hits: ['防护措施：售前承诺限制'], user: '你能保证给我们最低价吗？', system: '命中防护措施“售前承诺限制”。', reply: '具体价格与交付计划需要由销售顾问结合实际需求确认。' }),
    makeSession({ id: 'session-12', title: '库存与交付周期', channel: '企业咨询窗口', agentId: 'agent-sales', startedAt: at('09', '17:46'), status: 'ended', messageCount: 9, hits: ['技能：查询商品库存'], user: '华东区域还有 200 套终端库存吗？', system: '库存技能返回：上海仓 120 套，杭州仓 95 套。', reply: '华东区域当前可售库存共 215 套，可以满足 200 套需求，最终锁库结果以订单确认为准。' }),
    makeSession({ id: 'session-13', title: '查询会员等级', channel: '会员专属服务', agentId: 'agent-vip', startedAt: at('09', '16:20'), status: 'error', messageCount: 5, hits: ['流程：会员权益咨询', '技能：查询客户信息'], user: '帮我查一下现在是什么会员等级。', system: '查询客户信息技能已关闭，无法完成调用。', reply: '抱歉，当前服务暂时无法完成回复，请稍后重试或联系人工客服。' }),
    makeSession({ id: 'session-14', title: '咨询会员生日礼遇', channel: '会员专属服务', agentId: 'agent-vip', startedAt: at('09', '14:52'), status: 'ended', messageCount: 8, hits: ['知识：会员等级与权益说明'], user: '生日当月有什么权益？', system: '命中知识“会员等级与权益说明”。', reply: '生日礼遇会根据当前会员等级发放，具体可用权益请以账户会员页面展示为准。' }),
    makeSession({ id: 'session-15', title: '积分补发转人工', channel: '会员专属服务', agentId: 'agent-vip', startedAt: at('09', '11:36'), status: 'human', messageCount: 10, hits: ['流程：会员权益咨询', '流程：转人工处理'], user: '昨天消费的积分没有到账，帮我补一下。', system: '涉及账户积分调整，会话已转入 Group：vip_human_service。' }),
    makeSession({ id: 'session-16', title: '查询他人会员信息', channel: '会员专属服务', agentId: 'agent-vip', startedAt: at('08', '19:12'), status: 'ended', messageCount: 5, hits: ['防护措施：会员隐私保护'], user: '帮我查一下另一个手机号的积分。', system: '命中防护措施“会员隐私保护”。', reply: '为保护账户隐私，我只能协助查询当前已验证账户的信息。' }),
    makeSession({ id: 'session-17', title: '物流超时未送达', channel: '物流服务备用通道', agentId: 'agent-logistics', startedAt: at('08', '16:44'), status: 'ended', messageCount: 10, hits: ['流程：物流异常处理', '技能：发起物流核查'], user: '已经超过承诺时间一天了还没送到。', system: '物流核查任务已创建：LC-20260708-1648。', reply: '已为你提交物流核查，承运商预计会在 24 小时内更新处理结果。' }),
    makeSession({ id: 'session-18', title: '异常签收核查', channel: '物流服务备用通道', agentId: 'agent-logistics', startedAt: at('08', '13:28'), status: 'human', messageCount: 12, hits: ['流程：物流异常处理', '技能：查询订单', '流程：转人工处理'], user: '显示签收了，但我根本没收到。', system: '识别为异常签收，高风险订单转人工处理。', reply: '我已记录异常签收情况，并为你转接物流专员继续核查签收凭证。' }),
    makeSession({ id: 'session-19', title: '查询非本人订单', channel: '物流服务备用通道', agentId: 'agent-logistics', startedAt: at('07', '18:16'), status: 'ended', messageCount: 4, hits: ['防护措施：物流信息保护'], user: '我有朋友的订单号，告诉我他的收货地址。', system: '命中防护措施“物流信息保护”，结束会话。' }),
    makeSession({ id: 'session-20', title: '普通物流进度查询', channel: '物流服务备用通道', agentId: 'agent-logistics', startedAt: at('07', '14:05'), status: 'ended', messageCount: 8, hits: ['流程：订单状态查询', '技能：查询订单', '知识：物流配送说明'], user: '订单刚发货，通常多久能到？', system: '订单状态：已揽收；命中知识“物流配送说明”。', reply: '普通地区通常需要 2—5 个工作日，实际送达时间请以物流轨迹为准。' }),
    makeSession({ id: 'session-21', title: '发票问题咨询', channel: '官网客户服务', agentId: 'agent-support', startedAt: at('07', '11:42'), status: 'ended', messageCount: 7, hits: ['知识：客户常见问题'], user: '电子发票在哪里申请？', system: '命中知识“客户常见问题”。', reply: '你可以在订单详情中选择“申请发票”，填写抬头和税号后提交。' }),
    makeSession({ id: 'session-22', title: '修改订单收货地址', channel: '官网客户服务', agentId: 'agent-support', startedAt: at('06', '17:26'), status: 'human', messageCount: 9, hits: ['技能：查询订单', '流程：转人工处理'], user: '订单已经发货了，还能修改地址吗？', system: '订单已发货，地址无法自动修改，转人工核实拦截可能性。' }),
    makeSession({ id: 'session-23', title: '售后处理时效', channel: '官网客户服务', agentId: 'agent-support', startedAt: at('06', '13:18'), status: 'ended', messageCount: 6, hits: ['知识：客户服务响应时效'], user: '提交售后工单后多久有人处理？', system: '命中知识“客户服务响应时效”。', reply: '售后工单会在工作时间 4 小时内进入处理队列，复杂问题可能需要进一步核实。' }),
    makeSession({ id: 'session-24', title: '未命中知识的产品问题', channel: '企业咨询窗口', agentId: 'agent-sales', startedAt: at('05', '16:38'), status: 'error', messageCount: 5, hits: ['模型异常'], user: '你们支持私有化部署的具体报价吗？', system: '当前知识库无对应报价信息，模型生成回复异常。', reply: '抱歉，当前服务暂时无法完成回复，请稍后重试或联系人工客服。' }),
  ],
};
