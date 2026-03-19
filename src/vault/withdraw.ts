import { base64ToBytes, requireSolanaWeb3, sleep } from './instructions.js';
import { DEFAULT_POLL_INTERVAL_MS, DEFAULT_MAX_WAIT_MS } from './constants.js';
import type {
  VaultDelegate,
  VaultBalanceResponse,
  VaultWithdrawOptions,
  VaultWithdrawCompleteResponse,
  VaultWithdrawConfirmResponse,
} from '../types.js';

/**
 * Execute the full withdraw flow: cooldown polling, platform co-sign,
 * buyer sign, on-chain submit, and gateway confirmation.
 */
export async function executeWithdraw(
  delegate: VaultDelegate,
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
    await delegate.authenticatedRequest<WithdrawGatewayResponse>(
      'POST',
      '/v1/withdraw',
      { body: { amount: opts?.amount } },
    );

  // Step 2: Poll balance until cooldown is complete
  const pollInterval = opts?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxWait = opts?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;

  {
    const startTime = Date.now();
    const onProgress = opts?.onProgress;

    onProgress?.({
      status: withdrawResponse.status,
      remainingMs: withdrawResponse.cooldown_ms ?? 60_000,
      elapsed: 0,
    });

    while (Date.now() - startTime < maxWait) {
      await sleep(pollInterval);

      const balanceCheck = await delegate.authenticatedRequest<VaultBalanceResponse>(
        'GET',
        '/v1/balance',
      );

      if (!balanceCheck.in_cooldown) break;

      const elapsed = Date.now() - startTime;
      onProgress?.({
        status: 'cooldown_active',
        remainingMs: Math.max(0, (withdrawResponse.cooldown_ms ?? 60_000) - elapsed),
        elapsed,
      });

      if (elapsed >= maxWait) {
        throw new Error(
          `Withdraw cooldown did not complete within ${maxWait}ms. ` +
          'Try again later or increase maxWaitMs.',
        );
      }
    }
  }

  // Step 3: Determine withdrawal amount
  const balanceForWithdraw = await delegate.authenticatedRequest<VaultBalanceResponse>(
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

  const signResponse = await delegate.authenticatedRequest<WithdrawSignResponse>(
    'POST',
    '/v1/withdraw/sign',
    { body: { amount: withdrawAmount } },
  );

  // Step 5: Deserialize TX, add buyer signature, submit to Solana
  const solanaWeb3 = await requireSolanaWeb3();
  const { Connection, Keypair, Transaction } = solanaWeb3;

  const rpcUrl = opts?.rpcUrl ?? 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const buyerKeypair = Keypair.fromSecretKey(delegate.secretKey!);

  const txBuffer = base64ToBytes(signResponse.transaction);
  const tx = Transaction.from(Buffer.from(txBuffer));
  tx.partialSign(buyerKeypair);

  const txSignature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(txSignature, 'confirmed');

  // Step 6: Confirm withdrawal with gateway
  try {
    await withdrawConfirm(delegate, txSignature);
  } catch (err) {
    console.warn('[ProxyGate SDK] withdraw confirm failed (non-fatal):', err instanceof Error ? err.message : String(err));
  }

  return {
    tx_signature: txSignature,
    amount_withdrawn: withdrawAmount,
    status: 'complete' as const,
  };
}

/** Confirm a completed on-chain withdrawal with the gateway. */
export function withdrawConfirm(
  delegate: VaultDelegate,
  txSignature: string,
): Promise<VaultWithdrawConfirmResponse> {
  return delegate.authenticatedRequest<VaultWithdrawConfirmResponse>(
    'POST',
    '/v1/withdraw/confirm',
    { body: { tx_signature: txSignature } },
  );
}
