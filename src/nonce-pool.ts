/**
 * NoncePool pre-fetches nonces from the gateway to avoid blocking on
 * sequential fetch-per-request when making concurrent authenticated calls.
 *
 * The pool maintains a buffer of nonces and refills in the background
 * when the count drops below a low-watermark threshold. Refilling is
 * sequential (not parallel) to respect the gateway's rate limit.
 */
export class NoncePool {
  private readonly gatewayUrl: string;
  private readonly walletAddress: string;
  private readonly fetchFn: typeof fetch;

  private pool: string[] = [];
  private refilling = false;
  private readonly maxSize = 5;
  private readonly lowWatermark = 2;

  constructor(opts: {
    gatewayUrl: string;
    walletAddress: string;
    fetchFn?: typeof fetch;
  }) {
    this.gatewayUrl = opts.gatewayUrl;
    this.walletAddress = opts.walletAddress;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  /**
   * Acquire a nonce for signing. If the pool is empty, fetches one
   * synchronously. Triggers background refill when pool is low.
   */
  async acquire(): Promise<string> {
    if (this.pool.length === 0) {
      return this.fetchNonce();
    }

    const nonce = this.pool.shift()!;

    if (this.pool.length < this.lowWatermark) {
      void this.maybeRefill();
    }

    return nonce;
  }

  /**
   * Refill the pool up to maxSize. Fetches nonces sequentially to
   * respect the gateway's rate limit. Silently stops on error.
   */
  private async maybeRefill(): Promise<void> {
    if (this.refilling || this.pool.length >= this.maxSize) {
      return;
    }

    this.refilling = true;
    try {
      while (this.pool.length < this.maxSize) {
        const nonce = await this.fetchNonce();
        this.pool.push(nonce);
      }
    } catch {
      // Rate-limited or network error — stop refilling, use what we have
    } finally {
      this.refilling = false;
    }
  }

  /**
   * Fetch a single nonce from the gateway.
   */
  private async fetchNonce(): Promise<string> {
    const url = `${this.gatewayUrl}/v1/nonce?wallet=${encodeURIComponent(this.walletAddress)}`;
    const res = await this.fetchFn(url);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Nonce fetch failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { nonce: string };
    return json.nonce;
  }

  /** Empty the pool (for cleanup or testing). */
  drain(): void {
    this.pool.length = 0;
  }
}
