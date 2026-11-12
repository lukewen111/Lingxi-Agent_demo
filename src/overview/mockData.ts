import type { OverviewSession } from './analytics';

const DAY_MS = 24 * 60 * 60 * 1000;

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

const buildSessions = (): OverviewSession[] => {
  const random = mulberry32(20261112);
  const today = startOfDay(new Date());
  const now = new Date();
  const sessions: OverviewSession[] = [];
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
    sequence += 1;
    sessions.push({
      id: `overview-session-${sequence}`,
      createdAt: createdAt.toISOString(),
      agentId,
      channelId,
      ended,
      aiResolved: false,
      transferred: false,
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

  // 按天定额：先定转人工（与结束状态无关），再从“已结束且未转人工”中定额判定 AI 解决
  const groups = new Map<string, OverviewSession[]>();
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
    const transferCount = Math.round(dayProfile.transfer * list.length);
    list
      .map((session) => ({ session, order: -Math.log(1 - random()) / transferWeightOf(session) }))
      .sort((a, b) => a.order - b.order)
      .slice(0, transferCount)
      .forEach(({ session }) => { session.transferred = true; });

    const eligible = list.filter((session) => session.ended && !session.transferred);
    const resolveCount = Math.round(dayProfile.resolve * eligible.length);
    eligible
      .map((session) => ({ session, order: -Math.log(1 - random()) / resolveWeightOf(session) }))
      .sort((a, b) => a.order - b.order)
      .slice(0, resolveCount)
      .forEach(({ session }) => { session.aiResolved = true; });
  });

  return sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

export const OVERVIEW_SESSIONS: OverviewSession[] = buildSessions();
