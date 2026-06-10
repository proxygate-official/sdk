/**
 * Per-instruction whitelist rules for a server-provided gasless deposit tx.
 * Split from ./gasless.js (orchestrator) to honor the 150-line file limit.
 * Every rule throws a descriptive Error naming the violation.
 */
import { DISCRIMINATORS } from './constants.js';
import type { requireSolanaWeb3 } from './instructions.js';

type Web3 = Awaited<ReturnType<typeof requireSolanaWeb3>>;
type Pubkey = InstanceType<Web3['PublicKey']>;
type Instruction = InstanceType<Web3['Transaction']>['instructions'][number];

const SYSTEM_TRANSFER_INSTRUCTION = 2; // SystemInstruction enum index, u32 LE
const TOKEN_TRANSFER_TAG = 3;
const TOKEN_TRANSFER_CHECKED_TAG = 12;

/** Read a little-endian u32 from the first 4 bytes. */
function readU32LE(data: Uint8Array): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true);
}

/** Read a little-endian u64 at the given offset as a bigint. */
function readU64LE(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
}

/** True when two byte arrays are equal. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** SystemProgram instruction must be a Transfer whose destination is the buyer. */
export function validateSystemTransfer(ix: Instruction, buyer: Pubkey): void {
  if (ix.data.length < 4 || readU32LE(ix.data.subarray(0, 4)) !== SYSTEM_TRANSFER_INSTRUCTION) {
    throw new Error('gasless deposit tx rejected: SystemProgram instruction is not a Transfer');
  }
  // SystemProgram.transfer keys: [from, to]; destination must be the buyer
  // (platform funding the buyer's rent), never an attacker-controlled account.
  const destination = ix.keys[1]?.pubkey;
  if (!destination || !destination.equals(buyer)) {
    throw new Error('gasless deposit tx rejected: system transfer destination is not the buyer');
  }
}

/** TOKEN_PROGRAM instruction must be a Transfer/TransferChecked from the buyer's
 * USDC ATA whose amount does not exceed the advertised max fee. */
export function validateTokenFeeTransfer(ix: Instruction, buyerAta: Pubkey, maxFeeMicroUsdc: bigint): void {
  const tag = ix.data[0];
  if (tag !== TOKEN_TRANSFER_TAG && tag !== TOKEN_TRANSFER_CHECKED_TAG) {
    throw new Error('gasless deposit tx rejected: token instruction is not a Transfer/TransferChecked');
  }
  // Both Transfer and TransferChecked carry the source account at key index 0.
  const source = ix.keys[0]?.pubkey;
  if (!source || !source.equals(buyerAta)) {
    throw new Error('gasless deposit tx rejected: token fee transfer source is not the buyer USDC ATA');
  }
  if (ix.data.length < 9) {
    throw new Error('gasless deposit tx rejected: token fee transfer data too short for amount');
  }
  const amount = readU64LE(ix.data, 1);
  if (amount > maxFeeMicroUsdc) {
    throw new Error(
      `gasless deposit tx rejected: token fee ${amount} exceeds max ${maxFeeMicroUsdc}`,
    );
  }
}

/** Escrow program instruction must be `deposit` for the expected amount with the
 * buyer as the depositor (account index 1, mirroring the SDK's own builder). */
export function validateEscrowDeposit(ix: Instruction, buyer: Pubkey, expectedAmount: number): void {
  if (ix.data.length < 16) {
    throw new Error('gasless deposit tx rejected: escrow instruction data too short');
  }
  if (!bytesEqual(ix.data.subarray(0, 8), DISCRIMINATORS.deposit)) {
    throw new Error('gasless deposit tx rejected: escrow instruction is not deposit');
  }
  const amount = readU64LE(ix.data, 8);
  if (amount !== BigInt(expectedAmount)) {
    throw new Error(
      `gasless deposit tx rejected: deposit amount ${amount} does not match requested ${expectedAmount}`,
    );
  }
  const depositor = ix.keys[1]?.pubkey;
  if (!depositor || !depositor.equals(buyer)) {
    throw new Error('gasless deposit tx rejected: escrow deposit buyer account is not the buyer');
  }
}
