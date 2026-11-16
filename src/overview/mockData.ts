import type { OverviewSession, SessionOutcome } from './analytics';
import mockPaymentReceiptUrl from '../assets/mock-payment-receipt.png';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 访客池：同一访客可产生多次会话，用于弹窗内的历史会话浏览 */
const VISITORS = Array.from({ length: 16 }, (_, index) => ({
  id: `overview-visitor-${String(index + 1).padStart(2, '0')}`,
  name: `Visitor #${102400 + index * 137}`,
}));

type AgentProfile = {
  id: string;
  weight: number;
  endedRate: number;
  transferRate: number;
  resolveRate: number;
  channels: [string, number][];
  deleted?: boolean;
};

const LIVE_CHANNELS = [
  'channel-web-widget-main',
  'channel-livechat',
  'channel-sales',
  'channel-telegram-payment',
  'channel-vip',
  'channel-logistics-backup',
  'channel-chat-page-support',
];

const DELETED_CHANNELS = ['channel-legacy-wechat', 'channel-legacy-form'];

const CHANNEL_TRAITS: Record<string, { transfer: number; resolve: number }> = {
  'channel-livechat': { transfer: 0.02, resolve: 0.01 },
  'channel-web-widget-main': { transfer: 0, resolve: 0.03 },
  'channel-sales': { transfer: 0.06, resolve: -0.1 },
  'channel-telegram-payment': { transfer: -0.02, resolve: -0.04 },
  'channel-vip': { transfer: -0.03, resolve: 0.06 },
  'channel-logistics-backup': { transfer: 0.03, resolve: -0.02 },
  'channel-chat-page-support': { transfer: -0.01, resolve: 0.04 },
  'channel-legacy-wechat': { transfer: 0.04, resolve: -0.06 },
  'channel-legacy-form': { transfer: 0.01, resolve: -0.03 },
};

const AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'agent-support',
    weight: 32,
    endedRate: 0.94,
    transferRate: 0.13,
    resolveRate: 0.84,
    channels: [
      ['channel-livechat', 0.24],
      ['channel-web-widget-main', 0.22],
      ['channel-telegram-payment', 0.14],
      ['channel-sales', 0.1],
      ['channel-chat-page-support', 0.12],
      ['channel-vip', 0.1],
      ['channel-logistics-backup', 0.08],
    ],
  },
  {
    id: 'agent-sales',
    weight: 24,
    endedRate: 0.88,
    transferRate: 0.22,
    resolveRate: 0.63,
    channels: [
      ['channel-sales', 0.32],
      ['channel-livechat', 0.16],
      ['channel-web-widget-main', 0.14],
      ['channel-chat-page-support', 0.12],
      ['channel-telegram-payment', 0.1],
      ['channel-vip', 0.1],
      ['channel-logistics-backup', 0.06],
    ],
  },
  {
    id: 'agent-logistics',
    weight: 18,
    endedRate: 0.95,
    transferRate: 0.09,
    resolveRate: 0.78,
    channels: [
      ['channel-logistics-backup', 0.24],
      ['channel-telegram-payment', 0.22],
      ['channel-livechat', 0.18],
      ['channel-web-widget-main', 0.14],
      ['channel-chat-page-support', 0.1],
      ['channel-sales', 0.06],
      ['channel-vip', 0.06],
    ],
  },
  {
    id: 'agent-vip',
    weight: 12,
    endedRate: 0.97,
    transferRate: 0.06,
    resolveRate: 0.9,
    channels: [
      ['channel-vip', 0.4],
      ['channel-livechat', 0.14],
      ['channel-web-widget-main', 0.12],
      ['channel-chat-page-support', 0.12],
      ['channel-telegram-payment', 0.1],
      ['channel-sales', 0.06],
      ['channel-logistics-backup', 0.06],
    ],
  },
  {
    id: 'agent-refund',
    weight: 8,
    endedRate: 0.86,
    transferRate: 0.28,
    resolveRate: 0.55,
    channels: [
      ['channel-chat-page-support', 0.22],
      ['channel-livechat', 0.2],
      ['channel-web-widget-main', 0.18],
      ['channel-telegram-payment', 0.16],
      ['channel-logistics-backup', 0.08],
      ['channel-sales', 0.08],
      ['channel-vip', 0.08],
    ],
  },
  {
    id: 'agent-after-sales',
    weight: 6,
    endedRate: 0.9,
    transferRate: 0.17,
    resolveRate: 0.7,
    channels: [
      ['channel-logistics-backup', 0.2],
      ['channel-chat-page-support', 0.18],
      ['channel-livechat', 0.18],
      ['channel-web-widget-main', 0.16],
      ['channel-telegram-payment', 0.12],
      ['channel-sales', 0.08],
      ['channel-vip', 0.08],
    ],
  },
  {
    id: 'agent-legacy-billing',
    weight: 5,
    endedRate: 0.9,
    transferRate: 0.2,
    resolveRate: 0.5,
    deleted: true,
    channels: [],
  },
  {
    id: 'agent-legacy-onboarding',
    weight: 4,
    endedRate: 0.88,
    transferRate: 0.14,
    resolveRate: 0.62,
    deleted: true,
    channels: [],
  },
];

