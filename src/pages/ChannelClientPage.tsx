import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { IconClose, IconFile, IconNotification, IconNotificationClose, IconPlus, IconSend } from '@arco-design/web-react/icon';
import { WidgetClientGlyph } from '../components/WidgetClientGlyph';
import { formatAnonymousVisitorName } from '../utils/visitor';
import { useAppStore } from '../store';
import type { Channel, InboxConversation, InboxMessage } from '../types';

const VISITOR_KEY = 'lingxi-channel-visitor';
const MUTE_KEY = 'lingxi-channel-muted';
const READ_KEY = 'lingxi-channel-read';
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.heic,.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,.ppt,.pptx,.mp3,.wav,.m4a,.ogg,.mp4,.mov,.webm';
const ALLOWED_EXTENSIONS = new Set(ACCEPT.split(','));
const EMOJIS = ['😀', '😁', '😂', '😊', '😍', '👍', '👏', '🎉', '🙏', '❤️', '👋', '🤔', '😢', '🔥', '✅', '👀'];

type ClientCopy = {
  welcome: string;
  placeholder: string;
  unavailable: string;
  missingTitle: string;
  missingDescription: string;
};

type ClientUiCopy = {
  unauthorized: string;
  unsupportedFile: string;
  fileTooLarge: (name: string) => string;
  tooManyFiles: string;
  expiredFile: string;
  networkError: string;
  sendFailed: string;
  sending: string;
  retry: string;
  newMessages: (count: number) => string;
  uploadAttachment: string;
  insertEmoji: string;
  sendMessage: string;
  openSound: string;
  closeSound: string;
  openChat: string;
  closeChat: string;
};

type PendingAttachment = Pick<InboxMessage, 'type' | 'fileUrl' | 'imageUrl' | 'fileName' | 'fileSize' | 'mimeType'> & {
  id: string;
  uploadedAt: number;
};

