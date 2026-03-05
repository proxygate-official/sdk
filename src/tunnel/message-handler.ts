import type { TunnelServiceConfig } from '../types.js';
import type {
  TunnelRequestMessage,
  TunnelResponseMessage,
  TunnelStreamChunkMessage,
  TunnelStreamEndMessage,
  TunnelErrorMessage,
} from './protocol.js';

// Re-export protocol types for consumers
export type {
  TunnelRegisterMessage,
  TunnelRegisteredMessage,
  TunnelRequestMessage,
  TunnelResponseMessage,
  TunnelStreamChunkMessage,
  TunnelStreamEndMessage,
  TunnelErrorMessage,
  TunnelPingMessage,
  TunnelPongMessage,
  TunnelDrainedMessage,
  IncomingMessage,
} from './protocol.js';

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/** Convert Uint8Array to base64 string. */
export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode base64 string to Uint8Array. */
export function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Service resolution
// ---------------------------------------------------------------------------

/** Find which local port to forward to for a given service name. */
export function resolveServicePort(
  services: TunnelServiceConfig[],
  serviceName: string,
): number | undefined {
  const svc = services.find((s) => s.name === serviceName);
  return svc?.port;
}

/** Check if a response is SSE streaming. */
export function isSSE(headers: Headers): boolean {
  const ct = headers.get('content-type') ?? '';
  return ct.includes('text/event-stream');
}

// ---------------------------------------------------------------------------
// Request forwarding
// ---------------------------------------------------------------------------

/**
 * Handle a proxied request by forwarding to the local service and
 * sending the response (or stream) back via the send callback.
 */
export async function handleRequest(
  msg: TunnelRequestMessage,
  services: TunnelServiceConfig[],
  send: (msg: unknown) => void,
  onRequest?: (requestId: string, service: string, path: string) => void,
): Promise<void> {
  const { request_id, service, method, path, headers, body } = msg;
  onRequest?.(request_id, service, path);

  const port = resolveServicePort(services, service);
  if (port === undefined) {
    send({ type: 'error', request_id, error: `Unknown service: ${service}`, code: 'UNKNOWN_SERVICE' } satisfies TunnelErrorMessage);
    return;
  }

  const url = `http://localhost:${port}${path}`;

  try {
    const fetchHeaders: Record<string, string> = { ...headers };
    delete fetchHeaders['host'];
    delete fetchHeaders['connection'];
    delete fetchHeaders['transfer-encoding'];

    const fetchInit: RequestInit = { method, headers: fetchHeaders };
    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchInit.body = fromBase64(body) as unknown as BodyInit;
    }

    const res = await fetch(url, fetchInit);

    if (isSSE(res.headers) && res.body) {
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { resHeaders[k] = v; });
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          send({ type: 'stream_chunk', request_id, data: toBase64(value) } satisfies TunnelStreamChunkMessage);
        }
      } finally { reader.releaseLock(); }
      send({ type: 'stream_end', request_id, status: res.status, headers: resHeaders } satisfies TunnelStreamEndMessage);
    } else {
      const resBody = new Uint8Array(await res.arrayBuffer());
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { resHeaders[k] = v; });
      send({ type: 'response', request_id, status: res.status, headers: resHeaders, body: toBase64(resBody) } satisfies TunnelResponseMessage);
    }
  } catch (err) {
    send({ type: 'error', request_id, error: err instanceof Error ? err.message : String(err), code: 'UPSTREAM_ERROR' } satisfies TunnelErrorMessage);
  }
}
