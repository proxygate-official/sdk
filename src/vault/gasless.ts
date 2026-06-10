/**
 * Gasless x402 top-up: client-side validation of a SERVER-PROVIDED deposit
 * transaction before the buyer signs it.
 *
 * When a buyer's vault PDA is uninitialized AND the buyer holds no SOL, the
 * gateway returns a 402 challenge whose `accepts[0].depositTransaction` is a
 * base64, partially-signed (by the platform fee payer) escrow `deposit` tx.
 * The buyer co-signs it so the platform pays the gas. Because the SDK is about
 * to sign a transaction it did not build, every instruction is whitelisted
 * here first: anything outside the expected (system rent transfer, USDC fee
 * transfer, escrow deposit) shape is rejected with a clear error naming the
 * violated rule. The per-instruction rules live in ./gasless-rules.js.
 *
 * Solana libs are optional peer deps — resolved via the dynamic-import seam in
 * ./instructions.js so the SDK loads without them.
 */
import { VAULT_CONSTANTS } from './constants.js';
import { requireSolanaWeb3, requireSplToken } from './instructions.js';
import { validateSystemTransfer, validateTokenFeeTransfer, validateEscrowDeposit } from './gasless-rules.js';

type Web3 = Awaited<ReturnType<typeof requireSolanaWeb3>>;
type DecodedTx = InstanceType<Web3['Transaction']>;

/** Inputs that bound what the server-provided deposit tx is allowed to do. */
export interface GaslessValidateOptions {
  /** The buyer's own public key (base58). Must NOT be the fee payer. */
  buyerPubkey: string;
  /** Exact deposit amount the escrow instruction must move (micro-USDC). */
  expectedAmount: number;
  /** Upper bound on the USDC fee transfer the tx may take from the buyer. */
  maxFeeMicroUsdc: bigint;
  /** USDC mint (base58) the gateway env decided; used to derive the buyer ATA. */
  expectedMint: string;
  /** Escrow program id (base58). Defaults to the well-known vault program. */
  programId?: string;
}

/**
 * Decode + whitelist-validate a server-provided deposit transaction. Throws a
 * descriptive Error on the first violated rule. Returns the decoded
 * Transaction (ready for `partialSign`) when every instruction is approved.
 */
export async function validateGaslessDepositTx(
  txBase64: string,
  opts: GaslessValidateOptions,
): Promise<DecodedTx> {
  const web3 = await requireSolanaWeb3();
  const splToken = await requireSplToken();
  const { PublicKey, Transaction, SystemProgram } = web3;

  const tx = Transaction.from(Buffer.from(txBase64, 'base64'));

  const buyer = new PublicKey(opts.buyerPubkey);
  const programId = new PublicKey(opts.programId ?? VAULT_CONSTANTS.PROGRAM_ID);
  const mint = new PublicKey(opts.expectedMint);
  const tokenProgramId = new PublicKey(VAULT_CONSTANTS.TOKEN_PROGRAM_ID);
  const buyerAta = splToken.getAssociatedTokenAddressSync(mint, buyer);

  // Rule: the platform must pay gas, not the buyer.
  if (!tx.feePayer) {
    throw new Error('gasless deposit tx rejected: missing feePayer');
  }
  if (tx.feePayer.equals(buyer)) {
    throw new Error('gasless deposit tx rejected: feePayer must not be the buyer (buyer would pay gas)');
  }

  let systemTransfers = 0;
  let tokenFeeTransfers = 0;
  let depositInstructions = 0;

  for (const ix of tx.instructions) {
    const pid = ix.programId;

    if (pid.equals(SystemProgram.programId)) {
      validateSystemTransfer(ix, buyer);
      systemTransfers += 1;
      if (systemTransfers > 1) {
        throw new Error('gasless deposit tx rejected: more than one SystemProgram transfer');
      }
      continue;
    }

    if (pid.equals(tokenProgramId)) {
      validateTokenFeeTransfer(ix, buyerAta, opts.maxFeeMicroUsdc);
      tokenFeeTransfers += 1;
      if (tokenFeeTransfers > 1) {
        throw new Error('gasless deposit tx rejected: more than one token fee transfer');
      }
      continue;
    }

    if (pid.equals(programId)) {
      validateEscrowDeposit(ix, buyer, opts.expectedAmount);
      depositInstructions += 1;
      if (depositInstructions > 1) {
        throw new Error('gasless deposit tx rejected: more than one escrow deposit instruction');
      }
      continue;
    }

    throw new Error(`gasless deposit tx rejected: instruction targets disallowed program ${pid.toBase58()}`);
  }

  if (depositInstructions !== 1) {
    throw new Error('gasless deposit tx rejected: exactly one escrow deposit instruction is required');
  }

  return tx;
}
