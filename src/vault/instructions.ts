import { VAULT_CONSTANTS, DISCRIMINATORS } from './constants.js';
import type { VaultDepositOptions } from '../types.js';

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/** Convert base64 string to Uint8Array. */
export function base64ToBytes(base64: string): Uint8Array {
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

// ---------------------------------------------------------------------------
// Dynamic imports (optional peer deps)
// ---------------------------------------------------------------------------

/**
 * Dynamically import @solana/web3.js. Throws a clear error if not installed.
 * Keeps Solana libs as optional peer dependencies.
 */
export async function requireSolanaWeb3(): Promise<typeof import('@solana/web3.js')> {
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
export async function requireSplToken(): Promise<typeof import('@solana/spl-token')> {
  try {
    return await import('@solana/spl-token');
  } catch {
    throw new Error(
      'Install @solana/spl-token to use vault deposit/withdraw: npm install @solana/web3.js @solana/spl-token',
    );
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Sleep for the given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Instruction builder
// ---------------------------------------------------------------------------

/**
 * Build and send a Solana deposit transaction for the vault program.
 * Returns the on-chain transaction signature.
 */
export async function buildAndSendDeposit(
  opts: VaultDepositOptions,
  secretKey: Uint8Array,
): Promise<string> {
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

  const rpcUrl = opts.rpcUrl ?? 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  // Derive keys
  const buyerKeypair = Keypair.fromSecretKey(secretKey);
  const buyerPubkey = buyerKeypair.publicKey;
  const programId = new PublicKey(VAULT_CONSTANTS.PROGRAM_ID);
  const usdcMint = new PublicKey(VAULT_CONSTANTS.USDC_MINT);
  const tokenProgramId = new PublicKey(VAULT_CONSTANTS.TOKEN_PROGRAM_ID);
  const associatedTokenProgramId = new PublicKey(
    VAULT_CONSTANTS.ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const systemProgramId = new PublicKey(VAULT_CONSTANTS.SYSTEM_PROGRAM_ID);

  // Derive PDAs
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_CONSTANTS.CONFIG_SEED)],
    programId,
  );
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
      { pubkey: configPda, isSigner: false, isWritable: false },
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
  return sendAndConfirmTransaction(connection, tx, [buyerKeypair]);
}