const CLIENT_COPY: Record<string, ClientCopy> = {
  '简体中文': { welcome: '您好，请问有什么可以帮您？', placeholder: '输入您的消息...', unavailable: '当前客服暂不可用', missingTitle: '聊天渠道不存在', missingDescription: '请检查链接是否正确。' },
  '繁体中文': { welcome: '您好，請問有什麼可以幫您？', placeholder: '輸入您的訊息...', unavailable: '目前客服暫不可用', missingTitle: '聊天渠道不存在', missingDescription: '請檢查連結是否正確。' },
  英语: { welcome: 'Hi, how can I help you today?', placeholder: 'Type your message...', unavailable: 'Support is currently unavailable', missingTitle: 'Chat channel not found', missingDescription: 'Please check the link and try again.' },
  越南语: { welcome: 'Xin chào, tôi có thể giúp gì cho bạn?', placeholder: 'Nhập tin nhắn...', unavailable: 'Hiện không có nhân viên hỗ trợ', missingTitle: 'Không tìm thấy kênh trò chuyện', missingDescription: 'Vui lòng kiểm tra lại liên kết.' },
  泰语: { welcome: 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ?', placeholder: 'พิมพ์ข้อความ...', unavailable: 'ขณะนี้ฝ่ายบริการไม่พร้อมใช้งาน', missingTitle: 'ไม่พบช่องแชท', missingDescription: 'โปรดตรวจสอบลิงก์อีกครั้ง' },
  高棉语: { welcome: 'សួស្តី តើខ្ញុំអាចជួយអ្វីបានខ្លះ?', placeholder: 'បញ្ចូលសាររបស់អ្នក...', unavailable: 'បច្ចុប្បន្នផ្នែកជំនួយមិនអាចប្រើបានទេ', missingTitle: 'រកមិនឃើញឆានែលជជែក', missingDescription: 'សូមពិនិត្យតំណម្តងទៀត។' },
  缅甸语: { welcome: 'မင်္ဂလာပါ၊ ဘာများကူညီပေးရမလဲ။', placeholder: 'သင့်စာကို ရိုက်ထည့်ပါ...', unavailable: 'ဝန်ဆောင်မှုကို ယခုမရနိုင်ပါ', missingTitle: 'ချတ်ချန်နယ် မတွေ့ပါ', missingDescription: 'လင့်ခ်ကို ပြန်စစ်ပါ။' },
  老挝语: { welcome: 'ສະບາຍດີ ຂ້ອຍຊ່ວຍຫຍັງໄດ້ແດ່?', placeholder: 'ພິມຂໍ້ຄວາມ...', unavailable: 'ຕອນນີ້ຝ່າຍບໍລິການບໍ່ພ້ອມ', missingTitle: 'ບໍ່ພົບຊ່ອງສົນທະນາ', missingDescription: 'ກະລຸນາກວດສອບລິ້ງອີກຄັ້ງ.' },
};

const englishUiCopy: ClientUiCopy = { unauthorized: 'This website is not authorized for support', unsupportedFile: 'This file type is not supported', fileTooLarge: (name) => `${name} is larger than 20 MB`, tooManyFiles: 'You can upload up to 5 files at a time', expiredFile: 'A file has expired. Please upload it again.', networkError: 'Network error. Message was not sent.', sendFailed: 'Message failed to send.', sending: 'Sending…', retry: 'Retry', newMessages: (count) => `${count} new message${count > 1 ? 's' : ''}`, uploadAttachment: 'Upload attachment', insertEmoji: 'Insert emoji', sendMessage: 'Send message', openSound: 'Turn on message sound', closeSound: 'Turn off message sound', openChat: 'Open chat', closeChat: 'Close chat' };
const CLIENT_UI_COPY: Record<string, ClientUiCopy> = {
  '简体中文': { unauthorized: '当前网站未获授权，无法使用客服', unsupportedFile: '不支持该文件格式', fileTooLarge: (name) => `${name} 超过 20 MB，无法发送`, tooManyFiles: '每次最多上传 5 个文件', expiredFile: '文件已过期，请重新上传', networkError: '网络异常，消息未发送', sendFailed: '消息发送失败，请重试', sending: '正在发送…', retry: '重试', newMessages: (count) => `${count} 条新消息`, uploadAttachment: '上传附件', insertEmoji: '插入表情', sendMessage: '发送消息', openSound: '打开消息提示音', closeSound: '关闭消息提示音', openChat: '打开聊天窗口', closeChat: '关闭聊天窗口' },
  '繁体中文': { unauthorized: '目前網站未獲授權，無法使用客服', unsupportedFile: '不支援此檔案格式', fileTooLarge: (name) => `${name} 超過 20 MB，無法傳送`, tooManyFiles: '每次最多上傳 5 個檔案', expiredFile: '檔案已過期，請重新上傳', networkError: '網路異常，訊息未傳送', sendFailed: '訊息傳送失敗，請重試', sending: '正在傳送…', retry: '重試', newMessages: (count) => `${count} 則新訊息`, uploadAttachment: '上傳附件', insertEmoji: '插入表情', sendMessage: '傳送訊息', openSound: '開啟訊息提示音', closeSound: '關閉訊息提示音', openChat: '開啟聊天視窗', closeChat: '關閉聊天視窗' },
  英语: englishUiCopy,
  越南语: englishUiCopy,
  泰语: englishUiCopy,
  高棉语: englishUiCopy,
  缅甸语: englishUiCopy,
  老挝语: englishUiCopy,
};

function resolveClientCopy(language?: string, websiteLanguage?: string | null): ClientCopy {
  if (language && language !== 'auto') return CLIENT_COPY[language] ?? CLIENT_COPY['简体中文'];
  const browserLanguage = (websiteLanguage || navigator.language).toLowerCase();
  if (browserLanguage.startsWith('zh-tw') || browserLanguage.startsWith('zh-hk')) return CLIENT_COPY['繁体中文'];
  if (browserLanguage.startsWith('en')) return CLIENT_COPY.英语;
  if (browserLanguage.startsWith('vi')) return CLIENT_COPY.越南语;
  if (browserLanguage.startsWith('th')) return CLIENT_COPY.泰语;
  if (browserLanguage.startsWith('km')) return CLIENT_COPY.高棉语;
  if (browserLanguage.startsWith('my')) return CLIENT_COPY.缅甸语;
  if (browserLanguage.startsWith('lo')) return CLIENT_COPY.老挝语;
  return CLIENT_COPY.英语;
}

function foregroundFor(background?: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(background || '');
  if (!match) return '#ffffff';
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (red * 299 + green * 587 + blue * 114) / 1000 > 156 ? '#16191f' : '#ffffff';
}

function runtimeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function messageDateLabel(sentAt: string) {
  const date = new Date(sentAt);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function readVisitor(channelId: string) {
  const key = `${VISITOR_KEY}:${channelId}`;
  let value = sessionStorage.getItem(key);
  if (!value) {
    value = runtimeId('visitor');
    sessionStorage.setItem(key, value);
  }
  return value;
}

function fileKind(file: File): InboxMessage['type'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

function fileExtension(file: File) {
  const index = file.name.lastIndexOf('.');
  return index >= 0 ? file.name.slice(index).toLowerCase() : '';
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function MessageBody({ message }: { message: InboxMessage }) {
  const url = message.fileUrl || message.imageUrl;
  if (message.type === 'image' && url) return <img className="client-message-image" src={url} alt={message.fileName || message.content} />;
  if (message.type === 'video' && url) return <video className="client-message-video" src={url} controls />;
  if (message.type === 'audio' && url) return <audio className="client-message-audio" src={url} controls />;
  if (message.type === 'file') return <span className="client-file-message"><span className="client-file-icon"><IconFile /></span><span><a href={url} download={message.fileName || message.content}>{message.fileName || message.content}</a><small>{message.fileSize ? `${Math.ceil(message.fileSize / 1024)} KB` : ''}</small></span></span>;
  return <>{message.content}</>;
}

function playNotificationSound() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const playTone = (frequency: number, start: number, duration: number) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.04, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  };
  const start = context.currentTime + 0.01;
  playTone(783.99, start, 0.18);
  playTone(1046.5, start + 0.22, 0.24);
  window.setTimeout(() => void context.close(), 560);
}

function channelWelcome(channel: Channel, copy: ClientCopy, scope = 'preview'): InboxMessage {
  return { id: `welcome-${channel.id}-${scope}`, role: 'agent', content: copy.welcome, sentAt: new Date().toISOString() };
}

export function ChannelClientPage({ type }: { type: 'web-widget' | 'chat-page' }) {
  const { channelId = '' } = useParams();
  const { state, dispatch } = useAppStore();
  const channel = state.channels.find((item) => item.id === channelId && item.type === type);
  const agent = state.agents.find((item) => item.id === channel?.agentId);
  const requestedLanguage = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('lang');
  const copy = resolveClientCopy(channel?.language, type === 'web-widget' ? requestedLanguage : null);
  const languageKey = Object.entries(CLIENT_COPY).find(([, value]) => value === copy)?.[0] ?? '英语';
  const uiCopy = CLIENT_UI_COPY[languageKey] ?? englishUiCopy;
  const visitorId = useMemo(() => readVisitor(channelId), [channelId]);
  const visitorConversations = useMemo(() => state.channelConversations
    .filter((item) => item.channelId === channelId && item.visitorId === visitorId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [channelId, state.channelConversations, visitorId]);
  const processingConversation = state.channelConversations.find((item) => item.channelId === channelId && item.visitorId === visitorId && item.state === 'processing');
  const timeoutMinutes = state.settings.chatTimeout.minutes;
  const conversationExpired = Boolean(processingConversation && state.settings.chatTimeout.enabled && Date.now() - new Date(processingConversation.updatedAt).getTime() >= timeoutMinutes * 60_000);
  const conversation = conversationExpired ? undefined : processingConversation;
  const [open, setOpen] = useState(type === 'chat-page');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem(`${MUTE_KEY}:${channelId}`) === 'true');
  const [unread, setUnread] = useState(0);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(40);
  const [sending, setSending] = useState(false);
  const [failedOutgoing, setFailedOutgoing] = useState<InboxMessage[]>([]);
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth < 768);
  const [, setClock] = useState(0);
  const lastAgentMessageRef = useRef('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composerRef = useRef<HTMLElement | null>(null);
  const restoreHistoryScrollRef = useRef<number | null>(null);
  const requestedHost = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('host')?.toLowerCase();
  const domainAllowed = !requestedHost || !channel?.allowedDomains?.length || channel.allowedDomains.some((domain) => requestedHost === domain || requestedHost.endsWith(`.${domain}`));
  const messages = useMemo(() => {
    if (!domainAllowed) return [];
    const cutoff = Date.now() - 183 * 24 * 60 * 60 * 1000;
    const history = visitorConversations.flatMap((item) => item.messages).filter((message) => new Date(message.sentAt).getTime() >= cutoff);
    return history.length ? history : (channel ? [channelWelcome(channel, copy)] : []);
  }, [channel, copy, domainAllowed, visitorConversations]);
  const visibleMessages = messages.slice(Math.max(0, messages.length - visibleHistoryCount));
  const hasEarlierMessages = visibleMessages.length < messages.length;
  const activeAgent = conversation ? state.agents.find((item) => item.id === conversation.agentId) : agent;
  const available = Boolean(channel?.enabled && activeAgent?.status === 'published' && activeAgent.acceptingChats && domainAllowed);

  useEffect(() => {
    if (type === 'web-widget' && channel && channel.installStatus !== 'success') {
      dispatch({ type: 'channel.installDetected', id: channel.id, checkedAt: new Date().toISOString() });
    }
  }, [channel, dispatch, type]);

  useEffect(() => {
    if (!processingConversation || !conversationExpired) return;
    dispatch({ type: 'conversation.close', conversationId: processingConversation.id, reason: 'timeout', closedAt: new Date().toISOString() });
  }, [conversationExpired, dispatch, processingConversation]);

  useEffect(() => {
    if (!processingConversation || !state.settings.chatTimeout.enabled) return;
    const elapsed = Date.now() - new Date(processingConversation.updatedAt).getTime();
    const wait = Math.max(0, timeoutMinutes * 60_000 - elapsed);
    const timer = window.setTimeout(() => setClock((value) => value + 1), wait + 10);
    return () => window.clearTimeout(timer);
  }, [processingConversation, state.settings.chatTimeout.enabled, timeoutMinutes]);

  useEffect(() => {
    const updateViewport = () => setIsMobileViewport(window.innerWidth < 768);
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (restoreHistoryScrollRef.current === null || !messagesRef.current) return;
    const previousHeight = restoreHistoryScrollRef.current;
    restoreHistoryScrollRef.current = null;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight - previousHeight;
  }, [visibleHistoryCount]);

  useEffect(() => {
    const newest = [...messages].reverse().find((message) => message.role === 'agent');
    if (!newest) return;
    if (!lastAgentMessageRef.current) {
      lastAgentMessageRef.current = newest.id;
      return;
    }
    if (newest.id === lastAgentMessageRef.current) return;
    lastAgentMessageRef.current = newest.id;
    if (!muted) playNotificationSound();
    if (type === 'web-widget' && (!open || !atBottomRef.current)) setUnread((value) => value + 1);
    if (type === 'chat-page' && document.hidden) setUnread((value) => value + 1);
  }, [messages, muted, open, type]);

  useEffect(() => {
    if (!channel) return;
    document.title = unread ? `(${unread}) ${channel.brandName || channel.name}` : (channel.brandName || channel.name);
    localStorage.setItem(`${READ_KEY}:${channelId}`, String(unread));
    return () => { document.title = '灵犀智能体'; };
  }, [channel, channelId, unread]);

  useEffect(() => {
    if (open || type === 'chat-page') {
      if (atBottomRef.current) {
        setUnread(0);
        window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end' }));
      }
    }
  }, [messages.length, open, type]);

  useEffect(() => {
    if (!emojiOpen) return;
    const close = (event: PointerEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) setEmojiOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [emojiOpen]);

  if (!channel) return <main className="channel-client-state"><strong>{copy.missingTitle}</strong><span>{copy.missingDescription}</span></main>;

  const ensureConversation = (): InboxConversation => {
    if (conversation) return conversation;
    const createdAt = new Date().toISOString();
    const conversationId = runtimeId('conversation');
    const next: InboxConversation = {
      id: conversationId,
      visitorId,
      customerName: formatAnonymousVisitorName(visitorId),
      channelId: channel.id,
      channelType: type,
      channelName: channel.name,
      agentId: agent?.id || '',
      agentName: agent?.name || 'AI Agent',
      state: 'processing',
      closedReason: null,
      createdAt,
      updatedAt: createdAt,
      messages: [channelWelcome(channel, copy, conversationId)],
    };
    lastAgentMessageRef.current = next.messages[0].id;
    dispatch({ type: 'conversation.upsert', conversation: next });
    return next;
  };

  const sendMessages = (outgoing: InboxMessage[]) => {
    if (!available) {
      setError(domainAllowed ? copy.unavailable : uiCopy.unauthorized);
      return false;
    }
    if (!navigator.onLine) {
      setFailedOutgoing(outgoing);
      setError(uiCopy.networkError);
      return false;
    }
    setSending(true);
    const target = ensureConversation();
    window.setTimeout(() => {
      try {
        outgoing.forEach((message) => dispatch({ type: 'conversation.message', conversationId: target.id, message }));
        setFailedOutgoing([]);
        setError('');
      } catch {
        setFailedOutgoing(outgoing);
        setError(uiCopy.sendFailed);
      } finally {
        setSending(false);
      }
    }, 240);
    return true;
  };

  const sendText = () => {
    const content = input.trim();
    if (!content && !pendingAttachments.length) return;
    const now = Date.now();
    const activeAttachments = pendingAttachments.filter((attachment) => now - attachment.uploadedAt < 24 * 60 * 60 * 1000);
    if (activeAttachments.length !== pendingAttachments.length) setError(uiCopy.expiredFile);
    const sentAt = new Date(now).toISOString();
    const outgoing: InboxMessage[] = [];
    if (content) outgoing.push({ id: runtimeId('message'), role: 'customer', content, sentAt });
    activeAttachments.forEach((attachment) => outgoing.push({
      id: runtimeId('message'),
      role: 'customer',
      content: attachment.fileName || '附件',
      sentAt,
      type: attachment.type,
      fileUrl: attachment.fileUrl,
      imageUrl: attachment.imageUrl,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
    }));
    if (!outgoing.length) return;
    if (!sendMessages(outgoing)) return;
    setInput('');
    setPendingAttachments([]);
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files) return;
    const remaining = Math.max(0, 5 - pendingAttachments.length);
    if (!remaining) {
      setError(uiCopy.tooManyFiles);
      return;
    }
    const next: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      if (next.length >= remaining) break;
      if (!ALLOWED_EXTENSIONS.has(fileExtension(file))) {
        setError(uiCopy.unsupportedFile);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(uiCopy.fileTooLarge(file.name));
        continue;
      }
      const fileUrl = await fileToDataUrl(file);
      const type = fileKind(file);
      next.push({ id: runtimeId('attachment'), type, fileUrl, imageUrl: type === 'image' ? fileUrl : undefined, fileName: file.name, fileSize: file.size, mimeType: file.type, uploadedAt: Date.now() });
    }
    if (Array.from(files).length > remaining) setError(uiCopy.tooManyFiles);
    setPendingAttachments((current) => [...current, ...next]);
  };

  const scrollToLatest = () => {
    atBottomRef.current = true;
    setUnread(0);
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  };

  const handleMessageScroll = () => {
    const viewport = messagesRef.current;
    if (!viewport) return;
    if (viewport.scrollTop < 24 && hasEarlierMessages) {
      restoreHistoryScrollRef.current = viewport.scrollHeight;
      setVisibleHistoryCount((count) => Math.min(messages.length, count + 40));
    }
    const atBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 24;
    atBottomRef.current = atBottom;
    if (atBottom) setUnread(0);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem(`${MUTE_KEY}:${channelId}`, String(next));
  };

  const retryFailedMessages = () => {
    if (!failedOutgoing.length) return;
    sendMessages(failedOutgoing);
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? input.length;
    const end = textarea?.selectionEnd ?? input.length;
    const next = `${input.slice(0, start)}${emoji}${input.slice(end)}`;
    setInput(next);
    setEmojiOpen(false);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      const cursor = start + emoji.length;
      textarea?.setSelectionRange(cursor, cursor);
    });
  };

  const chat = <section className={`channel-client-chat ${type === 'chat-page' ? 'is-page' : ''}`} style={{ '--client-theme': channel.themeColor || '#1c1f26', '--client-foreground': foregroundFor(channel.themeColor) } as React.CSSProperties}>
    <header>
      <span className="channel-client-avatar">{channel.brandAvatar ? <img src={channel.brandAvatar} alt="" /> : (channel.brandName || channel.name).slice(0, 1)}</span>
      <span className="channel-client-brand"><strong>{channel.brandName || channel.name}</strong>{channel.brandSignature && <small>{channel.brandSignature}</small>}</span>
      <button type="button" aria-label={muted ? uiCopy.openSound : uiCopy.closeSound} onClick={toggleMute}>{muted ? <IconNotificationClose /> : <IconNotification />}</button>
      {type === 'web-widget' && <button type="button" aria-label={uiCopy.closeChat} onClick={() => setOpen(false)}><IconClose /></button>}
    </header>
    <div className="channel-client-messages" ref={messagesRef} onScroll={handleMessageScroll}>
      {visibleMessages.map((message, index) => <div key={message.id}>{(index === 0 || messageDateLabel(visibleMessages[index - 1].sentAt) !== messageDateLabel(message.sentAt)) && <div className="channel-client-date-divider"><span>{messageDateLabel(message.sentAt)}</span></div>}<div className={`channel-client-message-row is-${message.role}`}><div className={`channel-client-message${message.type === 'file' ? ' is-file' : ''}`}><MessageBody message={message} /></div></div></div>)}
      <div ref={endRef} />
    </div>
    {unread > 0 && (open || type === 'chat-page') && <button type="button" className="channel-client-new-messages" onClick={scrollToLatest}>{uiCopy.newMessages(unread)}</button>}
    <div className="channel-client-compose-status">{pendingAttachments.length > 0 && <div className="channel-client-pending-files">{pendingAttachments.map((attachment) => <span key={attachment.id}>{attachment.type === 'image' && attachment.fileUrl ? <img src={attachment.fileUrl} alt="" /> : <IconFile />}<b title={attachment.fileName}>{attachment.fileName}</b><button type="button" aria-label={`移除 ${attachment.fileName}`} onClick={() => setPendingAttachments((items) => items.filter((item) => item.id !== attachment.id))}>×</button></span>)}</div>}{sending && <div className="channel-client-send-state">{uiCopy.sending}</div>}{error && <div className="channel-client-error">{error}{failedOutgoing.length > 0 && <button type="button" onClick={retryFailedMessages}>{uiCopy.retry}</button>}</div>}</div>
    <footer ref={composerRef} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadFiles(event.dataTransfer.files); }}>
      <button type="button" aria-label={uiCopy.uploadAttachment} disabled={!available || sending} onClick={() => fileRef.current?.click()}><IconPlus /></button>
      <input ref={fileRef} type="file" hidden multiple accept={ACCEPT} onChange={(event) => { void uploadFiles(event.target.files); event.currentTarget.value = ''; }} />
      <button type="button" className="channel-client-emoji-trigger" aria-label={uiCopy.insertEmoji} aria-expanded={emojiOpen} disabled={!available || sending} onClick={() => setEmojiOpen((value) => !value)}>☺</button>
      {emojiOpen && <div className="channel-client-emoji-picker" role="dialog" aria-label="选择表情">{EMOJIS.map((emoji) => <button type="button" key={emoji} aria-label={`插入表情 ${emoji}`} onMouseDown={(event) => event.preventDefault()} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</div>}
      <textarea ref={textareaRef} value={input} disabled={!available || sending} rows={1} placeholder={available ? copy.placeholder : domainAllowed ? copy.unavailable : uiCopy.unauthorized} onChange={(event) => setInput(event.target.value)} onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); void uploadFiles(event.clipboardData.files); } }} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendText(); } }} />
      <button type="button" className="is-send" aria-label={uiCopy.sendMessage} disabled={!available || sending || (!input.trim() && !pendingAttachments.length)} onClick={sendText}><IconSend /></button>
    </footer>
  </section>;

  if (type === 'chat-page') return <main className="channel-client-page">{chat}</main>;
  return <main className="channel-widget-host">
    <div className="channel-widget-host-copy"><strong>{channel.websiteDomain || '网站小部件测试页'}</strong><span>通过右下角入口模拟网站访客发起聊天。</span></div>
    {(isMobileViewport ? channel.widgetMobileVisible ?? true : channel.widgetDesktopVisible ?? true) && <div className={`channel-widget-runtime is-${isMobileViewport ? channel.widgetMobilePosition ?? channel.widgetPosition ?? 'bottom-right' : channel.widgetPosition || 'bottom-right'}`} style={{ '--offset-x': `${isMobileViewport ? channel.widgetMobileOffsetX ?? channel.widgetOffsetX ?? 24 : channel.widgetOffsetX ?? 24}px`, '--offset-y': `${isMobileViewport ? channel.widgetMobileOffsetY ?? channel.widgetOffsetY ?? 24 : channel.widgetOffsetY ?? 24}px` } as React.CSSProperties}>
      {open && chat}
      {!open && <button type="button" className="channel-client-fab" style={{ background: channel.themeColor || '#1c1f26', color: foregroundFor(channel.themeColor) }} aria-label={uiCopy.openChat} onClick={() => { setOpen(true); setUnread(0); }}>
        <WidgetClientGlyph type={channel.widgetIcon ?? 'message'} customIcon={channel.widgetCustomIcon} />
        {unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}
      </button>}
    </div>}
  </main>;
}