/** 总览会话在统计字段之外补充会话记录弹窗需要的展示信息 */
export type OverviewSessionRecord = OverviewSession & {
  updatedAt: string;
  visitorId: string;
  customerName: string;
};

const mulberry32 = (seed: number) => {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (random: () => number, options: [string, number][]) => {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = random() * total;
  for (const [value, weight] of options) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  return options[options.length - 1][0];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const buildSessions = (): OverviewSessionRecord[] => {
  const random = mulberry32(20261112);
  const today = startOfDay(new Date());
  const now = new Date();
  const sessions: OverviewSessionRecord[] = [];
  let sequence = 0;

  const profileMap = new Map(AGENT_PROFILES.map((profile) => [profile.id, profile]));
  const liveProfiles = AGENT_PROFILES.filter((profile) => !profile.deleted);
  const agentWeights: [string, number][] = AGENT_PROFILES.map((profile) => [profile.id, profile.weight]);
  const liveAgentWeights: [string, number][] = liveProfiles.map((profile) => [profile.id, profile.weight]);
  // 每天一条基准解决率/转人工率，制造按天可见的峰谷；落到哪些会话上再按对象倾向加权抽取
  const dayProfiles = Array.from({ length: 180 }, () => ({
    resolve: 0.48 + random() * 0.32,
    transfer: 0.08 + random() * 0.19,
  }));

  const traitOf = (channelId: string) => CHANNEL_TRAITS[channelId] ?? { transfer: 0, resolve: 0 };
  const transferWeightOf = (session: OverviewSession) => clamp((profileMap.get(session.agentId)?.transferRate ?? 0.18) + traitOf(session.channelId).transfer * 0.6, 0.02, 0.6);
  const resolveWeightOf = (session: OverviewSession) => clamp((profileMap.get(session.agentId)?.resolveRate ?? 0.72) + traitOf(session.channelId).resolve * 0.6, 0.2, 1);

  const append = (dayOffset: number, agentId: string, channelId: string, hourOverride?: number) => {
    const profile = profileMap.get(agentId);
    if (!profile) return;
    const day = new Date(today);
    day.setDate(day.getDate() - dayOffset);
    const isToday = dayOffset === 0;
    let hour = hourOverride ?? (7 + Math.floor(random() * 14));
    if (hourOverride === undefined && random() < 0.32) hour = Math.floor(random() * 24);
    let minute = Math.floor(random() * 60);
    if (isToday) {
      if (hourOverride === undefined) hour = Math.floor(random() * (now.getHours() + 1));
      minute = hour === now.getHours() ? Math.floor(random() * (now.getMinutes() + 1)) : Math.floor(random() * 60);
    }
    const createdAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
    if (createdAt.getTime() > now.getTime()) createdAt.setTime(now.getTime() - Math.floor(random() * 3600 * 1000));
    const endedRate = isToday ? profile.endedRate * 0.8 : dayOffset <= 1 ? profile.endedRate * 0.9 : profile.endedRate;
    const ended = random() < endedRate;
    const duration = (ended ? 9 + Math.floor(random() * 26) : 2 + Math.floor(random() * 7)) * 60 * 1000;
    const updatedAt = new Date(Math.min(createdAt.getTime() + duration, now.getTime()));
    sequence += 1;
    const visitor = VISITORS[Math.floor(random() * VISITORS.length)];
    sessions.push({
      id: `overview-session-${sequence}`,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      agentId,
      channelId,
      visitorId: visitor.id,
      customerName: visitor.name,
      ended,
      valid: true,
      outcome: null,
    });
  };

  const isRecent = (session: OverviewSession, days: number) => now.getTime() - new Date(session.createdAt).getTime() <= days * DAY_MS;

  for (let dayOffset = 179; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - dayOffset);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const daily = Math.max(8, 18 + Math.floor(random() * 9) + (weekend ? -2 : 2) + (dayOffset < 30 ? 2 : 0));
    for (let index = 0; index < daily; index += 1) {
      const agentId = pick(random, agentWeights);
      const profile = profileMap.get(agentId)!;
      const channelId = profile.channels.length
        ? pick(random, profile.channels)
        : random() < 0.7
          ? DELETED_CHANNELS[Math.floor(random() * DELETED_CHANNELS.length)]
          : pick(random, profileMap.get('agent-support')!.channels);
      append(dayOffset, agentId, channelId);
    }
  }

  liveProfiles.forEach((profile) => {
    const recent = sessions.filter((session) => session.agentId === profile.id && isRecent(session, 7)).length;
    for (let index = recent; index < 15; index += 1) append(Math.floor(random() * 7), profile.id, pick(random, profile.channels));
  });

  LIVE_CHANNELS.forEach((channelId) => {
    const recent = sessions.filter((session) => session.channelId === channelId && isRecent(session, 7)).length;
    for (let index = recent; index < 16; index += 1) append(Math.floor(random() * 7), pick(random, liveAgentWeights), channelId);
  });

  const isTodaySession = (session: OverviewSession) => new Date(session.createdAt).getTime() >= today.getTime();

  // 今天按小时展示，保证每个已过去的整点都有足够样本，曲线才有起伏而不是断成一串孤点
  for (let hour = 0; hour <= now.getHours(); hour += 1) {
    const count = sessions.filter((session) => isTodaySession(session) && new Date(session.createdAt).getHours() === hour).length;
    for (let index = count; index < 3; index += 1) {
      const agentId = pick(random, liveAgentWeights);
      append(0, agentId, pick(random, profileMap.get(agentId)!.channels), hour);
    }
  }

  liveProfiles.forEach((profile) => {
    const count = sessions.filter((session) => session.agentId === profile.id && isTodaySession(session)).length;
    for (let index = count; index < 2; index += 1) append(0, profile.id, pick(random, profile.channels));
  });

  LIVE_CHANNELS.forEach((channelId) => {
    const count = sessions.filter((session) => session.channelId === channelId && isTodaySession(session)).length;
    for (let index = count; index < 2; index += 1) append(0, pick(random, liveAgentWeights), channelId);
  });

  // 无效会话只出现在已结束会话中（约 10%–15%），且不参与转人工与 AI 解决判定
  sessions.forEach((session) => {
    if (session.ended && random() < 0.12) session.valid = false;
  });

  // 按天定额：先定转人工，再从“已结束、有效且未转人工”中定额判定 AI 解决，剩余为未解决
  const groups = new Map<string, OverviewSessionRecord[]>();
  sessions.forEach((session) => {
    const created = new Date(session.createdAt);
    const key = `${created.getFullYear()}-${created.getMonth()}-${created.getDate()}`;
    const list = groups.get(key);
    if (list) list.push(session);
    else groups.set(key, [session]);
  });

  groups.forEach((list) => {
    const dayOffset = Math.round((today.getTime() - startOfDay(new Date(list[0].createdAt)).getTime()) / DAY_MS);
    const dayProfile = dayProfiles[Math.min(179, Math.max(0, dayOffset))];
    const transferCandidates = list.filter((session) => session.ended && session.valid);
    const transferCount = Math.round(dayProfile.transfer * transferCandidates.length);
    transferCandidates
      .map((session) => ({ session, order: -Math.log(1 - random()) / transferWeightOf(session) }))
      .sort((a, b) => a.order - b.order)
      .slice(0, transferCount)
      .forEach(({ session }) => { session.outcome = 'handoff'; });

    const eligible = list.filter((session) => session.ended && session.valid && session.outcome === null);
    const resolveCount = Math.round(dayProfile.resolve * eligible.length);
    eligible
      .map((session) => ({ session, order: -Math.log(1 - random()) / resolveWeightOf(session) }))
      .sort((a, b) => a.order - b.order)
      .slice(0, resolveCount)
      .forEach(({ session }) => { session.outcome = 'resolved'; });
  });

  sessions.forEach((session) => {
    if (session.ended && session.valid && session.outcome === null) session.outcome = 'unresolved';
    if (!session.ended) session.outcome = null;
    if (!session.valid) session.outcome = null;
  });

  return sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

export const OVERVIEW_SESSIONS: OverviewSessionRecord[] = buildSessions();

const AGENT_TOPICS: Record<string, { question: string; answer: string }> = {
  'agent-support': {
    question: '您好，我的充值订单还没有到账，可以帮我查一下吗？',
    answer: '可以的，请提供订单号，我会核对支付渠道的返回状态和入账记录。',
  },
  'agent-sales': {
    question: '我们团队想接入企业版，想先了解支持哪些能力和开通流程。',
    answer: '企业版支持多 Agent 协作、统一渠道接入和数据看板，我可以先为您介绍开通流程。',
  },
  'agent-logistics': {
    question: '这批订单的物流轨迹一直没有更新，麻烦帮我确认一下。',
    answer: '我已记录订单号，正在向物流渠道查询最新轨迹和预计送达时间。',
  },
  'agent-vip': {
    question: '我的会员权益今天没有更新，想确认一下原因。',
    answer: '我已查到您的会员等级，正在核对今日权益发放记录和生效时间。',
  },
  'agent-refund': {
    question: '这笔订单我想申请退款，需要提供哪些材料？',
    answer: '退款需要订单号和支付凭证，我也可以先帮您确认当前订单是否满足退款条件。',
  },
  'agent-after-sales': {
    question: '我的账户登录不上，提示需要重新验证身份。',
    answer: '我会先核对账户状态和最近登录记录，再引导您完成身份验证。',
  },
};

const DEFAULT_TOPIC = {
  question: '您好，我想咨询一下账户最近的使用情况。',
  answer: '可以的，请提供账户信息，我会帮您核对最近的记录。',
};

export type OverviewChatMessage = {
  id: string;
  role: 'customer' | 'agent' | 'system';
  content: string;
  sentAt: string;
  type?: 'text' | 'image';
  imageUrl?: string;
};

/** 无效会话的三类素材：只打招呼、测试误触、广告无关内容，均无真实业务诉求 */
const INVALID_MATERIALS = [
  { text: '在吗', closing: '会话已关闭\n由于 15 分钟无消息互动' },
  { text: '测试一下', closing: '会话结束' },
  { text: '加个微信，有内部优惠', closing: '会话结束' },
];

const messageCache = new Map<string, OverviewChatMessage[]>();

/** 按处理结果定义生成只读聊天记录，供总览「会话记录」弹窗演示使用 */
export const buildSessionMessages = (session: OverviewSessionRecord): OverviewChatMessage[] => {
  const cached = messageCache.get(session.id);
  if (cached) return cached;

  const start = new Date(session.createdAt).getTime();
  const span = Math.max(new Date(session.updatedAt).getTime() - start, 60 * 1000);
  const at = (ratio: number) => new Date(start + Math.round(span * ratio)).toISOString();
  const topic = AGENT_TOPICS[session.agentId] ?? DEFAULT_TOPIC;
  let index = 1;
  const nextId = () => `${session.id}-message-${index++}`;
  const messages: OverviewChatMessage[] = [
    { id: nextId(), role: 'system', content: '会话开始', sentAt: session.createdAt },
  ];
  const sequence = Number(session.id.split('-').pop());
  const finish = () => {
    messageCache.set(session.id, messages);
    return messages;
  };

  // 会话进行中：只展示已发生的问答，不做结论
  if (!session.ended) {
    messages.push(
      { id: nextId(), role: 'customer', content: topic.question, sentAt: at(0.3) },
      { id: nextId(), role: 'agent', content: topic.answer, sentAt: at(0.6) },
    );
    return finish();
  }

  // 无效：只有打招呼、测试误触或广告，没有真实业务诉求
  if (!session.valid) {
    const material = INVALID_MATERIALS[sequence % INVALID_MATERIALS.length];
    if (sequence % 2 === 0) {
      messages.push({ id: nextId(), role: 'agent', content: '您好，我是 AI 客服，请描述您想咨询的问题。', sentAt: at(0.3) });
    }
    messages.push({ id: nextId(), role: 'customer', content: material.text, sentAt: at(0.55) });
    messages.push({ id: nextId(), role: 'system', content: material.closing, sentAt: session.updatedAt });
    return finish();
  }

  if (session.outcome === 'handoff') {
    messages.push(
      { id: nextId(), role: 'customer', content: topic.question, sentAt: at(0.12) },
      { id: nextId(), role: 'agent', content: topic.answer, sentAt: at(0.32) },
      { id: nextId(), role: 'customer', content: '这个问题比较着急，能帮我转人工处理吗？', sentAt: at(0.55) },
      { id: nextId(), role: 'agent', content: '可以，我已整理好当前问题信息，正在为您转接人工客服。', sentAt: at(0.75) },
      { id: nextId(), role: 'system', content: '已转接给人工客服', sentAt: session.updatedAt },
    );
    return finish();
  }

  if (session.outcome === 'resolved') {
    messages.push(
      { id: nextId(), role: 'customer', content: topic.question, sentAt: at(0.1) },
      { id: nextId(), role: 'agent', content: topic.answer, sentAt: at(0.26) },
    );
    // 部分已解决会话包含客户上传的支付凭证截图，用于演示图片消息（本地资源，不依赖外网）
    if (sequence % 5 === 0) {
      messages.push({
        id: nextId(),
        role: 'customer',
        type: 'image',
        imageUrl: mockPaymentReceiptUrl,
        content: '我上传一下支付凭证截图',
        sentAt: at(0.42),
      });
    }
    messages.push(
      { id: nextId(), role: 'customer', content: '好的，麻烦帮我确认一下具体处理结果。', sentAt: at(0.56) },
      { id: nextId(), role: 'agent', content: '已为您核对并处理完成，处理结果和注意事项已同步到会话中。', sentAt: at(0.72) },
      { id: nextId(), role: 'customer', content: '收到了，谢谢。', sentAt: at(0.86) },
      { id: nextId(), role: 'system', content: '会话结束', sentAt: session.updatedAt },
    );
    return finish();
  }

  messages.push(
    { id: nextId(), role: 'customer', content: topic.question, sentAt: at(0.15) },
    { id: nextId(), role: 'customer', content: '我又核对了一遍，还是没能解决。', sentAt: at(0.38) },
    { id: nextId(), role: 'agent', content: '当前提供的信息不足，暂时无法在线处理，建议您稍后补充订单凭证后再来咨询。', sentAt: at(0.6) },
    { id: nextId(), role: 'customer', content: '好的，我先去核对一下资料，稍后再回来。', sentAt: at(0.82) },
    { id: nextId(), role: 'system', content: '会话结束', sentAt: session.updatedAt },
  );
  return finish();
};

/** 列表摘要与聊天内容同源：取最后一条非系统消息，图片消息带「图片：」前缀 */
export const lastMessagePreview = (session: OverviewSessionRecord): string => {
  const latest = [...buildSessionMessages(session)].reverse().find((message) => message.role !== 'system');
  if (!latest) return '';
  return latest.type === 'image' ? `图片：${latest.content}` : latest.content;
};

export const outcomeOf = (session: OverviewSessionRecord): SessionOutcome => (session.ended && session.valid ? session.outcome : null);
