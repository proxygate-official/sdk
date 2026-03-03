import nacl from 'tweetnacl';
import { decodeBase58 } from './base58';
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
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Well-known vault program and token addresses (devnet). */
export const VAULT_CONSTANTS = {
  PROGRAM_ID: '2KMNnDz1gog5CWgKvuHHXM4fCHRM8bdD2qaaNNitpC2W',
  USDC_MINT_DEVNET: 'FED9q6ZxwjiwHtQ3Rc3CJgpFqiME9txNgNbEdLLs3q2H',
  TOKEN_PROGRAM_ID: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ASSOCIATED_TOKEN_PROGRAM_ID: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  SYSTEM_PROGRAM_ID: '11111111111111111111111111111111',
} as const;

/**
 * Anchor discriminators (first 8 bytes of sha256("global:{instruction}")).
 * These are stable as long as the instruction names don't change.
 */
const DISCRIMINATORS = {
  deposit: Uint8Array.from([242, 35, 198, 137, 82, 225, 242, 182]),
  withdraw: Uint8Array.from([183, 18, 70, 156, 148, 109, 161, 34]),
} as const;

// Default Solana devnet RPC
const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';

// Default cooldown polling config
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_WAIT_MS = 120_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert base64 string to Uint8Array. */
function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode u64 as little-endian 8 bytes. */
function encodeU64LE(value: number | bigint): Uint8Array {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setBigUint64(0, BigInt(value), true);
  return new Uint8Array(buf);
}

/** Canonicalize a receipt payload to deterministic JSON bytes (alphabetical key order). */
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
 * Dynamically import @solana/web3.js. Throws a clear error if not installed.
 * This keeps Solana libs as optional peer dependencies.
 */
async function requireSolanaWeb3(): Promise<typeof import('@solana/web3.js')> {
  try {
    return await import('@solana/web3.js');
  } catch {
    throw new Error(
      'Install @solana/web3.js to use vault deposit/withdraw: npm install @solana/web3.js @solana/spl-token',
    );
  }
}

/**
 * Dynamically import @solana/spl-token. Throws a clear error if not installed.
 */
async function requireSplToken(): Promise<typeof import('@solana/spl-token')> {
  try {
    return await import('@solana/spl-token');
  } catch {
    throw new Error(
      'Install @solana/spl-token to use vault deposit/withdraw: npm install @solana/web3.js @solana/spl-token',
    );
  }
}

/** Sleep for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// VaultClient
// ---------------------------------------------------------------------------

/**
 * Client for interacting with the ProxyGate non-custodial vault system.
 *
 * Provides methods for depositing USDC into per-buyer PDA vaults,
 * withdrawing with cooldown awareness, checking balance breakdown,
 * and verifying signed receipts from proxy calls.
 *
 * @example
 * ```ts
 * // Via ProxyGateClient (recommended)
 * const balance = await client.vault.balance();
 * const deposit = await client.vault.deposit({ amount: 1_000_000 });
 *
 * // Verify receipts from proxy calls
 * const results = client.vault.verifyReceipts(receipts);
 * ```
 */
export class VaultClient {
  private readonly _delegate: VaultDelegate;

  /**
   * Platform public key bytes for receipt verification.
   * Fetched from gateway /health endpoint on first use, or set via `_setPlatformPubkey()`.
   */
  private _platformPubkeyBytes: Uint8Array | null;

  constructor(delegate: VaultDelegate) {
    this._delegate = delegate;
    this._platformPubkeyBytes = null;
  }

  /**
   * Fetch platform pubkey from gateway health endpoint (cached after first call).
   */
  private async _getPlatformPubkey(): Promise<Uint8Array> {
    if (this._platformPubkeyBytes) return this._platformPubkeyBytes;

    const res = await this._delegate.authenticatedRequest<{
      platform_pubkey?: string;
    }>('GET', '/health');

    if (!res.platform_pubkey) {
      throw new Error('Gateway did not return platform_pubkey in /health response');
    }

    this._platformPubkeyBytes = decodeBase58(res.platform_pubkey);
    return this._platformPubkeyBytes;
  }

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  /**
   * Get the vault balance breakdown for the authenticated wallet.
   *
   * Does NOT require @solana/web3.js -- uses gateway API only.
   *
   * @returns Balance with pending_settlement, available, and cooldown status.
   */
  async balance(): Promise<VaultBalanceResponse> {
    return this._delegate.authenticatedRequest<VaultBalanceResponse>(
      'GET',
      '/v1/balance',
    );
  }

