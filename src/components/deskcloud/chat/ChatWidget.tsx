/**
 * ChatDesk — 단일 파일 벤더링 컴포넌트 (의존성: react + socket.io-client).
 * ──────────────────────────────────────────────────────────────────────────
 * npm publish 가 막힌 동안 형제 앱(offhours·resume·…)에 그대로 복붙해서 쓰는 버전입니다.
 * 워크스페이스 의존(@chatdesk/sdk·@chatdesk/shared) 0 — 필요한 상수·SDK 로직·스타일을
 * 이 파일에 인라인했습니다. 동작/디자인은 @chatdesk/widget 의 <ChatWidget> 과 동일합니다.
 *
 * 설치:
 *   npm i socket.io-client     # (react 는 호스트 앱에 이미 있음)
 *
 * 사용:
 *   import { ChatWidget } from './ChatWidget'
 *   <ChatWidget publishableKey="pk_demo" endpoint="https://chat.example.com" memberId="alice" />
 *
 * 백엔드 계약:
 *   REST  (헤더 X-Chat-Key: pk_…)
 *     GET  {endpoint}/api/conversations?memberId=…                 → 내 대화 목록 + unread
 *     GET  {endpoint}/api/conversations/{id}/messages?memberId=…   → 히스토리(오래된→최신)
 *     POST {endpoint}/api/conversations/{id}/messages             → 발송(senderMemberId, body)
 *     POST {endpoint}/api/conversations/{id}/read                 → 읽음(폴백)
 *   WS    (socket.io, path /chat; auth { key, memberId, token? })
 *     ← message · typing · read · presence:state/join/leave · message:deleted · error
 *     → join · leave · typing · read (모두 ack)
 *
 * 접근성/디자인: focus-visible · prefers-reduced-motion · 포커스 트랩 · Esc · 키보드 ·
 * 새 메시지 aria-live · 대비 ≥4.5:1 · 그라디언트/글래스모피즘 없음 · 외부 CSS 프레임워크 0.
 * ──────────────────────────────────────────────────────────────────────────
 */
/* eslint-disable react-refresh/only-export-components -- DeskCloud 벤더링 위젯(상류 desk 레포에서 유지). */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react'
import { io, type Socket } from 'socket.io-client'

/* ============================ 공유 계약(인라인) ============================ */

const DEFAULT_CHAT_PATH = '/chat'
const DEFAULT_HISTORY_LIMIT = 30

const WS_CLIENT = { join: 'join', leave: 'leave', typing: 'typing', read: 'read' } as const
const WS_SERVER = {
  message: 'message',
  messageDeleted: 'message:deleted',
  typing: 'typing',
  read: 'read',
  presenceState: 'presence:state',
  presenceJoin: 'presence:join',
  presenceLeave: 'presence:leave',
  error: 'error',
} as const

type ConversationKind = 'dm' | 'group'

interface Attachment {
  name: string
  url: string
  contentType?: string
  size?: number
}
interface MessageDto {
  id: string
  tenantId: string
  conversationId: string
  senderMemberId: string | null
  body: string
  attachments: Attachment[]
  system: boolean
  deleted: boolean
  createdAt: string
}
interface ConversationListItemDto {
  id: string
  tenantId: string
  kind: ConversationKind
  title: string | null
  memberIds: string[]
  createdAt: string
  lastMessage: MessageDto | null
  unreadCount: number
}
interface MyConversationsDto {
  memberId: string
  items: ConversationListItemDto[]
  totalUnread: number
}
interface MessageHistoryDto {
  conversationId: string
  items: MessageDto[]
  hasMore: boolean
}
interface SendResultDto {
  message: MessageDto
  delivered: number
}
interface ReadResultDto {
  conversationId: string
  memberId: string
  lastReadMessageId: string | null
  readAt: string
  unreadCount: number
}
type Ack = { ok: true } | { ok: false; code: string; message: string }

/* ============================ SDK(인라인) ============================ */

class ChatDeskError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: unknown
  ) {
    super(message)
    this.name = 'ChatDeskError'
  }
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

