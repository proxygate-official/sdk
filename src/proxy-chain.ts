import type { ProxyChain, RequestOptions, SSEEvent } from './types';

/** Executor interface used by the proxy chain to dispatch requests. */
export interface ProxyExecutor {
  request(
    method: string,
    segments: string[],
    opts?: RequestOptions & { body?: unknown },
  ): Promise<Response>;
  streamRequest(
    method: string,
    segments: string[],
    opts?: RequestOptions & { body?: unknown },
  ): AsyncGenerator<SSEEvent>;
}

/** Terminal method names that dispatch HTTP requests instead of extending the path. */
const TERMINAL_METHODS = new Set([
  'get',
  'post',
  'create',
  'put',
  'patch',
  'delete',
  'stream',
]);

/** Properties that must return undefined to prevent thenable/serialization traps. */
const PASSTHROUGH_PROPS = new Set<string | symbol>([
  'then',
  'toJSON',
  'inspect',
  'nodeInspect',
  Symbol.toPrimitive,
  Symbol.iterator,
  Symbol.asyncIterator,
]);

/**
 * Create a recursive ES6 Proxy-based service chain that builds URL path
 * segments via property access and exposes terminal HTTP methods.
 *
 * @example
 * ```ts
 * const svc = createServiceChain(executor);
 * // GET /proxy/openai/v1/models
 * await svc.openai.v1.models.get();
 * // POST /proxy/openai/v1/chat/completions (streaming)
 * for await (const event of svc.openai.v1.chat.completions.stream({ model: 'gpt-4' })) { ... }
 * ```
 */
export function createServiceChain(
  executor: ProxyExecutor,
  segments: string[] = [],
): ProxyChain {
  const handler: ProxyHandler<object> = {
    get(_target: object, prop: string | symbol): unknown {
      // Symbols and special props return undefined to avoid infinite recursion
      if (typeof prop === 'symbol' || PASSTHROUGH_PROPS.has(prop)) {
        return undefined;
      }

      const name = prop as string;

      // Terminal methods dispatch requests
      if (TERMINAL_METHODS.has(name)) {
        switch (name) {
          case 'get':
            return (opts?: RequestOptions) =>
              executor.request('GET', segments, opts);
          case 'post':
            return (body: unknown, opts?: RequestOptions) =>
              executor.request('POST', segments, { ...opts, body });
          case 'create':
            return (body: unknown, opts?: RequestOptions) =>
              executor.request('POST', segments, { ...opts, body });
          case 'put':
            return (body: unknown, opts?: RequestOptions) =>
              executor.request('PUT', segments, { ...opts, body });
          case 'patch':
            return (body: unknown, opts?: RequestOptions) =>
              executor.request('PATCH', segments, { ...opts, body });
          case 'delete':
            return (opts?: RequestOptions) =>
              executor.request('DELETE', segments, opts);
          case 'stream':
            return (body: unknown, opts?: RequestOptions) =>
              executor.streamRequest('POST', segments, { ...opts, body });
        }
      }

      // Default: extend the path and recurse
      return createServiceChain(executor, [...segments, name]);
    },
  };

  // The Proxy intercepts all property access, so the target object is never
  // accessed directly. The empty object is just a placeholder.
  const target = {} as Record<string, unknown>;
  return new Proxy(target, handler) as unknown as ProxyChain;
}