  /**
   * Deposit USDC into the buyer's on-chain vault PDA.
   *
   * Builds and submits a Solana transaction, then confirms via gateway.
   * Requires @solana/web3.js and @solana/spl-token as peer dependencies.
   *
   * @param opts - Deposit options (amount in USDC base units, optional RPC URL).
   * @returns Deposit confirmation with updated balance and TX signature.
   */
  async deposit(opts: VaultDepositOptions): Promise<VaultDepositResponse> {
    if (opts.amount <= 0) {
      throw new Error('Deposit amount must be greater than zero');
    }

    const solanaWeb3 = await requireSolanaWeb3();
    const splToken = await requireSplToken();

    const {
      Connection,
      PublicKey,
      Keypair,
      Transaction,
      TransactionInstruction,
      sendAndConfirmTransaction,
    } = solanaWeb3;

    const rpcUrl = opts.rpcUrl ?? DEFAULT_RPC_URL;
    const connection = new Connection(rpcUrl, 'confirmed');

    // Derive keys
    const buyerKeypair = Keypair.fromSecretKey(this._delegate.secretKey);
    const buyerPubkey = buyerKeypair.publicKey;
    const programId = new PublicKey(VAULT_CONSTANTS.PROGRAM_ID);
    const usdcMint = new PublicKey(VAULT_CONSTANTS.USDC_MINT_DEVNET);
    const tokenProgramId = new PublicKey(VAULT_CONSTANTS.TOKEN_PROGRAM_ID);
    const associatedTokenProgramId = new PublicKey(
      VAULT_CONSTANTS.ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const systemProgramId = new PublicKey(VAULT_CONSTANTS.SYSTEM_PROGRAM_ID);

    // Derive PDAs
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), buyerPubkey.toBuffer()],
      programId,
    );
    const [vaultTokenPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_token'), buyerPubkey.toBuffer()],
      programId,
    );

    // Buyer's USDC associated token account
    const buyerAta = splToken.getAssociatedTokenAddressSync(
      usdcMint,
      buyerPubkey,
    );

    // Build deposit instruction data: discriminator (8 bytes) + amount (u64 LE)
    const data = new Uint8Array(16);
    data.set(DISCRIMINATORS.deposit, 0);
    data.set(encodeU64LE(opts.amount), 8);

    const depositIx = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: buyerPubkey, isSigner: true, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: vaultTokenPda, isSigner: false, isWritable: true },
        { pubkey: buyerAta, isSigner: false, isWritable: true },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: tokenProgramId, isSigner: false, isWritable: false },
        { pubkey: associatedTokenProgramId, isSigner: false, isWritable: false },
        { pubkey: systemProgramId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    });

    // Build and send transaction
    const tx = new Transaction().add(depositIx);
    const txSignature = await sendAndConfirmTransaction(
      connection,
      tx,
      [buyerKeypair],
    );

    // Confirm deposit with gateway
    const result = await this._delegate.authenticatedRequest<VaultDepositResponse>(
      'POST',
      '/v1/deposit/confirm',
      { body: { tx_signature: txSignature } },
    );

    return result;
  }

  /**
   * Withdraw USDC from the buyer's on-chain vault.
   *
   * Initiates cooldown via gateway, polls until ready, then requests a
   * platform co-signed withdraw transaction from the gateway, adds the
   * buyer's signature, and submits to Solana.
   * Requires @solana/web3.js as a peer dependency.
   *
   * @param opts - Withdraw options (amount, RPC URL, polling config).
   * @returns Withdraw result with TX signature and amount.
   */
  async withdraw(
    opts?: VaultWithdrawOptions,
  ): Promise<VaultWithdrawCompleteResponse> {
    // Step 1: Initiate cooldown via gateway
    interface WithdrawGatewayResponse {
      status: 'ready' | 'cooldown_started' | 'cooldown_active';
      message: string;
      cooldown_ms?: number;
      unsettled_calls?: number;
    }

    const withdrawResponse =
      await this._delegate.authenticatedRequest<WithdrawGatewayResponse>(
        'POST',
        '/v1/withdraw',
        { body: { amount: opts?.amount } },
      );

    // Step 2: Poll balance until cooldown is complete
    const pollInterval = opts?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const maxWait = opts?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;

    if (
      withdrawResponse.status === 'cooldown_started' ||
      withdrawResponse.status === 'cooldown_active'
    ) {
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        await sleep(pollInterval);

        const balanceCheck = await this._delegate.authenticatedRequest<VaultBalanceResponse>(
          'GET',
          '/v1/balance',
        );

        if (!balanceCheck.in_cooldown) {
          break;
        }

        if (Date.now() - startTime >= maxWait) {
          throw new Error(
            `Withdraw cooldown did not complete within ${maxWait}ms. ` +
            'Try again later or increase maxWaitMs.',
          );
        }
      }
    }

    // Step 3: Determine withdrawal amount
    const balanceForWithdraw = await this._delegate.authenticatedRequest<VaultBalanceResponse>(
      'GET',
      '/v1/balance',
    );
    const withdrawAmount = opts?.amount ?? balanceForWithdraw.available;

    if (withdrawAmount <= 0) {
      throw new Error('Withdraw amount must be greater than zero');
    }

    // Step 4: Request platform co-signed withdraw TX from gateway
    interface WithdrawSignResponse {
      transaction: string;
      amount: number;
    }

    const signResponse = await this._delegate.authenticatedRequest<WithdrawSignResponse>(
      'POST',
      '/v1/withdraw/sign',
      { body: { amount: withdrawAmount } },
    );

    // Step 5: Deserialize TX, add buyer signature, submit to Solana
    const solanaWeb3 = await requireSolanaWeb3();
    const { Connection, Keypair, Transaction } = solanaWeb3;

    const rpcUrl = opts?.rpcUrl ?? DEFAULT_RPC_URL;
    const connection = new Connection(rpcUrl, 'confirmed');
    const buyerKeypair = Keypair.fromSecretKey(this._delegate.secretKey);

    const txBuffer = base64ToBytes(signResponse.transaction);
    const tx = Transaction.from(Buffer.from(txBuffer));
    tx.partialSign(buyerKeypair);

    const txSignature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(txSignature, 'confirmed');

    // Step 6: Confirm withdrawal with gateway (update ledger)
    try {
      await this.withdrawConfirm(txSignature);
    } catch (err) {
      // Non-fatal: on-chain TX is source of truth
      // Gateway will catch up via reconciliation worker
      console.warn('[ProxyGate SDK] withdraw confirm failed (non-fatal):', err instanceof Error ? err.message : String(err));
    }

    return {
      tx_signature: txSignature,
      amount_withdrawn: withdrawAmount,
      status: 'complete' as const,
    };
  }

  /**
   * Confirm a completed on-chain withdrawal with the gateway.
   *
   * Called automatically by `withdraw()`. Use this standalone method
   * for recovery if the SDK crashed after the on-chain TX but before
   * the gateway was notified.
   *
   * @param txSignature - The Solana transaction signature.
   * @returns Withdraw confirm response with updated balance.
   */
  async withdrawConfirm(
    txSignature: string,
  ): Promise<VaultWithdrawConfirmResponse> {
    return this._delegate.authenticatedRequest<VaultWithdrawConfirmResponse>(
      'POST',
      '/v1/withdraw/confirm',
      { body: { tx_signature: txSignature } },
    );
  }

  /**
   * Verify signed receipts from proxy calls.
   *
   * Each receipt contains an ed25519 detached signature over the canonicalized
   * payload JSON (keys in alphabetical order). Verification uses the platform
   * public key.
   *
   * Does NOT require @solana/web3.js -- uses tweetnacl only.
   *
   * @param receipts - Array of signed receipts to verify.
   * @returns Verification results for each receipt.
   */
  async verifyReceipts(receipts: VaultReceipt[]): Promise<ReceiptVerificationResult[]> {
    const pubkeyBytes = await this._getPlatformPubkey();

    return receipts.map((receipt) => {
      try {
        const messageBytes = canonicalizeReceipt(receipt);
        const signatureBytes = base64ToBytes(receipt.signature);

        if (signatureBytes.length !== 64) {
          return {
            receipt,
            valid: false,
            reason: `Invalid signature length: expected 64 bytes, got ${signatureBytes.length}`,
          };
        }

        const valid = nacl.sign.detached.verify(
          messageBytes,
          signatureBytes,
          pubkeyBytes,
        );

        return {
          receipt,
          valid,
          reason: valid ? undefined : 'Signature verification failed',
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          receipt,
          valid: false,
          reason: `Verification error: ${message}`,
        };
      }
    });
  }

  // -------------------------------------------------------------------------
  // Testing helpers (not part of public API contract)
  // -------------------------------------------------------------------------

  /**
   * Override the platform public key used for receipt verification.
   * Only intended for testing -- production code should use the default.
   * @internal
   */
  _setPlatformPubkey(pubkeyBytes: Uint8Array): void {
    this._platformPubkeyBytes = pubkeyBytes;
  }
}
