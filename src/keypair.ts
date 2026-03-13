/**
 * Parse Solana keypairs from various formats.
 *
 * Supported:
 * - JSON array of 64 numbers (Solana CLI)
 * - JSON array of 32 numbers (seed, expanded to full keypair)
 * - Base58 string, 64 bytes (Phantom export)
 * - Base58 string, 32 bytes (seed)
 * - Base64 string, 64 or 32 bytes
 * - Hex string, 64 or 32 bytes
 *
 * @returns 64-byte Uint8Array (secret key + public key)
 */
import nacl from 'tweetnacl';
import { decodeBase58 } from './base58.js';

const BASE58_CHARS = new Set('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');

function isBase58(str: string): boolean {
  for (const ch of str) { if (!BASE58_CHARS.has(ch)) return false; }
  return str.length > 0;
}

function fromSeed(seed: Uint8Array): Uint8Array {
  return nacl.sign.keyPair.fromSeed(seed).secretKey;
}

export function parseKeypairBytes(raw: string): Uint8Array {
  const trimmed = raw.trim();

  // 1. JSON array
  if (trimmed.startsWith('[')) {
    const arr: unknown = JSON.parse(trimmed);
    if (!Array.isArray(arr) || !arr.every((n) => typeof n === 'number' && n >= 0 && n <= 255)) {
      throw new Error('JSON array must contain numbers 0-255');
    }
    if (arr.length === 64) return Uint8Array.from(arr as number[]);
    if (arr.length === 32) return fromSeed(Uint8Array.from(arr as number[]));
    throw new Error(`Expected 32 or 64 numbers, got ${arr.length}`);
  }

  // 2. Base58 (Phantom export)
  if (isBase58(trimmed) && trimmed.length >= 32 && trimmed.length <= 96) {
    const bytes = decodeBase58(trimmed);
    if (bytes.length === 64) return bytes;
    if (bytes.length === 32) return fromSeed(bytes);
    throw new Error(`Base58 decoded to ${bytes.length} bytes, expected 32 or 64`);
  }

  // 3. Hex
  if (/^(0x)?[0-9a-fA-F]+$/.test(trimmed)) {
    const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (hex.length === 128 || hex.length === 64) {
      const bytes = Uint8Array.from(Buffer.from(hex, 'hex'));
      if (bytes.length === 64) return bytes;
      if (bytes.length === 32) return fromSeed(bytes);
    }
  }

  // 4. Base64
  if (/^[A-Za-z0-9+/]+=*$/.test(trimmed) && trimmed.length >= 43) {
    const bytes = Uint8Array.from(Buffer.from(trimmed, 'base64'));
    if (bytes.length === 64) return bytes;
    if (bytes.length === 32) return fromSeed(bytes);
    throw new Error(`Base64 decoded to ${bytes.length} bytes, expected 32 or 64`);
  }

  throw new Error(
    'Unrecognized keypair format. Supported: JSON array (32/64), Base58, Base64, Hex',
  );
}