function normalizePath(raw: string): string {
  const p = (raw || DEFAULT_CHAT_PATH).trim() || DEFAULT_CHAT_PATH
  const lead = p.startsWith('/') ? p : `/${p}`
  const trimmed = lead.replace(/\/+$/, '')
  return trimmed === '' ? DEFAULT_CHAT_PATH : trimmed
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected'
type Unsub = () => void

interface ServerTypingEvent {
  conversationId: string
  memberId: string
  typing: boolean
}
interface ServerReadEvent {
  conversationId: string
  memberId: string
  lastReadMessageId: string | null
  readAt: string
}
interface ServerMessageDeletedEvent {
  conversationId: string
  messageId: string
}

interface ConversationRoom {
  conversationId: string
  messages: MessageDto[]
  hasMore: boolean
  onMessage: (cb: (m: MessageDto) => void) => Unsub
  onTyping: (cb: (e: ServerTypingEvent) => void) => Unsub
  onRead: (cb: (e: ServerReadEvent) => void) => Unsub
  onPresence: (cb: (count: number, members: string[]) => void) => Unsub
  onMessageDeleted: (cb: (e: ServerMessageDeletedEvent) => void) => Unsub
  fetchOlder: () => Promise<MessageDto[]>
  close: () => Promise<void>
}

interface ChatClient {
  readonly state: ConnectionState
  readonly memberId: string
  connect: () => Promise<void>
  disconnect: () => void
  conversations: (signal?: AbortSignal) => Promise<MyConversationsDto>
  open: (conversationId: string, opts?: { limit?: number }) => Promise<ConversationRoom>
  send: (conversationId: string, body: string, attachments?: Attachment[]) => Promise<SendResultDto>
  typing: (conversationId: string, typing: boolean) => void
  markRead: (conversationId: string, lastReadMessageId?: string) => Promise<void>
  onMessage: (cb: (m: MessageDto) => void) => Unsub
}

interface ChatClientOptions {
  publishableKey: string
  memberId: string
  endpoint: string
  path?: string
  memberToken?: string
  fetch?: typeof fetch
}

function createChatClient(options: ChatClientOptions): ChatClient {
  const { publishableKey, memberId } = options
  if (!publishableKey) throw new ChatDeskError('publishableKey 가 필요합니다', 0)
  if (!memberId) throw new ChatDeskError('memberId 가 필요합니다', 0)

  const base = options.endpoint.replace(/\/+$/, '')
  const path = normalizePath(options.path ?? DEFAULT_CHAT_PATH)
  const doFetch = options.fetch ?? globalThis.fetch

  const headers = (): Record<string, string> => ({
    'content-type': 'application/json',
    'x-chat-key': publishableKey,
  })

  async function parse<T>(res: Response): Promise<T> {
    const text = await res.text()
    const json: unknown = text ? (JSON.parse(text) as unknown) : null
    if (!res.ok) {
      const rec = (json ?? {}) as Record<string, unknown>
      const raw = rec.message ?? rec.error ?? `ChatDesk 요청 실패 (${res.status})`
      throw new ChatDeskError(Array.isArray(raw) ? raw.join(', ') : String(raw), res.status, json)
    }
    return json as T
  }
  const get = async <T,>(p: string, signal?: AbortSignal): Promise<T> =>
    parse<T>(await doFetch(`${base}${p}`, { method: 'GET', headers: headers(), signal }))
  const post = async <T,>(p: string, body: unknown): Promise<T> =>
    parse<T>(await doFetch(`${base}${p}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) }))

  let socket: Socket | null = null
  let state: ConnectionState = 'idle'
  const globalMsg = new Set<(m: MessageDto) => void>()

  type RoomL = {
    message: Set<(m: MessageDto) => void>
    typing: Set<(e: ServerTypingEvent) => void>
    read: Set<(e: ServerReadEvent) => void>
    presence: Set<(c: number, m: string[]) => void>
    deleted: Set<(e: ServerMessageDeletedEvent) => void>
    members: Set<string>
  }
  const rooms = new Map<string, RoomL>()
  const ensureRoom = (id: string): RoomL => {
    let r = rooms.get(id)
    if (!r) {
      r = {
        message: new Set(),
        typing: new Set(),
        read: new Set(),
        presence: new Set(),
        deleted: new Set(),
        members: new Set(),
      }
      rooms.set(id, r)
    }
    return r
  }

  const ensureSocket = (): Socket => {
    if (socket) return socket
    const auth: Record<string, string> = { key: publishableKey, memberId }
    if (options.memberToken) auth.token = options.memberToken
    const s = io(base, {
      path,
      transports: ['websocket', 'polling'],
      auth,
      autoConnect: false,
      withCredentials: true,
    })
    s.on('connect', () => (state = 'connected'))
    s.on('disconnect', () => (state = 'disconnected'))
    s.on('connect_error', () => (state = 'disconnected'))
    s.on(WS_SERVER.message, (m: MessageDto) => {
      for (const cb of globalMsg) cb(m)
      const r = rooms.get(m.conversationId)
      if (r) for (const cb of r.message) cb(m)
    })
    s.on(WS_SERVER.typing, (e: ServerTypingEvent) => {
      const r = rooms.get(e.conversationId)
      if (r) for (const cb of r.typing) cb(e)
    })
    s.on(WS_SERVER.read, (e: ServerReadEvent) => {
      const r = rooms.get(e.conversationId)
      if (r) for (const cb of r.read) cb(e)
    })
    s.on(WS_SERVER.messageDeleted, (e: ServerMessageDeletedEvent) => {
      const r = rooms.get(e.conversationId)
      if (r) for (const cb of r.deleted) cb(e)
    })
    const presence = (id: string): void => {
      const r = rooms.get(id)
      if (r) for (const cb of r.presence) cb(r.members.size, [...r.members])
    }
    s.on(WS_SERVER.presenceState, (e: { conversationId: string; count: number; members: string[] }) => {
      const r = rooms.get(e.conversationId)
      if (!r) return
      r.members = new Set(e.members)
      presence(e.conversationId)
    })
    s.on(WS_SERVER.presenceJoin, (e: { conversationId: string; member: string }) => {
      rooms.get(e.conversationId)?.members.add(e.member)
      presence(e.conversationId)
    })
    s.on(WS_SERVER.presenceLeave, (e: { conversationId: string; member: string }) => {
      rooms.get(e.conversationId)?.members.delete(e.member)
      presence(e.conversationId)
    })
    socket = s
    return s
  }

  const emit = <T,>(event: string, payload: unknown): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const s = socket
      if (!s || !s.connected) {
        reject(new ChatDeskError('소켓이 연결되어 있지 않습니다.', 0))
        return
      }
      s.timeout(8000).emit(event, payload, (err: Error | null, ack: T) =>
        err ? reject(new ChatDeskError('서버 응답 시간 초과', 0)) : resolve(ack)
      )
    })

  const api: ChatClient = {
    get state() {
      return state
    },
    get memberId() {
      return memberId
    },
    connect() {
      const s = ensureSocket()
      if (s.connected) return Promise.resolve()
      state = 'connecting'
      return new Promise<void>((resolve, reject) => {
        const ok = (): void => {
          cleanup()
          resolve()
        }
        const fail = (e: Error): void => {
          cleanup()
          reject(new ChatDeskError(`연결 실패: ${e.message}`, 0))
        }
        const cleanup = (): void => {
          s.off('connect', ok)
          s.off('connect_error', fail)
        }
        s.once('connect', ok)
        s.once('connect_error', fail)
        s.connect()
      })
    },
    disconnect() {
      if (socket) {
        socket.disconnect()
        socket = null
      }
      rooms.clear()
      state = 'disconnected'
    },
    conversations: (signal) => get<MyConversationsDto>(`/api/conversations${qs({ memberId })}`, signal),
    async open(conversationId, opts) {
      const limit = opts?.limit ?? DEFAULT_HISTORY_LIMIT
      const history = await get<MessageHistoryDto>(
        `/api/conversations/${encodeURIComponent(conversationId)}/messages${qs({ memberId, limit })}`
      )
      const r = ensureRoom(conversationId)
      if (!socket?.connected) await api.connect()
      const ack = await emit<Ack>(WS_CLIENT.join, { conversationId })
      if (!ack.ok) {
        rooms.delete(conversationId)
        throw new ChatDeskError(ack.message, 403, ack.code)
      }
      const room: ConversationRoom = {
        conversationId,
        messages: history.items,
        hasMore: history.hasMore,
        onMessage: (cb) => (r.message.add(cb), () => r.message.delete(cb)),
        onTyping: (cb) => (r.typing.add(cb), () => r.typing.delete(cb)),
        onRead: (cb) => (r.read.add(cb), () => r.read.delete(cb)),
        onPresence: (cb) => {
          r.presence.add(cb)
          if (r.members.size > 0) cb(r.members.size, [...r.members])
          return () => r.presence.delete(cb)
        },
        onMessageDeleted: (cb) => (r.deleted.add(cb), () => r.deleted.delete(cb)),
        async fetchOlder() {
          const oldest = room.messages[0]
          const page = await get<MessageHistoryDto>(
            `/api/conversations/${encodeURIComponent(conversationId)}/messages${qs({
              memberId,
              limit,
              before: oldest?.id,
            })}`
          )
          room.messages = [...page.items, ...room.messages]
          room.hasMore = page.hasMore
          return page.items
        },
        async close() {
          if (socket?.connected) {
            try {
              await emit<Ack>(WS_CLIENT.leave, { conversationId })
            } catch {
              /* ignore */
            }
          }
          rooms.delete(conversationId)
        },
      }
      return room
    },
    send: (conversationId, body, attachments) =>
      post<SendResultDto>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
        senderMemberId: memberId,
        body,
        attachments,
      }),
    typing(conversationId, typing) {
      if (socket?.connected) socket.emit(WS_CLIENT.typing, { conversationId, typing })
    },
    async markRead(conversationId, lastReadMessageId) {
      if (socket?.connected) {
        const ack = await emit<Ack>(WS_CLIENT.read, { conversationId, lastReadMessageId })
        if (!ack.ok) throw new ChatDeskError(ack.message, 403, ack.code)
        return
      }
      await post<ReadResultDto>(`/api/conversations/${encodeURIComponent(conversationId)}/read`, {
        memberId,
        lastReadMessageId,
      })
    },
    onMessage: (cb) => (globalMsg.add(cb), () => globalMsg.delete(cb)),
  }
  return api
}

/* ============================ 포매팅(인라인) ============================ */

function conversationName(conv: ConversationListItemDto, me: string): string {
  if (conv.kind === 'group') {
    if (conv.title) return conv.title
    const others = conv.memberIds.filter((m) => m !== me)
    if (others.length === 0) return '그룹'
    if (others.length <= 3) return others.join(', ')
    return `${others.slice(0, 3).join(', ')} 외 ${others.length - 3}명`
  }
  const other = conv.memberIds.find((m) => m !== me)
  return other ?? conv.memberIds[0] ?? '대화'
}
function previewText(conv: ConversationListItemDto): string {
  const m = conv.lastMessage
  if (!m) return '아직 메시지가 없습니다'
  if (m.deleted) return '삭제된 메시지'
  if (m.body) return m.body
  if (m.attachments.length > 0) return `첨부 ${m.attachments.length}개`
  return ''
}
function shortTime(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return '어제'
  return `${d.getMonth() + 1}/${d.getDate()}`
}
function clockTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (d.toDateString() === now.toDateString()) return '오늘'
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return '어제'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}
function sameDate(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/* ============================ 스타일(인라인) ============================ */

const DEFAULT_ACCENT = '#2f5fe0'
const DEFAULT_ACCENT_INK = '#ffffff'
const STYLE_ID = 'chatdesk-vendor-styles'

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = WIDGET_CSS
  document.head.appendChild(el)
}

const WIDGET_CSS = `
.cd-root, .cd-root * { box-sizing: border-box; }
.cd-root {
  --cd-accent: ${DEFAULT_ACCENT}; --cd-accent-ink: ${DEFAULT_ACCENT_INK};
  --cd-ink: #1a1d23; --cd-ink-soft: #4a4f57; --cd-muted: #6b7280;
  --cd-surface: #fff; --cd-surface-2: #f4f5f7; --cd-surface-3: #eceef1;
  --cd-border: #d7dae0; --cd-border-strong: #b7bcc6; --cd-danger: #b42318; --cd-success: #047857;
  --cd-radius: 16px; --cd-radius-sm: 10px;
  --cd-shadow: 0 1px 2px rgba(16,24,40,.06), 0 12px 32px -8px rgba(16,24,40,.22);
  --cd-z-launcher: 2147483000; --cd-z-panel: 2147483600; --cd-ease: cubic-bezier(.22,1,.36,1);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--cd-ink); line-height: 1.5;
}
.cd-launcher {
  position: fixed; z-index: var(--cd-z-launcher); display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 18px; border: 0; border-radius: 999px; background: var(--cd-accent);
  color: var(--cd-accent-ink); font: inherit; font-weight: 600; font-size: 14px; cursor: pointer;
  box-shadow: var(--cd-shadow); transition: transform .18s var(--cd-ease), filter .18s var(--cd-ease);
}
.cd-launcher:hover { filter: brightness(1.06); transform: translateY(-1px); }
.cd-launcher svg { width: 18px; height: 18px; display: block; }
.cd-launcher-badge {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
  background: var(--cd-accent-ink); color: var(--cd-accent); font-size: 11px; font-weight: 700;
  line-height: 18px; text-align: center;
}
.cd-pos-br { right: 20px; bottom: 20px; } .cd-pos-bl { left: 20px; bottom: 20px; }
.cd-pos-tr { right: 20px; top: 20px; } .cd-pos-tl { left: 20px; top: 20px; }
.cd-panel {
  position: fixed; z-index: var(--cd-z-panel); width: min(384px, calc(100vw - 32px));
  height: min(620px, calc(100vh - 40px)); display: flex; flex-direction: column;
  background: var(--cd-surface); color: var(--cd-ink); border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius); box-shadow: var(--cd-shadow); overflow: hidden;
  animation: cd-pop .2s var(--cd-ease);
}
.cd-panel.cd-pos-br { right: 20px; bottom: 20px; } .cd-panel.cd-pos-bl { left: 20px; bottom: 20px; }
.cd-panel.cd-pos-tr { right: 20px; top: 20px; } .cd-panel.cd-pos-tl { left: 20px; top: 20px; }
@media (max-width: 480px) {
  .cd-panel { width: 100vw; height: 100dvh; max-height: 100dvh; inset: 0 !important;
    border-radius: 0; border: 0; animation: cd-sheet .24s var(--cd-ease); }
}
.cd-header {
  display: flex; align-items: center; gap: 10px; padding: 14px 14px 14px 16px;
  border-bottom: 1px solid var(--cd-border); background: var(--cd-surface);
}
.cd-header-title { flex: 1; min-width: 0; }
.cd-header-title h2 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cd-header-sub { margin: 2px 0 0; font-size: 12px; color: var(--cd-muted); }
.cd-header-sub.cd-online { color: var(--cd-success); }
.cd-iconbtn {
  flex: none; width: 34px; height: 34px; display: inline-flex; align-items: center;
  justify-content: center; border: 0; border-radius: 9px; background: transparent;
  color: var(--cd-muted); cursor: pointer; transition: background .14s var(--cd-ease), color .14s var(--cd-ease);
}
.cd-iconbtn:hover { background: var(--cd-surface-2); color: var(--cd-ink); }
.cd-iconbtn svg { width: 20px; height: 20px; }
.cd-list { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 6px; list-style: none; margin: 0; }
.cd-conv {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 12px; border: 0;
  border-radius: var(--cd-radius-sm); background: transparent; text-align: left; font: inherit;
  cursor: pointer; transition: background .12s var(--cd-ease);
}
.cd-conv:hover { background: var(--cd-surface-2); }
.cd-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; background: var(--cd-surface-3);
  color: var(--cd-ink-soft); display: inline-flex; align-items: center; justify-content: center; }
.cd-avatar svg { width: 22px; height: 22px; }
.cd-conv-body { flex: 1; min-width: 0; }
.cd-conv-top { display: flex; align-items: baseline; gap: 8px; }
.cd-conv-name { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.cd-conv-time { flex: none; font-size: 11px; color: var(--cd-muted); }
.cd-conv-preview { margin: 2px 0 0; font-size: 13px; color: var(--cd-muted); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.cd-conv-preview.cd-unread { color: var(--cd-ink); font-weight: 600; }
.cd-badge { flex: none; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
  background: var(--cd-accent); color: var(--cd-accent-ink); font-size: 11px; font-weight: 700;
  line-height: 20px; text-align: center; }
.cd-thread { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 16px 14px 8px;
  display: flex; flex-direction: column; gap: 3px; background: var(--cd-surface-2); }
.cd-loadmore { align-self: center; margin-bottom: 8px; padding: 6px 14px; border: 1px solid var(--cd-border);
  border-radius: 999px; background: var(--cd-surface); color: var(--cd-ink-soft); font: inherit;
  font-size: 12px; font-weight: 600; cursor: pointer; }
.cd-day { align-self: center; margin: 10px 0; padding: 3px 12px; border-radius: 999px;
  background: var(--cd-surface-3); color: var(--cd-ink-soft); font-size: 11px; font-weight: 600; }
.cd-msg-row { display: flex; flex-direction: column; max-width: 80%; }
.cd-msg-row.cd-mine { align-self: flex-end; align-items: flex-end; }
.cd-msg-row.cd-theirs { align-self: flex-start; align-items: flex-start; }
.cd-msg-row.cd-system { align-self: center; max-width: 92%; align-items: center; }
.cd-msg-sender { margin: 8px 4px 2px; font-size: 11px; font-weight: 600; color: var(--cd-muted); }
.cd-bubble { padding: 9px 13px; border-radius: 16px; font-size: 14px; line-height: 1.45;
  word-break: break-word; white-space: pre-wrap; box-shadow: 0 1px 1px rgba(16,24,40,.04); }
.cd-mine .cd-bubble { background: var(--cd-accent); color: var(--cd-accent-ink); border-bottom-right-radius: 5px; }
.cd-theirs .cd-bubble { background: var(--cd-surface); color: var(--cd-ink); border: 1px solid var(--cd-border);
  border-bottom-left-radius: 5px; }
.cd-system .cd-bubble { background: transparent; color: var(--cd-muted); border: 0; font-size: 12.5px;
  text-align: center; box-shadow: none; padding: 4px 10px; }
.cd-bubble.cd-deleted { font-style: italic; opacity: .7; }
.cd-msg-meta { display: inline-flex; align-items: center; gap: 4px; margin: 2px 4px 0; font-size: 10.5px; color: var(--cd-muted); }
.cd-msg-meta .cd-receipt { width: 14px; height: 14px; color: var(--cd-muted); }
.cd-msg-meta .cd-receipt.cd-read { color: var(--cd-accent); }
.cd-attach { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12.5px; text-decoration: underline; }
.cd-mine .cd-attach { color: var(--cd-accent-ink); } .cd-theirs .cd-attach { color: var(--cd-accent); }
.cd-typing { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; margin: 4px 4px 2px;
  padding: 9px 14px; border-radius: 16px; border-bottom-left-radius: 5px; background: var(--cd-surface);
  border: 1px solid var(--cd-border); }
.cd-typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--cd-muted);
  animation: cd-bounce 1.2s var(--cd-ease) infinite; }
.cd-typing span:nth-child(2) { animation-delay: .15s; } .cd-typing span:nth-child(3) { animation-delay: .3s; }
.cd-typing-text { align-self: flex-start; margin: 0 6px 4px; font-size: 11px; color: var(--cd-muted); }
.cd-composer { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px;
  border-top: 1px solid var(--cd-border); background: var(--cd-surface); }
.cd-composer textarea { flex: 1; min-height: 40px; max-height: 120px; resize: none; padding: 9px 12px;
  border: 1px solid var(--cd-border); border-radius: 20px; font: inherit; font-size: 14px; line-height: 1.4;
  color: var(--cd-ink); background: var(--cd-surface); transition: border-color .12s var(--cd-ease); }
.cd-composer textarea::placeholder { color: var(--cd-muted); }
.cd-composer textarea:hover { border-color: var(--cd-border-strong); }
.cd-send { flex: none; width: 40px; height: 40px; display: inline-flex; align-items: center;
  justify-content: center; border: 0; border-radius: 50%; background: var(--cd-accent);
  color: var(--cd-accent-ink); cursor: pointer; transition: filter .14s var(--cd-ease); }
.cd-send:hover:not(:disabled) { filter: brightness(1.06); }
.cd-send:disabled { opacity: .5; cursor: not-allowed; } .cd-send svg { width: 20px; height: 20px; }
.cd-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 32px 28px; text-align: center; }
.cd-state-icon { width: 52px; height: 52px; margin-bottom: 14px; display: flex; align-items: center;
  justify-content: center; border-radius: 50%; background: var(--cd-surface-2); color: var(--cd-muted); }
