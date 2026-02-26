import { describe, it, expect, vi } from 'vitest';
import { createServiceChain } from './proxy-chain';
import type { ProxyExecutor } from './proxy-chain';

function createMockExecutor(): ProxyExecutor {
  return {
    request: vi.fn().mockResolvedValue(new Response('ok')),
    streamRequest: vi.fn(function* () {
      // Empty generator for testing
    }) as unknown as ProxyExecutor['streamRequest'],
  };
}

describe('createServiceChain', () => {
  describe('path accumulation', () => {
    it('accumulates path segments via property access', async () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      await (chain as any).openai.v1.chat.completions.create({ model: 'gpt-4' });

      expect(executor.request).toHaveBeenCalledWith(
        'POST',
        ['openai', 'v1', 'chat', 'completions'],
        { body: { model: 'gpt-4' } },
      );
    });
  });

  describe('terminal methods', () => {
    it('GET via .get()', async () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      await (chain as any).openai.v1.models.get();

      expect(executor.request).toHaveBeenCalledWith(
        'GET',
        ['openai', 'v1', 'models'],
        undefined,
      );
    });

    it('POST via .post()', async () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      await (chain as any).service.path.post({ data: 1 });

      expect(executor.request).toHaveBeenCalledWith(
        'POST',
        ['service', 'path'],
        { body: { data: 1 } },
      );
    });

    it('POST via .create()', async () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      await (chain as any).service.path.create({ data: 1 });

      expect(executor.request).toHaveBeenCalledWith(
        'POST',
        ['service', 'path'],
        { body: { data: 1 } },
      );
    });

    it('PUT via .put()', async () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      await (chain as any).a.b.put({ x: 1 });

      expect(executor.request).toHaveBeenCalledWith(
        'PUT',
        ['a', 'b'],
        { body: { x: 1 } },
      );
    });

    it('PATCH via .patch()', async () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      await (chain as any).a.b.patch({ x: 1 });

      expect(executor.request).toHaveBeenCalledWith(
        'PATCH',
        ['a', 'b'],
        { body: { x: 1 } },
      );
    });

    it('DELETE via .delete()', async () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      await (chain as any).a.b.delete();

      expect(executor.request).toHaveBeenCalledWith(
        'DELETE',
        ['a', 'b'],
        undefined,
      );
    });

    it('stream via .stream()', () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      (chain as any).a.b.stream({ model: 'gpt-4' });

      expect(executor.streamRequest).toHaveBeenCalledWith(
        'POST',
        ['a', 'b'],
        { body: { model: 'gpt-4' } },
      );
    });
  });

  describe('edge cases - thenable and symbol traps', () => {
    it('then returns undefined (prevents infinite recursion on await)', () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      expect((chain as any).then).toBeUndefined();
    });

    it('toJSON returns undefined', () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      expect((chain as any).toJSON).toBeUndefined();
    });

    it('Symbol.toPrimitive returns undefined', () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      expect((chain as any)[Symbol.toPrimitive]).toBeUndefined();
    });

    it('Symbol.iterator returns undefined', () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      expect((chain as any)[Symbol.iterator]).toBeUndefined();
    });

    it('Symbol.asyncIterator returns undefined', () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      expect((chain as any)[Symbol.asyncIterator]).toBeUndefined();
    });

    it('arbitrary symbol returns undefined', () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      expect((chain as any)[Symbol('test')]).toBeUndefined();
    });

    it('inspect returns undefined', () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      expect((chain as any).inspect).toBeUndefined();
    });

    it('nodeInspect returns undefined', () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      expect((chain as any).nodeInspect).toBeUndefined();
    });
  });

  describe('terminal method with options', () => {
    it('GET with request options', async () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      await (chain as any).svc.endpoint.get({ headers: { 'x-custom': 'val' } });

      expect(executor.request).toHaveBeenCalledWith(
        'GET',
        ['svc', 'endpoint'],
        { headers: { 'x-custom': 'val' } },
      );
    });

    it('POST with body and options', async () => {
      const executor = createMockExecutor();
      const chain = createServiceChain(executor);

      await (chain as any).svc.endpoint.post({ key: 'val' }, { headers: { 'x-custom': 'val' } });

      expect(executor.request).toHaveBeenCalledWith(
        'POST',
        ['svc', 'endpoint'],
        { body: { key: 'val' }, headers: { 'x-custom': 'val' } },
      );
    });
  });
});
