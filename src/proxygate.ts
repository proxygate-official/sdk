import { ProxyGateClient } from './client.js';
import type { TunnelClient, ProxyGateServeOptions } from './types.js';

const DEFAULT_GATEWAY_URL = 'https://gateway.proxygate.ai';

/**
 * Top-level namespace for ProxyGate one-liner APIs.
 *
 * @example
 * ```ts
 * import { ProxyGate } from '@proxygate/sdk';
 *
 * await ProxyGate.serve({
 *   keypair: '~/.proxygate/keypair.json',
 *   services: [
 *     { name: 'code-review', port: 3000, docs: './openapi.yaml' },
 *   ],
 * });
 * ```
 */
export class ProxyGate {
  /**
   * Expose local services to the ProxyGate network in one call.
   * Creates a client, connects the tunnel, and starts forwarding requests.
   */
  static async serve(options: ProxyGateServeOptions): Promise<TunnelClient> {
    let client: ProxyGateClient;

    if (options.apiKey) {
      // API key auth — no keypair needed
      client = new ProxyGateClient({
        gatewayUrl: options.gatewayUrl ?? DEFAULT_GATEWAY_URL,
        apiKey: options.apiKey,
      });
    } else if (options.keypair) {
      // Wallet-sig auth via keypair file
      client = await ProxyGateClient.create({
        gatewayUrl: options.gatewayUrl ?? DEFAULT_GATEWAY_URL,
        keypairPath: options.keypair,
      });
    } else {
      throw new Error('ProxyGate.serve() requires either keypair or apiKey');
    }

    return client.serve(options.services, {
      onConnected: options.onConnected,
      onDisconnected: options.onDisconnected,
      onError: options.onError,
      onRequest: options.onRequest,
    });
  }
}