.cd-state-icon.cd-err { background: color-mix(in srgb, var(--cd-danger) 12%, var(--cd-surface)); color: var(--cd-danger); }
.cd-state-icon svg { width: 28px; height: 28px; }
.cd-state-title { margin: 0; font-size: 15px; font-weight: 700; }
.cd-state-text { margin: 8px 0 0; font-size: 13px; color: var(--cd-ink-soft); max-width: 28ch; }
.cd-spinner { width: 28px; height: 28px; border: 3px solid var(--cd-border); border-top-color: var(--cd-accent);
  border-radius: 50%; animation: cd-spin .7s linear infinite; }
.cd-btn { margin-top: 16px; appearance: none; border: 1px solid transparent; border-radius: var(--cd-radius-sm);
  padding: 9px 18px; font: inherit; font-weight: 600; font-size: 14px; background: var(--cd-accent);
  color: var(--cd-accent-ink); cursor: pointer; transition: filter .14s var(--cd-ease); }
.cd-btn:hover { filter: brightness(1.06); }
.cd-sr-only { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.cd-root :focus { outline: none; }
.cd-root :focus-visible { outline: 2px solid var(--cd-accent); outline-offset: 2px; border-radius: 8px; }
.cd-composer textarea:focus-visible { outline-offset: 1px; }
@keyframes cd-pop { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes cd-sheet { from { transform: translateY(100%); } to { transform: none; } }
@keyframes cd-spin { to { transform: rotate(360deg); } }
@keyframes cd-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-4px); opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .cd-root *, .cd-panel, .cd-launcher, .cd-spinner, .cd-typing span {
    animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
  .cd-spinner { animation: cd-spin .9s linear infinite !important; }
}
`

/* ============================ 아이콘(인라인) ============================ */

const ChatIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4 4v-4H6.5"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const CloseIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)
const BackIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const SendIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4.5 12 19 5l-4 14-3.5-5.5L4.5 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    <path d="m11.5 13.5 3.5-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)
const CheckDoubleIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m2 13 3.5 3.5L13 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m9 14 1.5 1.5L18 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const AlertIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 8v5m0 3.5h.01M10.3 3.9 2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const GroupIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-3-4.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)
const PersonIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5 19.5a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

/* ============================ 컴포넌트 ============================ */

export type WidgetPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

export interface ChatWidgetProps {
  publishableKey: string
  endpoint: string
  memberId: string
  memberName?: string
  path?: string
  memberToken?: string
  position?: WidgetPosition
  accent?: string
  accentInk?: string
  label?: string
  title?: string
  defaultOpen?: boolean
  fetch?: typeof fetch
  client?: ChatClient
}

const POSITION_CLASS: Record<WidgetPosition, string> = {
  'bottom-right': 'cd-pos-br',
  'bottom-left': 'cd-pos-bl',
  'top-right': 'cd-pos-tr',
  'top-left': 'cd-pos-tl',
}
const FOCUSABLE =
  'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])'

type ListPhase = 'idle' | 'loading' | 'ready' | 'error'

export function ChatWidget(props: ChatWidgetProps): ReactElement {
  const {
    publishableKey,
    endpoint,
    memberId,
    memberName,
    path,
    memberToken,
    position = 'bottom-right',
    accent = DEFAULT_ACCENT,
    accentInk = DEFAULT_ACCENT_INK,
    label = '채팅',
    title = '메시지',
    defaultOpen = false,
    fetch: customFetch,
    client: injectedClient,
  } = props

  const client = useMemo<ChatClient>(
    () =>
      injectedClient ??
      createChatClient({ publishableKey, memberId, endpoint, path, memberToken, fetch: customFetch }),
    [injectedClient, publishableKey, memberId, endpoint, path, memberToken, customFetch]
  )

  const [open, setOpen] = useState(defaultOpen)
  const [listPhase, setListPhase] = useState<ListPhase>('idle')
  const [conversations, setConversations] = useState<ConversationListItemDto[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    ensureStyles()
  }, [])

  const loadConversations = useCallback(
    (signal?: AbortSignal) => {
      setListPhase((p) => (p === 'ready' ? p : 'loading'))
      client
        .conversations(signal)
        .then((res) => {
          if (signal?.aborted) return
          setConversations(res.items)
          setListPhase('ready')
        })
        .catch(() => {
          if (signal?.aborted) return
          setListPhase('error')
        })
    },
    [client]
  )

  useEffect(() => {
    const ctrl = new AbortController()
    loadConversations(ctrl.signal)
    return () => ctrl.abort()
  }, [loadConversations])

  useEffect(() => {
    const off = client.onMessage((m) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === m.conversationId)
        if (idx === -1) {
          loadConversations()
          return prev
        }
        const isActive = m.conversationId === activeId && open
        const isMine = m.senderMemberId === memberId
        const next = [...prev]
        const conv = next[idx]!
        next[idx] = {
          ...conv,
          lastMessage: m,
          unreadCount: isActive || isMine ? conv.unreadCount : conv.unreadCount + 1,
        }
        const [moved] = next.splice(idx, 1)
        next.unshift(moved!)
        return next
      })
    })
    return off
  }, [client, activeId, open, memberId, loadConversations])

  useEffect(() => {
    setTotalUnread(conversations.reduce((s, c) => s + c.unreadCount, 0))
  }, [conversations])

  const openPanel = useCallback(() => {
    setOpen(true)
    if (listPhase === 'idle' || listPhase === 'error') loadConversations()
  }, [listPhase, loadConversations])

  const closePanel = useCallback(() => {
    setOpen(false)
    setActiveId(null)
    launcherRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (activeId) setActiveId(null)
        else closePanel()
        return
      }
      if (e.key !== 'Tab') return
      const root = panelRef.current
      if (!root) return
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement
      )
      if (nodes.length === 0) return
      const first = nodes[0]!
      const last = nodes[nodes.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, activeId, closePanel])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    }, 20)
    return () => window.clearTimeout(t)
  }, [open, activeId])

  const openConversation = useCallback((id: string) => {
    setActiveId(id)
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)))
  }, [])

  const activeConv = activeId ? (conversations.find((c) => c.id === activeId) ?? null) : null
  const rootStyle = { '--cd-accent': accent, '--cd-accent-ink': accentInk } as CSSProperties
  const posClass = POSITION_CLASS[position]

  return (
    <div className="cd-root" style={rootStyle}>
      {!open ? (
        <button
          ref={launcherRef}
          type="button"
          className={`cd-launcher ${posClass}`}
          aria-haspopup="dialog"
          aria-label={totalUnread > 0 ? `${label} — 안 읽은 메시지 ${totalUnread}개` : label}
          onClick={openPanel}
        >
          <ChatIcon />
          {label}
          {totalUnread > 0 ? (
            <span className="cd-launcher-badge" aria-hidden="true">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          ) : null}
        </button>
      ) : null}

      {open ? (
        <div
          ref={panelRef}
          className={`cd-panel ${posClass}`}
          role="dialog"
          aria-modal="false"
          aria-label={activeConv ? conversationName(activeConv, memberId) : title}
        >
          {activeConv ? (
            <ThreadView
              key={activeConv.id}
              client={client}
              conversation={activeConv}
              memberId={memberId}
              memberName={memberName}
              onBack={() => setActiveId(null)}
              onClose={closePanel}
            />
          ) : (
            <ListView
              title={title}
              phase={listPhase}
              conversations={conversations}
              memberId={memberId}
              onOpen={openConversation}
              onClose={closePanel}
              onRetry={() => loadConversations()}
            />
          )}
        </div>
      ) : null}
    </div>
  )
}

interface ListViewProps {
  title: string
  phase: ListPhase
  conversations: ConversationListItemDto[]
  memberId: string
  onOpen: (id: string) => void
  onClose: () => void
  onRetry: () => void
}

function ListView(props: ListViewProps): ReactElement {
  const { title, phase, conversations, memberId, onOpen, onClose, onRetry } = props
  return (
    <>
      <div className="cd-header">
        <div className="cd-header-title">
          <h2>{title}</h2>
        </div>
        <button type="button" className="cd-iconbtn" aria-label="닫기" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      {phase === 'loading' && conversations.length === 0 ? (
        <div className="cd-state" aria-busy="true">
          <div className="cd-spinner" />
          <p className="cd-state-text" style={{ marginTop: 14 }}>
            대화를 불러오는 중…
          </p>
        </div>
      ) : phase === 'error' ? (
        <div className="cd-state">
          <div className="cd-state-icon cd-err">
            <AlertIcon />
          </div>
          <h3 className="cd-state-title">불러오지 못했어요</h3>
          <p className="cd-state-text">네트워크 상태를 확인하고 다시 시도해 주세요.</p>
          <button type="button" className="cd-btn" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      ) : conversations.length === 0 ? (
        <div className="cd-state">
          <div className="cd-state-icon">
            <ChatIcon />
          </div>
          <h3 className="cd-state-title">아직 대화가 없어요</h3>
          <p className="cd-state-text">새 대화가 시작되면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <ul className="cd-list">
          {conversations.map((c) => {
            const name = conversationName(c, memberId)
            const hasUnread = c.unreadCount > 0
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="cd-conv"
                  onClick={() => onOpen(c.id)}
                  aria-label={hasUnread ? `${name} — 안 읽은 메시지 ${c.unreadCount}개` : name}
                >
                  <span className="cd-avatar" aria-hidden="true">
                    {c.kind === 'group' ? <GroupIcon /> : <PersonIcon />}
                  </span>
                  <span className="cd-conv-body">
                    <span className="cd-conv-top">
                      <span className="cd-conv-name">{name}</span>
                      {c.lastMessage ? (
                        <span className="cd-conv-time">{shortTime(c.lastMessage.createdAt)}</span>
                      ) : null}
                    </span>
                    <span className={`cd-conv-preview ${hasUnread ? 'cd-unread' : ''}`}>
                      {previewText(c)}
                    </span>
                  </span>
                  {hasUnread ? (
                    <span className="cd-badge" aria-hidden="true">
                      {c.unreadCount > 99 ? '99+' : c.unreadCount}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

interface ThreadViewProps {
  client: ChatClient
  conversation: ConversationListItemDto
  memberId: string
  memberName?: string
  onBack: () => void
  onClose: () => void
}
type ThreadPhase = 'loading' | 'ready' | 'error'

function ThreadView(props: ThreadViewProps): ReactElement {
  const { client, conversation, memberId, onBack, onClose } = props
  const conversationId = conversation.id

  const [phase, setPhase] = useState<ThreadPhase>('loading')
  const [messages, setMessages] = useState<MessageDto[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [typingMembers, setTypingMembers] = useState<string[]>([])
  const [onlineCount, setOnlineCount] = useState(0)
  const [readBy, setReadBy] = useState<Record<string, string | null>>({})
  const [liveMsg, setLiveMsg] = useState('')

  const roomRef = useRef<ConversationRoom | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const typingSentRef = useRef(false)
  const typingTimerRef = useRef<number | null>(null)

  const scrollToBottom = useCallback(() => {
    const el = threadRef.current
    if (el) el.scrollTo({ top: el.scrollHeight })
  }, [])

  useEffect(() => {
    let alive = true
    setPhase('loading')
    client
      .open(conversationId)
      .then((room) => {
        if (!alive) {
          void room.close()
          return
        }
        roomRef.current = room
        setMessages(room.messages)
        setHasMore(room.hasMore)
        setPhase('ready')
        room.onMessage((m) => {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
          if (m.senderMemberId !== memberId) {
            setLiveMsg(`${m.senderMemberId ?? '시스템'}: ${m.body}`)
            void client.markRead(conversationId, m.id).catch(() => undefined)
          }
        })
        room.onTyping((e) => {
          setTypingMembers((prev) =>
            e.typing
              ? prev.includes(e.memberId)
                ? prev
                : [...prev, e.memberId]
              : prev.filter((x) => x !== e.memberId)
          )
        })
        room.onRead((e) => {
          if (e.memberId === memberId) return
          setReadBy((prev) => ({ ...prev, [e.memberId]: e.lastReadMessageId }))
        })
        room.onPresence((count) => setOnlineCount(count))
        room.onMessageDeleted((e) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === e.messageId ? { ...m, deleted: true, body: '' } : m))
          )
        })
        void client.markRead(conversationId).catch(() => undefined)
      })
      .catch(() => {
        if (alive) setPhase('error')
      })
    return () => {
      alive = false
      const room = roomRef.current
      roomRef.current = null
      if (room) void room.close()
    }
  }, [client, conversationId, memberId])

  useEffect(() => {
    if (phase === 'ready') scrollToBottom()
  }, [messages.length, phase, scrollToBottom])

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
      if (typingSentRef.current) client.typing(conversationId, false)
    }
  }, [client, conversationId])

  const signalTyping = useCallback(() => {
    if (!typingSentRef.current) {
      typingSentRef.current = true
      client.typing(conversationId, true)
    }
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
    typingTimerRef.current = window.setTimeout(() => {
      typingSentRef.current = false
      client.typing(conversationId, false)
    }, 2500)
  }, [client, conversationId])

  const doSend = useCallback(() => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    if (typingSentRef.current) {
      typingSentRef.current = false
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
      client.typing(conversationId, false)
    }
    client
      .send(conversationId, body)
      .then(() => setDraft(''))
      .catch(() => setLiveMsg('메시지 전송에 실패했습니다.'))
      .finally(() => {
        setSending(false)
        composerRef.current?.focus()
      })
  }, [draft, sending, client, conversationId])

  const onComposerKey = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        doSend()
      }
    },
    [doSend]
  )

  const fetchOlder = useCallback(() => {
    const room = roomRef.current
    if (!room) return
    const el = threadRef.current
    const prevHeight = el?.scrollHeight ?? 0
    void room.fetchOlder().then((older) => {
      if (older.length === 0) {
        setHasMore(false)
        return
      }
      setMessages(room.messages)
      setHasMore(room.hasMore)
      window.setTimeout(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight
      }, 0)
    })
  }, [])

  const myLastMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!
      if (m.senderMemberId === memberId && !m.deleted) return m.id
    }
    return null
  }, [messages, memberId])

  const lastReadByOthers = useMemo(
    () => new Set(Object.values(readBy).filter(Boolean) as string[]),
    [readBy]
  )

  const headerName = conversationName(conversation, memberId)
  const subtitle =
    conversation.kind === 'group'
      ? onlineCount > 0
        ? `${onlineCount}명 접속 중`
        : `멤버 ${conversation.memberIds.length}명`
      : onlineCount > 1
        ? '접속 중'
        : '오프라인'
  const subOnline = onlineCount > (conversation.kind === 'group' ? 0 : 1)

  return (
    <>
      <div className="cd-header">
        <button type="button" className="cd-iconbtn" aria-label="대화 목록으로" onClick={onBack}>
          <BackIcon />
        </button>
        <div className="cd-header-title">
          <h2>{headerName}</h2>
          <p className={`cd-header-sub ${subOnline ? 'cd-online' : ''}`}>{subtitle}</p>
        </div>
        <button type="button" className="cd-iconbtn" aria-label="닫기" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      {phase === 'error' ? (
        <div className="cd-state">
          <div className="cd-state-icon cd-err">
            <AlertIcon />
          </div>
          <h3 className="cd-state-title">대화를 열 수 없어요</h3>
          <p className="cd-state-text">이 대화의 멤버가 아니거나 연결에 문제가 있습니다.</p>
          <button type="button" className="cd-btn" onClick={onBack}>
            목록으로
          </button>
        </div>
      ) : (
        <>
          <div className="cd-thread" ref={threadRef}>
            {phase === 'loading' ? (
              <div className="cd-state" aria-busy="true">
                <div className="cd-spinner" />
              </div>
            ) : (
              <>
                {hasMore ? (
                  <button type="button" className="cd-loadmore" onClick={fetchOlder}>
                    이전 메시지 더 보기
                  </button>
                ) : null}
                {messages.map((m, i) => {
                  const prev = messages[i - 1]
                  const showDay = !prev || !sameDate(prev.createdAt, m.createdAt)
                  return (
                    <MessageRow
                      key={m.id}
                      message={m}
                      mine={m.senderMemberId === memberId}
                      showDay={showDay}
                      showSender={conversation.kind === 'group'}
                      isMyLast={m.id === myLastMessageId}
                      readByOthers={lastReadByOthers.has(m.id)}
                    />
                  )
                })}
                {typingMembers.length > 0 ? (
                  <>
                    <div className="cd-typing" aria-hidden="true">
                      <span /> <span /> <span />
                    </div>
                    <p className="cd-typing-text">
                      {conversation.kind === 'group'
                        ? `${typingMembers.join(', ')} 님이 입력 중…`
                        : '입력 중…'}
                    </p>
                  </>
                ) : null}
              </>
            )}
          </div>

          <form
            className="cd-composer"
            onSubmit={(e) => {
              e.preventDefault()
              doSend()
            }}
          >
            <textarea
              ref={composerRef}
              value={draft}
              rows={1}
              placeholder="메시지를 입력하세요"
              aria-label="메시지 입력"
              onChange={(e) => {
                setDraft(e.target.value)
                signalTyping()
              }}
              onKeyDown={onComposerKey}
            />
            <button type="submit" className="cd-send" aria-label="보내기" disabled={!draft.trim() || sending}>
              <SendIcon />
            </button>
          </form>
        </>
      )}

      <div className="cd-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMsg}
      </div>
    </>
  )
}

interface MessageRowProps {
  message: MessageDto
  mine: boolean
  showDay: boolean
  showSender: boolean
  isMyLast: boolean
  readByOthers: boolean
}

function MessageRow(props: MessageRowProps): ReactElement {
  const { message: m, mine, showDay, showSender, isMyLast, readByOthers } = props
  const rowClass = m.system ? 'cd-system' : mine ? 'cd-mine' : 'cd-theirs'
  return (
    <>
      {showDay ? <div className="cd-day">{dayLabel(m.createdAt)}</div> : null}
      <div className={`cd-msg-row ${rowClass}`}>
        {!m.system && !mine && showSender ? <span className="cd-msg-sender">{m.senderMemberId}</span> : null}
        <div className={`cd-bubble ${m.deleted ? 'cd-deleted' : ''}`}>
          {m.deleted ? '삭제된 메시지입니다' : m.body}
          {!m.deleted && m.attachments.length > 0
            ? m.attachments.map((a, idx) => (
                <a key={`${a.url}-${idx}`} className="cd-attach" href={a.url} target="_blank" rel="noreferrer noopener">
                  📎 {a.name}
                </a>
              ))
            : null}
        </div>
        {!m.system ? (
          <span className="cd-msg-meta">
            {clockTime(m.createdAt)}
            {mine && isMyLast ? (
              <span
                className={`cd-receipt ${readByOthers ? 'cd-read' : ''}`}
                style={{ display: 'inline-flex' }}
                aria-label={readByOthers ? '읽음' : '전송됨'}
                title={readByOthers ? '읽음' : '전송됨'}
              >
                <CheckDoubleIcon />
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
    </>
  )
}

export { createChatClient, ChatDeskError, type ChatClient, type ChatClientOptions, type ConversationRoom }
