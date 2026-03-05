import { describe, it, expect } from 'vitest';

describe('createTunnelClient', () => {
  it('exports createTunnelClient function', async () => {
    const { createTunnelClient } = await import('./tunnel.js');
    expect(typeof createTunnelClient).toBe('function');
  });

  it('returns TunnelClient interface with drain', async () => {
    const { createTunnelClient } = await import('./tunnel.js');
    const client = createTunnelClient({
      gatewayUrl: 'http://localhost:3001',
      walletAddress: 'testWallet',
      secretKey: new Uint8Array(64),
      services: [{ name: 'test', port: 3000 }],
    });
    expect(client).toHaveProperty('connect');
    expect(client).toHaveProperty('disconnect');
    expect(client).toHaveProperty('drain');
    expect(client).toHaveProperty('isConnected');
    expect(client.isConnected()).toBe(false);
  });

  it('disconnect is safe to call before connect', async () => {
    const { createTunnelClient } = await import('./tunnel.js');
    const client = createTunnelClient({
      gatewayUrl: 'http://localhost:3001',
      walletAddress: 'testWallet',
      secretKey: new Uint8Array(64),
      services: [{ name: 'test', port: 3000 }],
    });
    expect(() => client.disconnect()).not.toThrow();
  });

  it('drain resolves immediately when not connected', async () => {
    const { createTunnelClient } = await import('./tunnel.js');
    const client = createTunnelClient({
      gatewayUrl: 'http://localhost:3001',
      walletAddress: 'testWallet',
      secretKey: new Uint8Array(64),
      services: [{ name: 'test', port: 3000 }],
    });
    await expect(client.drain()).resolves.toBeUndefined();
  });
});
