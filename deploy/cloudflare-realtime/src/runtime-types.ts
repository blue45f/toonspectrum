export type SqlValue =
  | ArrayBuffer
  | boolean
  | number
  | string
  | null;

export interface SqlCursorLike<Row extends Record<string, unknown>>
  extends Iterable<Row> {
  toArray(): Row[];
}

export interface SqlStorageLike {
  exec<Row extends Record<string, unknown>>(
    query: string,
    ...bindings: SqlValue[]
  ): SqlCursorLike<Row>;
}

export interface TransactionalSqlStorageLike {
  readonly sql: SqlStorageLike;
  transactionSync<T>(callback: () => T): T;
}

export interface DurableObjectStorageLike
  extends TransactionalSqlStorageLike {
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface HibernatableWebSocket extends WebSocket {
  deserializeAttachment(): unknown;
  serializeAttachment(value: unknown): void;
}

export interface WebSocketRequestResponsePairLike {
  readonly request: string;
  readonly response: string;
}

export interface DurableObjectStateLike {
  readonly storage: DurableObjectStorageLike;
  acceptWebSocket(webSocket: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): HibernatableWebSocket[];
  setWebSocketAutoResponse(
    pair: WebSocketRequestResponsePairLike | null,
  ): void;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

export type DurableObjectIdLike = object;

export interface DurableObjectStubLike {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
}

export interface RealtimeWorkerEnv {
  readonly REALTIME_ROOMS: DurableObjectNamespaceLike;
  readonly REALTIME_ACTORS: DurableObjectNamespaceLike;
  readonly REALTIME_TICKET_SECRET: string;
  readonly REALTIME_CONTROL_SECRET: string;
  readonly REALTIME_TICKET_ISSUER: string;
  readonly REALTIME_TICKET_AUDIENCE: string;
  readonly REALTIME_ALLOWED_ORIGINS?: string;
  readonly REALTIME_MAX_CONNECTIONS_PER_ROOM?: string;
  readonly REALTIME_MAX_CONNECTIONS_PER_ACTOR?: string;
  readonly REALTIME_MAX_BUFFERED_BYTES?: string;
  readonly REALTIME_MAX_REPLAY_EVENTS?: string;
  readonly REALTIME_MAX_RECEIPT_COUNT?: string;
  readonly REALTIME_MAX_RECEIPT_BYTES?: string;
  readonly REALTIME_EVENT_RETENTION_MS?: string;
  readonly REALTIME_CLEANUP_INTERVAL_MS?: string;
  readonly REALTIME_RATE_WINDOW_MS?: string;
  readonly REALTIME_RESUME_WINDOW_MS?: string;
  readonly REALTIME_RESUME_MAX_REQUESTS_PER_WINDOW?: string;
  readonly REALTIME_RESUME_MAX_BYTES_PER_WINDOW?: string;
  readonly REALTIME_PRESENCE_MAX_EVENTS_PER_WINDOW?: string;
  readonly REALTIME_PRESENCE_MAX_BYTES_PER_WINDOW?: string;
  readonly REALTIME_COMMENTS_MAX_EVENTS_PER_WINDOW?: string;
  readonly REALTIME_COMMENTS_MAX_BYTES_PER_WINDOW?: string;
  readonly REALTIME_SCREEN_MAX_EVENTS_PER_WINDOW?: string;
  readonly REALTIME_SCREEN_MAX_BYTES_PER_WINDOW?: string;
}

declare class WebSocketPair {
  readonly 0: WebSocket;
  readonly 1: WebSocket;
}

declare class WebSocketRequestResponsePair
  implements WebSocketRequestResponsePairLike
{
  constructor(request: string, response: string);
  readonly request: string;
  readonly response: string;
}

export function createWebSocketPair(): readonly [WebSocket, WebSocket] {
  const pair = new WebSocketPair();
  return [pair[0], pair[1]];
}

export function createWebSocketAutoResponsePair(
  request: string,
  response: string,
): WebSocketRequestResponsePairLike {
  return new WebSocketRequestResponsePair(request, response);
}
