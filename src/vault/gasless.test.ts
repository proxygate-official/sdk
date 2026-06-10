/**
 * Tests for validateGaslessDepositTx — the whitelist that runs BEFORE the
 * buyer co-signs a gateway-provided deposit transaction. Every test builds a
 * real @solana/web3.js Transaction (no mocks) so the decode + validation path
 * is exercised end to end, then asserts the crafted malicious variant is
 * rejected with the rule it violates.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import { VAULT_CONSTANTS, DISCRIMINATORS } from './constants';
import { validateGaslessDepositTx } from './gasless';

const MINT = new PublicKey(VAULT_CONSTANTS.USDC_MINT);
const PROGRAM_ID = new PublicKey(VAULT_CONSTANTS.PROGRAM_ID);
const TOKEN_PROGRAM_ID = new PublicKey(VAULT_CONSTANTS.TOKEN_PROGRAM_ID);

const AMOUNT = 1_000_000;
const MAX_FEE = 5_000n;

let buyer: Keypair;
let platform: Keypair;
let buyerAta: PublicKey;
let baseOpts: {
  buyerPubkey: string;
  expectedAmount: number;
  maxFeeMicroUsdc: bigint;
  expectedMint: string;
};

beforeAll(() => {
  buyer = Keypair.generate();
  platform = Keypair.generate();
  buyerAta = getAssociatedTokenAddressSync(MINT, buyer.publicKey);
  baseOpts = {
    buyerPubkey: buyer.publicKey.toBase58(),
    expectedAmount: AMOUNT,
    maxFeeMicroUsdc: MAX_FEE,
    expectedMint: VAULT_CONSTANTS.USDC_MINT,
  };
});

/** Encode u64 little-endian. */
function u64(value: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

/** The escrow `deposit` instruction (buyer at account index 1, like the builder). */
function depositIx(amount: number, depositor: PublicKey = buyer.publicKey): TransactionInstruction {
  const data = Buffer.concat([Buffer.from(DISCRIMINATORS.deposit), u64(amount)]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false }, // config (index 0)
      { pubkey: depositor, isSigner: true, isWritable: true }, // buyer (index 1)
      { pubkey: buyerAta, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/** A USDC fee TransferChecked from the buyer's ATA to the platform. */
function feeIx(amount: number, source: PublicKey = buyerAta): TransactionInstruction {
  return createTransferCheckedInstruction(
    source,
    MINT,
    getAssociatedTokenAddressSync(MINT, platform.publicKey),
    buyer.publicKey,
    amount,
    6,
  );
}

/** Assemble a tx with the platform as fee payer. */
function buildTx(ixs: TransactionInstruction[], feePayer: PublicKey = platform.publicKey): Transaction {
  const tx = new Transaction();
  tx.feePayer = feePayer;
  tx.recentBlockhash = '11111111111111111111111111111111';
  for (const ix of ixs) tx.add(ix);
  return tx;
}

function toBase64(tx: Transaction): string {
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
}

describe('validateGaslessDepositTx — happy path', () => {
  it('accepts a deposit + bounded fee + rent transfer to the buyer', async () => {
    const tx = buildTx([
      SystemProgram.transfer({ fromPubkey: platform.publicKey, toPubkey: buyer.publicKey, lamports: 2_039_280 }),
      feeIx(5_000),
      depositIx(AMOUNT),
    ]);
    const validated = await validateGaslessDepositTx(toBase64(tx), baseOpts);
    expect(validated.instructions).toHaveLength(3);
  });

  it('accepts a minimal deposit-only tx (no fee, no rent transfer)', async () => {
    const tx = buildTx([depositIx(AMOUNT)]);
    const validated = await validateGaslessDepositTx(toBase64(tx), baseOpts);
    expect(validated.instructions).toHaveLength(1);
  });

  it('accepts a plain SPL Transfer (tag 3) fee within the ceiling', async () => {
    const fee = createTransferInstruction(
      buyerAta,
      getAssociatedTokenAddressSync(MINT, platform.publicKey),
      buyer.publicKey,
      5_000,
    );
    const tx = buildTx([fee, depositIx(AMOUNT)]);
    await expect(validateGaslessDepositTx(toBase64(tx), baseOpts)).resolves.toBeDefined();
  });
});

describe('validateGaslessDepositTx — rejected variants', () => {
  it('rejects when the buyer is the fee payer', async () => {
    const tx = buildTx([depositIx(AMOUNT)], buyer.publicKey);
    await expect(validateGaslessDepositTx(toBase64(tx), baseOpts)).rejects.toThrow(/feePayer must not be the buyer/);
  });

  it('rejects an instruction targeting an unknown program', async () => {
    const evil = new TransactionInstruction({
      programId: Keypair.generate().publicKey,
      keys: [{ pubkey: buyer.publicKey, isSigner: false, isWritable: false }],
      data: Buffer.from([1, 2, 3]),
    });
    const tx = buildTx([depositIx(AMOUNT), evil]);
    await expect(validateGaslessDepositTx(toBase64(tx), baseOpts)).rejects.toThrow(/disallowed program/);
  });

  it('rejects a token fee transfer from a source other than the buyer ATA', async () => {
    const wrongSource = getAssociatedTokenAddressSync(MINT, Keypair.generate().publicKey);
    const tx = buildTx([feeIx(5_000, wrongSource), depositIx(AMOUNT)]);
    await expect(validateGaslessDepositTx(toBase64(tx), baseOpts)).rejects.toThrow(/source is not the buyer USDC ATA/);
  });

  it('rejects a token fee exceeding maxFeeMicroUsdc', async () => {
    const tx = buildTx([feeIx(6_000), depositIx(AMOUNT)]);
    await expect(validateGaslessDepositTx(toBase64(tx), baseOpts)).rejects.toThrow(/exceeds max/);
  });

  it('rejects when the escrow deposit amount does not match the request', async () => {
    const tx = buildTx([depositIx(AMOUNT + 1)]);
    await expect(validateGaslessDepositTx(toBase64(tx), baseOpts)).rejects.toThrow(/does not match requested/);
  });

  it('rejects when the escrow deposit buyer account is not the buyer', async () => {
    const tx = buildTx([depositIx(AMOUNT, Keypair.generate().publicKey)]);
    await expect(validateGaslessDepositTx(toBase64(tx), baseOpts)).rejects.toThrow(/buyer account is not the buyer/);
  });

  it('rejects more than one token fee transfer', async () => {
    const tx = buildTx([feeIx(1_000), feeIx(1_000), depositIx(AMOUNT)]);
    await expect(validateGaslessDepositTx(toBase64(tx), baseOpts)).rejects.toThrow(/more than one token fee transfer/);
  });

  it('rejects a system transfer whose destination is not the buyer', async () => {
    const tx = buildTx([
      SystemProgram.transfer({ fromPubkey: platform.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }),
      depositIx(AMOUNT),
    ]);
    await expect(validateGaslessDepositTx(toBase64(tx), baseOpts)).rejects.toThrow(/system transfer destination is not the buyer/);
  });

  it('rejects a tx with no escrow deposit instruction', async () => {
    const tx = buildTx([feeIx(1_000)]);
    await expect(validateGaslessDepositTx(toBase64(tx), baseOpts)).rejects.toThrow(/exactly one escrow deposit instruction/);
  });

  it('rejects an escrow instruction with the wrong discriminator', async () => {
    const data = Buffer.concat([Buffer.from(DISCRIMINATORS.withdraw), u64(AMOUNT)]);
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
      ],
      data,
    });
    const tx = buildTx([ix]);
    await expect(validateGaslessDepositTx(toBase64(tx), baseOpts)).rejects.toThrow(/is not deposit/);
  });

  it('rejects a token instruction that is neither Transfer nor TransferChecked', async () => {
    const ix = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [{ pubkey: buyerAta, isSigner: false, isWritable: true }],
      data: Buffer.from([7, ...u64(1_000)]), // tag 7 = MintTo, not allowed
    });
    const tx = buildTx([ix, depositIx(AMOUNT)]);
    await expect(validateGaslessDepositTx(toBase64(tx), baseOpts)).rejects.toThrow(/not a Transfer\/TransferChecked/);
  });
});
