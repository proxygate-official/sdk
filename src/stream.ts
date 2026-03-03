import type { SSEEvent } from './types.js';

/**
 * Parse a server-sent events stream from a fetch Response into an async
 * generator of typed SSEEvent objects.
 *
 * Handles chunk boundaries correctly (partial lines are buffered until
 * a newline arrives). Multi-line `data:` fields are concatenated with `\n`.
 * The stream ends when a `data: [DONE]` sentinel is received or the
 * underlying ReadableStream closes.
 *
 * @example
 * ```ts
 * const res = await fetch(url, { headers: { accept: 'text/event-stream' } });
 * for await (const event of parseSSE(res)) {
 *   console.log(event.data);
 * }
 * ```
 */
export async function* parseSSE(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let currentEvent: Partial<SSEEvent> = {};

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Flush any remaining buffered event
        if (currentEvent.data !== undefined) {
          yield { data: currentEvent.data, event: currentEvent.event, id: currentEvent.id } as SSEEvent;
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Last element is the incomplete line (could be empty string if buffer ended on \n)
      buffer = lines.pop()!;

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          // Sentinel: [DONE] ends the stream
          if (data === '[DONE]') {
            return;
          }

          // Multi-line data: concatenate with newline
          if (currentEvent.data !== undefined) {
            currentEvent.data += '\n' + data;
          } else {
            currentEvent.data = data;
          }
        } else if (line.startsWith('event: ')) {
          currentEvent.event = line.slice(7);
        } else if (line.startsWith('id: ')) {
          currentEvent.id = line.slice(4);
        } else if (line === '') {
          // Empty line = event boundary
          if (currentEvent.data !== undefined) {
            yield {
              data: currentEvent.data,
              event: currentEvent.event,
              id: currentEvent.id,
            } as SSEEvent;
            currentEvent = {};
          }
        }
        // Lines starting with ':' are comments — ignore them
      }
    }
  } finally {
    reader.releaseLock();
  }
}
