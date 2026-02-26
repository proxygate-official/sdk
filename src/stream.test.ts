import { describe, it, expect } from 'vitest';
import { parseSSE } from './stream';

/** Create a mock Response with a ReadableStream body from string chunks. */
function mockResponse(...chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream' },
  });
}

/** Collect all events from a parseSSE generator. */
async function collectEvents(response: Response): Promise<Array<{ data: string; event?: string; id?: string }>> {
  const events: Array<{ data: string; event?: string; id?: string }> = [];
  for await (const event of parseSSE(response)) {
    events.push(event);
  }
  return events;
}

describe('parseSSE', () => {
  it('parses a basic SSE event', async () => {
    const res = mockResponse('data: {"text":"hello"}\n\n');
    const events = await collectEvents(res);

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('{"text":"hello"}');
  });

  it('parses multiple events in sequence', async () => {
    const res = mockResponse('data: first\n\ndata: second\n\n');
    const events = await collectEvents(res);

    expect(events).toHaveLength(2);
    expect(events[0].data).toBe('first');
    expect(events[1].data).toBe('second');
  });

  it('parses event with event field', async () => {
    const res = mockResponse('event: message\ndata: test\n\n');
    const events = await collectEvents(res);

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('message');
    expect(events[0].data).toBe('test');
  });

  it('parses event with id field', async () => {
    const res = mockResponse('id: 42\ndata: test\n\n');
    const events = await collectEvents(res);

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('42');
    expect(events[0].data).toBe('test');
  });

  it('stops at [DONE] signal', async () => {
    const res = mockResponse('data: {"text":"hello"}\n\ndata: [DONE]\n\n');
    const events = await collectEvents(res);

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('{"text":"hello"}');
  });

  it('reconstructs events split across chunk boundaries', async () => {
    const res = mockResponse('data: {"text"', ':"hello"}\n\n');
    const events = await collectEvents(res);

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('{"text":"hello"}');
  });

  it('parses multi-line data fields', async () => {
    const res = mockResponse('data: line1\ndata: line2\n\n');
    const events = await collectEvents(res);

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('line1\nline2');
  });

  it('skips empty lines before events', async () => {
    const res = mockResponse('\n\ndata: test\n\n');
    const events = await collectEvents(res);

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('test');
  });

  it('handles event split across three chunks', async () => {
    const res = mockResponse('da', 'ta: hel', 'lo\n\n');
    const events = await collectEvents(res);

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('hello');
  });

  it('flushes buffered event when stream ends after data line with newline but no blank line', async () => {
    // Stream ends after data line with newline but no blank line terminator
    // The data line is complete (ends with \n) so it gets parsed, and the
    // flush on done emits the event
    const res = mockResponse('data: final\n');
    const events = await collectEvents(res);

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('final');
  });

  it('does not emit incomplete lines without newline at stream end', async () => {
    // Stream ends mid-line without a newline - the line is still in the buffer
    // and never gets parsed as a complete SSE field
    const res = mockResponse('data: incomplete');
    const events = await collectEvents(res);

    expect(events).toHaveLength(0);
  });

  it('handles all fields combined', async () => {
    const res = mockResponse('id: 99\nevent: update\ndata: payload\n\n');
    const events = await collectEvents(res);

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('99');
    expect(events[0].event).toBe('update');
    expect(events[0].data).toBe('payload');
  });
});
