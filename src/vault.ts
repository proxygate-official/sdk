import nacl from 'tweetnacl';
import { decodeBase58 } from './base58.js';
import { base64ToBytes, buildAndSendDeposit } from './vault/instructions.js';
import { executeWithdraw, withdrawConfirm as withdrawConfirmFn } from './vault/withdraw.js';
import { ProxygateError } from './client/helpers.js';
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
 * Canonical bytes the receipt-ca signed (Phase 62). MUST byte-match the
 * gateway's `canonicalizeDelegation` — alphabetical keys, signature and
 * receipt_ca_pubkey excluded.
 */
function canonicalizeDelegation(d: {
  ephemeral_pubkey: string;
  not_after: number;
  not_before: number;
  purpose: string;
}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      ephemeral_pubkey: d.ephemeral_pubkey,
      not_after: d.not_after,
      not_before: d.not_before,
      purpose: d.purpose,
    }),
  );
}

/**
 * Client for interacting with the Proxygate non-custodial vault system.
 *
 * Provides methods for depositing USDC into per-buyer PDA vaults,
 * withdrawing with cooldown awareness, checking balance breakdown,
 * and verifying signed receipts from proxy calls.
 */
export class VaultClient {
  private readonly _delegate: VaultDelegate;
  private _platformPubkeyBytes: Uint8Array | null;
  private _receiptCaPubkeyB58: string | null;

  constructor(delegate: VaultDelegate) {
    this._delegate = delegate;
    this._platformPubkeyBytes = null;
    this._receiptCaPubkeyB58 = null;
  }

  /** Fetch /health once, caching both the legacy treasury pubkey and the
   * Phase 62 receipt-ca pin target. */
  private async _ensureHealthKeys(): Promise<void> {
    if (this._platformPubkeyBytes !== null && this._receiptCaPubkeyB58 !== null) return;
    const res =
      (await this._delegate.authenticatedRequest<{
        platform_pubkey?: string;
        receipt_ca_pubkey?: string;
      }>('GET', '/health')) ?? {};
    // Never clobber an already-resolved/pinned value (test seam + a prior
    // successful fetch); only fill what is still missing.
    if (this._platformPubkeyBytes === null && res.platform_pubkey) {
      this._platformPubkeyBytes = decodeBase58(res.platform_pubkey);
    }
    if (this._receiptCaPubkeyB58 === null) {
      this._receiptCaPubkeyB58 = res.receipt_ca_pubkey ?? '';
    }
  }

  private async _getPlatformPubkey(): Promise<Uint8Array> {
    await this._ensureHealthKeys();
    if (!this._platformPubkeyBytes) {
      throw new Error('Gateway did not return platform_pubkey in /health response');
    }
    return this._platformPubkeyBytes;
  }

  async balance(): Promise<VaultBalanceResponse> {
    return this._delegate.authenticatedRequest<VaultBalanceResponse>('GET', '/v1/balance');
  }

  async deposit(opts: VaultDepositOptions): Promise<VaultDepositResponse> {
    if (!this._delegate.secretKey) {
      throw new ProxygateError(
        { error: 'keypair_required', message: 'Deposit requires a keypair. Provide walletAddress + secretKey alongside apiKey for hybrid auth.' },
        0,
      );
    }
    if (opts.amount <= 0) throw new Error('Deposit amount must be greater than zero');
    const txSignature = await buildAndSendDeposit(opts, this._delegate.secretKey);
    return this._delegate.authenticatedRequest<VaultDepositResponse>(
      'POST',
      '/v1/deposit/confirm',
      { body: { tx_signature: txSignature } },
    );
  }

  async withdraw(opts?: VaultWithdrawOptions): Promise<VaultWithdrawCompleteResponse> {
    if (!this._delegate.secretKey) {
      throw new ProxygateError(
        { error: 'keypair_required', message: 'Withdraw requires a keypair. Provide walletAddress + secretKey alongside apiKey for hybrid auth.' },
        0,
      );
    }
    return executeWithdraw(this._delegate, opts);
  }

  async withdrawConfirm(txSignature: string): Promise<VaultWithdrawConfirmResponse> {
    return withdrawConfirmFn(this._delegate, txSignature);
  }

  async verifyReceipts(receipts: VaultReceipt[]): Promise<ReceiptVerificationResult[]> {
    await this._ensureHealthKeys();
    // Pinned Phase 62 trust anchor (empty when the gateway has not enabled
    // delegation — then only legacy v1 receipts are expected).
    const receiptCaPin = this._receiptCaPubkeyB58 ?? '';

    return receipts.map((receipt) => {
      try {
        const sig = base64ToBytes(receipt.signature);
        if (sig.length !== 64) {
          return { receipt, valid: false, reason: `Invalid signature length: expected 64 bytes, got ${sig.length}` };
        }

        // v2 — delegated ephemeral-key signature (Phase 62).
        if (receipt.receipt_version === 2 || receipt.delegation) {
          const d = receipt.delegation;
          if (!d) return { receipt, valid: false, reason: 'receipt_version 2 without delegation' };
          if (d.purpose !== 'proxygate-receipt') {
            return { receipt, valid: false, reason: `Unexpected delegation purpose: ${d.purpose}` };
          }
          if (receipt.timestamp < d.not_before || receipt.timestamp > d.not_after) {
            return { receipt, valid: false, reason: 'Receipt timestamp outside delegation validity window' };
          }
          if (receiptCaPin && d.receipt_ca_pubkey !== receiptCaPin) {
            return { receipt, valid: false, reason: 'delegation receipt_ca_pubkey does not match the pinned /health key' };
          }
          const caOk = nacl.sign.detached.verify(
            canonicalizeDelegation(d),
            base64ToBytes(d.signature),
            decodeBase58(d.receipt_ca_pubkey),
          );
          if (!caOk) return { receipt, valid: false, reason: 'Delegation signature (receipt-ca) invalid' };
          const ok = nacl.sign.detached.verify(
            canonicalizeReceipt(receipt),
            sig,
            decodeBase58(d.ephemeral_pubkey),
          );
          return { receipt, valid: ok, reason: ok ? undefined : 'Receipt signature (ephemeral key) invalid' };
        }

        // v1 — legacy treasury-KMS signature. Still the default emission
        // until the gateway flips GATEWAY_RECEIPT_DELEGATION on, so this is
        // NOT yet deprecated; a console.warn here would spam every current
        // consumer. The deprecation warning lands in a later minor once v2
        // becomes the default emitted format (SAFE-06).
        if (!this._platformPubkeyBytes) {
          return { receipt, valid: false, reason: 'Gateway did not return platform_pubkey for legacy v1 verification' };
        }
        const valid = nacl.sign.detached.verify(canonicalizeReceipt(receipt), sig, this._platformPubkeyBytes);
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
    // Treat an explicit pin as "health keys resolved" so verifyReceipts
    // does not also hit /health (test seam + offline verification).
    if (this._receiptCaPubkeyB58 === null) this._receiptCaPubkeyB58 = '';
  }

  /** @internal Pin the Phase 62 receipt-ca key (test seam / offline). */
  _setReceiptCaPubkey(pubkeyB58: string): void {
    this._receiptCaPubkeyB58 = pubkeyB58;
  }
}
