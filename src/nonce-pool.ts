/**
 * NoncePool fetches a fresh nonce from the gateway for each authenticated
 * request. One nonce per request — no pre-fetching, no waste.
 */
export class NoncePool {
  private readonly gatewayUrl: string;
  private readonly walletAddress: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: {
    gatewayUrl: string;
    walletAddress: string;
    fetchFn?: typeof fetch;
  }) {
    this.gatewayUrl = opts.gatewayUrl;
    this.walletAddress = opts.walletAddress;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  /** Acquire a nonce for signing. Fetches one from the gateway. */
  async acquire(): Promise<string> {
    const url = `${this.gatewayUrl}/v1/nonce?wallet=${encodeURIComponent(this.walletAddress)}`;
    const res = await this.fetchFn(url);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Nonce fetch failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { nonce: string };
    return json.nonce;
  }

  /** No-op (kept for API compatibility). */
  drain(): void {
    // Nothing to drain — no pool
  }
}
