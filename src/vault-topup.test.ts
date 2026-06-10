/**
 * Tests for vault.topupX402() — the x402 prepaid top-up helper.
 *
 * The on-chain step (buildAndSendDeposit) is module-mocked so every test
 * runs offline; the contract under test is the protocol choreography:
 * preflight challenge → local deposit → confirm, and the fail-fast paths
 * that must abort BEFORE any funds move on-chain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import nacl from 'tweetnacl';
import { encodeBase58 } from './base58';
import { ProxygateError } from './client/helpers';
import type { VaultDelegate, VaultDepositResponse } from './types';

const buildAndSendDeposit = vi.fn();
const sendRawTransaction = vi.fn();
const confirmTransaction = vi.fn();
const partialSign = vi.fn();
const validateGaslessDepositTx = vi.fn();

vi.mock('./vault/instructions.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./vault/instructions.js')>();
  return {
    ...original,
    buildAndSendDeposit: (...args: unknown[]) => buildAndSendDeposit(...args),
    // Minimal web3 surface the gasless path uses: Keypair + Connection.
    requireSolanaWeb3: async () => ({
      Keypair: {
        fromSecretKey: () => ({ publicKey: { toBase58: () => 'BuyerPubkey1111111111111111111111111111111' } }),
      },
      Connection: class {
        sendRawTransaction = sendRawTransaction;
        confirmTransaction = confirmTransaction;
      },
    }),
  };
});

vi.mock('./vault/gasless.js', () => ({
  validateGaslessDepositTx: (...args: unknown[]) => validateGaslessDepositTx(...args),
}));

// Import AFTER the mock so vault.ts binds the stubbed instruction builder.
const { VaultClient } = await import('./vault');

const MOCK_TX_SIG = 'x402-topup-tx-signature-abc';
const CHALLENGE_402 = new ProxygateError(
  { error: 'unknown', message: 'payment required' },
  402,
);

function createMockDelegate(
  overrides?: Partial<VaultDelegate>,
): VaultDelegate & { authenticatedRequest: ReturnType<typeof vi.fn> } {
  const keypair = nacl.sign.keyPair();
  return {
    authenticatedRequest: vi.fn(),
    secretKey: keypair.secretKey,
    walletAddress: encodeBase58(keypair.publicKey),
    gatewayUrl: 'https://gateway.test',
    ...overrides,
  };
}

describe('vault.topupX402()', () => {
  let delegate: ReturnType<typeof createMockDelegate>;
  let vault: InstanceType<typeof VaultClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    delegate = createMockDelegate();
    vault = new VaultClient(delegate);
    buildAndSendDeposit.mockResolvedValue(MOCK_TX_SIG);
    validateGaslessDepositTx.mockResolvedValue({ partialSign, serialize: () => new Uint8Array([1, 2, 3]) });
    sendRawTransaction.mockResolvedValue('gasless-tx-signature-xyz');
    confirmTransaction.mockResolvedValue({ value: { err: null } });
  });

  it('follows the full choreography: 402 preflight, local deposit, x402 confirm', async () => {
    const confirmResponse: VaultDepositResponse = {
      balance: 5_000_000,
      deposited: 1_000_000,
      tx_signature: MOCK_TX_SIG,
      currency: 'USDC',
    };
    delegate.authenticatedRequest
      .mockRejectedValueOnce(CHALLENGE_402)
      .mockResolvedValueOnce(confirmResponse);

    const result = await vault.topupX402({ amount: 1_000_000 });

    expect(delegate.authenticatedRequest).toHaveBeenNthCalledWith(1, 'GET', '/v1/x402/topup', {
      query: { amount: '1000000' },
    });
    expect(buildAndSendDeposit).toHaveBeenCalledWith({ amount: 1_000_000 }, delegate.secretKey);
    expect(delegate.authenticatedRequest).toHaveBeenNthCalledWith(2, 'POST', '/v1/x402/topup/confirm', {
      body: { tx_signature: MOCK_TX_SIG },
    });
    expect(result).toEqual(confirmResponse);
  });

  it('fails fast when the rail is disabled (503) — nothing moves on-chain', async () => {
    delegate.authenticatedRequest.mockRejectedValueOnce(
      new ProxygateError({ error: 'service_unavailable', message: 'rail off' }, 503),
    );
    await expect(vault.topupX402({ amount: 1_000_000 })).rejects.toMatchObject({
      code: 'service_unavailable',
      statusCode: 503,
    });
    expect(buildAndSendDeposit).not.toHaveBeenCalled();
  });

  it('fails fast on auth errors (403) from the preflight', async () => {
    delegate.authenticatedRequest.mockRejectedValueOnce(
      new ProxygateError({ error: 'invalid_request', message: 'Wallet authentication required' }, 403),
    );
    await expect(vault.topupX402({ amount: 1_000_000 })).rejects.toMatchObject({ statusCode: 403 });
    expect(buildAndSendDeposit).not.toHaveBeenCalled();
  });

  it('rethrows non-ProxygateError preflight failures (network)', async () => {
    delegate.authenticatedRequest.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(vault.topupX402({ amount: 1_000_000 })).rejects.toThrow('fetch failed');
    expect(buildAndSendDeposit).not.toHaveBeenCalled();
  });

  it('requires a keypair (bearer-only clients cannot move funds)', async () => {
    const bearerVault = new VaultClient(createMockDelegate({ secretKey: undefined }));
    await expect(bearerVault.topupX402({ amount: 1_000_000 })).rejects.toMatchObject({
      code: 'keypair_required',
    });
    expect(buildAndSendDeposit).not.toHaveBeenCalled();
  });

  it('rejects zero and negative amounts before any request', async () => {
    await expect(vault.topupX402({ amount: 0 })).rejects.toThrow('greater than zero');
    await expect(vault.topupX402({ amount: -5 })).rejects.toThrow('greater than zero');
    expect(delegate.authenticatedRequest).not.toHaveBeenCalled();
    expect(buildAndSendDeposit).not.toHaveBeenCalled();
  });

  it('passes the rpcUrl override through to the on-chain deposit', async () => {
    delegate.authenticatedRequest
      .mockRejectedValueOnce(CHALLENGE_402)
      .mockResolvedValueOnce({ balance: 1, deposited: 1, tx_signature: MOCK_TX_SIG, currency: 'USDC' });
    await vault.topupX402({ amount: 100, rpcUrl: 'https://rpc.example' });
    expect(buildAndSendDeposit).toHaveBeenCalledWith(
      { amount: 100, rpcUrl: 'https://rpc.example' },
      delegate.secretKey,
    );
  });

  it('surfaces confirm-side errors (e.g. duplicate signature) unchanged', async () => {
    delegate.authenticatedRequest
      .mockRejectedValueOnce(CHALLENGE_402)
      .mockRejectedValueOnce(new ProxygateError({ error: 'duplicate_deposit', message: 'already credited' }, 409));
    await expect(vault.topupX402({ amount: 100 })).rejects.toMatchObject({ code: 'duplicate_deposit' });
  });

  describe('gasless path (challenge carries depositTransaction)', () => {
    function gaslessChallenge(): ProxygateError {
      return new ProxygateError(
        { error: 'payment_required', message: 'payment required' },
        402,
        {
          x402Version: 1,
          accepts: [
            {
              scheme: 'exact',
              asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              depositTransaction: 'BASE64_PARTIAL_SIGNED_TX',
              extra: { feePayer: 'PlatformFeePayer', feeMicroUsdc: '5000' },
            },
          ],
        },
      );
    }

    it('validates, co-signs, sends raw, confirms, then confirms the top-up', async () => {
      const confirmResponse: VaultDepositResponse = {
        balance: 6_000_000,
        deposited: 1_000_000,
        tx_signature: 'gasless-tx-signature-xyz',
        currency: 'USDC',
      };
      delegate.authenticatedRequest
        .mockRejectedValueOnce(gaslessChallenge())
        .mockResolvedValueOnce(confirmResponse);

      const result = await vault.topupX402({ amount: 1_000_000 });

      // The local-build path must NOT run when a depositTransaction is served.
      expect(buildAndSendDeposit).not.toHaveBeenCalled();
      expect(validateGaslessDepositTx).toHaveBeenCalledWith('BASE64_PARTIAL_SIGNED_TX', {
        buyerPubkey: 'BuyerPubkey1111111111111111111111111111111',
        expectedAmount: 1_000_000,
        maxFeeMicroUsdc: 5000n,
        expectedMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      });
      expect(partialSign).toHaveBeenCalledTimes(1);
      expect(sendRawTransaction).toHaveBeenCalledTimes(1);
      expect(confirmTransaction).toHaveBeenCalledWith('gasless-tx-signature-xyz', 'confirmed');
      expect(delegate.authenticatedRequest).toHaveBeenNthCalledWith(2, 'POST', '/v1/x402/topup/confirm', {
        body: { tx_signature: 'gasless-tx-signature-xyz' },
      });
      expect(result).toEqual(confirmResponse);
    });

    it('defaults the fee ceiling to 0 when extra.feeMicroUsdc is absent', async () => {
      const challenge = new ProxygateError({ error: 'payment_required', message: 'pay' }, 402, {
        accepts: [{ asset: 'MintXYZ', depositTransaction: 'TX', extra: { feePayer: 'P' } }],
      });
      delegate.authenticatedRequest
        .mockRejectedValueOnce(challenge)
        .mockResolvedValueOnce({ balance: 1, deposited: 1, tx_signature: 'gasless-tx-signature-xyz', currency: 'USDC' });

      await vault.topupX402({ amount: 100 });
      expect(validateGaslessDepositTx).toHaveBeenCalledWith('TX', expect.objectContaining({ maxFeeMicroUsdc: 0n }));
    });

    it('propagates a validation rejection and never signs or sends', async () => {
      delegate.authenticatedRequest.mockRejectedValueOnce(gaslessChallenge());
      validateGaslessDepositTx.mockRejectedValueOnce(new Error('gasless deposit tx rejected: feePayer must not be the buyer'));

      await expect(vault.topupX402({ amount: 1_000_000 })).rejects.toThrow(/feePayer must not be the buyer/);
      expect(partialSign).not.toHaveBeenCalled();
      expect(sendRawTransaction).not.toHaveBeenCalled();
      // No confirm call to the gateway either.
      expect(delegate.authenticatedRequest).toHaveBeenCalledTimes(1);
    });

    it('takes the local-build path when the 402 challenge has no depositTransaction', async () => {
      delegate.authenticatedRequest
        .mockRejectedValueOnce(CHALLENGE_402) // raw is undefined → no accepts
        .mockResolvedValueOnce({ balance: 1, deposited: 1, tx_signature: MOCK_TX_SIG, currency: 'USDC' });

      await vault.topupX402({ amount: 1_000_000 });
      expect(buildAndSendDeposit).toHaveBeenCalledTimes(1);
      expect(validateGaslessDepositTx).not.toHaveBeenCalled();
    });
  });
});
