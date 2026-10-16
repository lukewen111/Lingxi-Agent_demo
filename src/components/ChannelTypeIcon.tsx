import livechatLogo from '../assets/livechat-logo.png';
import type { ChannelType } from '../types';

export function ChannelTypeIcon({ type, className = '' }: { type: ChannelType; className?: string }) {
  if (type === 'telegram') return <span className={`channel-logo-icon channel-logo-telegram ${className}`} aria-label="Telegram"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.8 4.1 18.5 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1L18 6.5c.4-.4-.1-.6-.6-.2L6 13.4l-4.9-1.5c-1.1-.3-1.1-1.1.2-1.6L20.5 3c.9-.3 1.6.2 1.3 1.1Z" /></svg></span>;
  if (type === 'livechat') return <span className={`channel-logo-icon channel-logo-livechat ${className}`} aria-label="Livechat"><img src={livechatLogo} alt="" /></span>;
  if (type === 'web-widget') return <span className={`channel-logo-icon channel-logo-widget ${className}`} aria-label="网站小部件"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3.5 9h17M3.5 15h17M12 3c2.3 2.4 3.5 5.4 3.5 9S14.3 18.6 12 21M12 3C9.7 5.4 8.5 8.4 8.5 12s1.2 6.6 3.5 9" /></svg></span>;
  return <span className={`channel-logo-icon channel-logo-page ${className}`} aria-label="聊天页面"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.5 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M7 9h10M7 13h6" /></svg></span>;
}
