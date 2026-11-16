import type { ReactNode, Ref } from 'react';
import { IconRobot } from '@arco-design/web-react/icon';
import { ChannelTypeIcon } from './ChannelTypeIcon';
import type { InboxChannelType } from '../types';

/** 收件箱与总览弹窗共用的展示结构，类名统一沿用 inbox-*，避免两处再次漂移 */
const initials = (value: string) => (value.startsWith('Visitor') ? '访' : value.slice(0, 1).toUpperCase());

const avatarTone = (value: string) => `tone-${Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6}`;

export type ConversationBadge = { label: string; className: string };

export type ConversationRowProps = {
  customerName: string;
  time: string;
  preview: string;
  channelType: InboxChannelType;
  channelName: string;
  agentName: string;
  active?: boolean;
  badge?: ConversationBadge;
  onSelect: () => void;
  rowRef?: Ref<HTMLButtonElement>;
};

/** 会话列表项：头像 + 客户名/时间 + 最新消息（可带处理结果标签）+ 渠道/客服 */
export function ConversationRow({
  customerName,
  time,
  preview,
  channelType,
  channelName,
  agentName,
  active = false,
  badge,
  onSelect,
  rowRef,
}: ConversationRowProps) {
  return <button
    type="button"
    ref={rowRef}
    className={`inbox-conversation-item ${active ? 'is-active' : ''}`}
    onClick={onSelect}
  >
    <span className={`inbox-customer-avatar ${avatarTone(customerName)}`}>{initials(customerName)}</span>
    <span className="inbox-conversation-copy">
      <span className="inbox-conversation-topline"><strong>{customerName}</strong><time>{time}</time></span>
      <span className="inbox-conversation-preview">
        <span className="inbox-latest-message">{preview}</span>
        {badge && <span className={`overview-records-badge ${badge.className}`}>{badge.label}</span>}
      </span>
      <span className="inbox-conversation-meta">
        <span><ChannelTypeIcon type={channelType} className="inbox-channel-logo" />{channelName}</span>
        <span><IconRobot />{agentName}</span>
      </span>
    </span>
  </button>;
}

export type ChatMessageLike = {
  id: string;
  role: 'customer' | 'agent' | 'system';
  content: string;
  type?: string;
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
};

export type ChatMessageRowProps = {
  message: ChatMessageLike;
  customerName: string;
  agentName: string;
  time: string;
  /** 客服侧头像节点由调用方决定：收件箱用当前客服，弹窗用会话 Agent */
  agentAvatar: ReactNode;
  /** 消息体由调用方决定：收件箱支持图片预览/音视频/文件，弹窗只读 */
  renderBody?: (message: ChatMessageLike) => ReactNode;
};

/** 消息行：系统消息居中；客户左侧带字母头像；客服右侧带 Agent 头像 */
export function ChatMessageRow({ message, customerName, agentName, time, agentAvatar, renderBody }: ChatMessageRowProps) {
  if (message.role === 'system') {
    return <div className="inbox-system-message"><span>{message.content} · {time}</span></div>;
  }
  return <div className={`inbox-message-row is-${message.role}`}>
    {message.role === 'customer' && <span className={`inbox-customer-avatar is-message ${avatarTone(customerName)}`}>{initials(customerName)}</span>}
    <div className="inbox-message-content">
      <span className="inbox-message-author">{message.role === 'agent' ? agentName : customerName}</span>
      {renderBody ? renderBody(message) : <div className="inbox-message-bubble">{message.content}</div>}
      <time>{time}</time>
    </div>
    {message.role === 'agent' && agentAvatar}
  </div>;
}
