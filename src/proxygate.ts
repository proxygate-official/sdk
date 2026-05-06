import { ProxygateClient } from './client.js';
import type { TunnelClient, ProxygateServeOptions } from './types.js';

const DEFAULT_GATEWAY_URL = 'https://gateway.proxygate.ai';

/**
 * Top-level namespace for Proxygate one-liner APIs.
 *
 * @example
 * ```ts
 * import { Proxygate } from '@proxygate/sdk';
 *
 * await Proxygate.serve({
 *   keypair: '~/.proxygate/keypair.json',
 *   services: [
 *     { name: 'code-review', port: 3000, docs: './openapi.yaml' },
 *   ],
 * });
 * ```
 */
export class Proxygate {
  /**
   * Expose local services to the Proxygate network in one call.
   * Creates a client, connects the tunnel, and starts forwarding requests.
   */
  static async serve(options: ProxygateServeOptions): Promise<TunnelClient> {
    let client: ProxygateClient;

    if (options.apiKey) {
      // API key auth — no keypair needed
      client = new ProxygateClient({
        gatewayUrl: options.gatewayUrl ?? DEFAULT_GATEWAY_URL,
        apiKey: options.apiKey,
      });
    } else if (options.keypair) {
      // Wallet-sig auth via keypair file
      client = await ProxygateClient.create({
        gatewayUrl: options.gatewayUrl ?? DEFAULT_GATEWAY_URL,
        keypairPath: options.keypair,
      });
    } else {
      throw new Error('Proxygate.serve() requires either keypair or apiKey');
    }

    return client.serve(options.services, {
      onConnected: options.onConnected,
      onDisconnected: options.onDisconnected,
      onError: options.onError,
      onRequest: options.onRequest,
    });
  }
}
