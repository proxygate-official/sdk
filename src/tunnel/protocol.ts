import type { TunnelServiceConfig } from '../types.js';

/** Register message sent on connection open. */
export interface TunnelRegisterMessage {
  type: 'register';
  services: TunnelServiceConfig[];
}

/** Server confirms registration with listing info. */
export interface TunnelRegisteredMessage {
  type: 'registered';
  listings: Array<{ id: string; service: string; endpoint: string }>;
}

/** Proxied request from gateway to tunnel agent. */
export interface TunnelRequestMessage {
  type: 'request';
  request_id: string;
  service: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string; // base64-encoded
}

/** Full buffered response from agent to gateway. */
export interface TunnelResponseMessage {
  type: 'response';
  request_id: string;
  status: number;
  headers: Record<string, string>;
  body: string; // base64-encoded
}

/** SSE streaming chunk from agent to gateway. */
export interface TunnelStreamChunkMessage {
  type: 'stream_chunk';
  request_id: string;
  data: string; // base64-encoded chunk
}

/** End of SSE stream from agent to gateway. */
export interface TunnelStreamEndMessage {
  type: 'stream_end';
  request_id: string;
  status: number;
  headers: Record<string, string>;
}

/** Error message (sent in either direction). */
export interface TunnelErrorMessage {
  type: 'error';
  request_id?: string;
  error: string;
  code?: string;
}

/** Server-to-agent ping. */
export interface TunnelPingMessage {
  type: 'ping';
  ts: number;
}

/** Agent-to-server pong. */
export interface TunnelPongMessage {
  type: 'pong';
  ts: number;
}

/** Server confirms drain complete. */
export interface TunnelDrainedMessage {
  type: 'drained';
}

/** Union of all messages the agent can receive. */
export type IncomingMessage =
  | TunnelRegisteredMessage
  | TunnelRequestMessage
  | TunnelPingMessage
  | TunnelDrainedMessage
  | TunnelErrorMessage;
