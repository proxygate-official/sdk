import nacl from 'tweetnacl';
import { decodeBase58 } from './base58.js';
import { base64ToBytes, buildAndSendDeposit } from './vault/instructions.js';
import { executeWithdraw, withdrawConfirm as withdrawConfirmFn } from './vault/withdraw.js';
import type {
  VaultDelegate,
  VaultBalanceResponse,
  VaultDepositResponse,
  VaultDepositOptions,
  VaultWithdrawOptions,
  VaultWithdrawCompleteResponse,
  VaultWithdrawConfirmResponse,
  VaultReceipt,
  ReceiptVerificationResult,
} from './types.js';

// Re-export constants for public API
export { VAULT_CONSTANTS } from './vault/constants.js';

/** Canonicalize a receipt payload to deterministic JSON bytes. */
function canonicalizeReceipt(receipt: VaultReceipt): Uint8Array {
  const canonical = JSON.stringify({
    amount: receipt.amount,
    buyer: receipt.buyer,
    request_id: receipt.request_id,
    seller: receipt.seller,
    timestamp: receipt.timestamp,
  });
  return new TextEncoder().encode(canonical);
}

/**
 * Client for interacting with the ProxyGate non-custodial vault system.
 *
 * Provides methods for depositing USDC into per-buyer PDA vaults,
 * withdrawing with cooldown awareness, checking balance breakdown,
 * and verifying signed receipts from proxy calls.
 */
export class VaultClient {
  private readonly _delegate: VaultDelegate;
  private _platformPubkeyBytes: Uint8Array | null;

  constructor(delegate: VaultDelegate) {
    this._delegate = delegate;
    this._platformPubkeyBytes = null;
  }

  private async _getPlatformPubkey(): Promise<Uint8Array> {
    if (this._platformPubkeyBytes) return this._platformPubkeyBytes;
    const res = await this._delegate.authenticatedRequest<{ platform_pubkey?: string }>('GET', '/health');
    if (!res.platform_pubkey) {
      throw new Error('Gateway did not return platform_pubkey in /health response');
    }
    this._platformPubkeyBytes = decodeBase58(res.platform_pubkey);
    return this._platformPubkeyBytes;
  }

  async balance(): Promise<VaultBalanceResponse> {
    return this._delegate.authenticatedRequest<VaultBalanceResponse>('GET', '/v1/balance');
  }

  async deposit(opts: VaultDepositOptions): Promise<VaultDepositResponse> {
    if (opts.amount <= 0) throw new Error('Deposit amount must be greater than zero');
    const txSignature = await buildAndSendDeposit(opts, this._delegate.secretKey);
    return this._delegate.authenticatedRequest<VaultDepositResponse>(
      'POST',
      '/v1/deposit/confirm',
      { body: { tx_signature: txSignature } },
    );
  }

  async withdraw(opts?: VaultWithdrawOptions): Promise<VaultWithdrawCompleteResponse> {
    return executeWithdraw(this._delegate, opts);
  }

  async withdrawConfirm(txSignature: string): Promise<VaultWithdrawConfirmResponse> {
    return withdrawConfirmFn(this._delegate, txSignature);
  }

  async verifyReceipts(receipts: VaultReceipt[]): Promise<ReceiptVerificationResult[]> {
    const pubkeyBytes = await this._getPlatformPubkey();
    return receipts.map((receipt) => {
      try {
        const messageBytes = canonicalizeReceipt(receipt);
        const signatureBytes = base64ToBytes(receipt.signature);
        if (signatureBytes.length !== 64) {
          return { receipt, valid: false, reason: `Invalid signature length: expected 64 bytes, got ${signatureBytes.length}` };
        }
        const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
        return { receipt, valid, reason: valid ? undefined : 'Signature verification failed' };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { receipt, valid: false, reason: `Verification error: ${message}` };
      }
    });
  }

  /** @internal */
  _setPlatformPubkey(pubkeyBytes: Uint8Array): void {
    this._platformPubkeyBytes = pubkeyBytes;
  }
}
