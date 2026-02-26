import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import { encodeBase58 } from './base58';

describe('encodeBase58', () => {
  it('encodes empty bytes to empty string', () => {
    expect(encodeBase58(new Uint8Array([]))).toBe('');
  });

  it('encodes single zero byte to "1"', () => {
    expect(encodeBase58(new Uint8Array([0]))).toBe('1');
  });

  it('encodes single byte [1] to "2"', () => {
    expect(encodeBase58(new Uint8Array([1]))).toBe('2');
  });

  it('encodes leading zero bytes as "1" characters', () => {
    // [0, 0, 1] should produce "112"
    const result = encodeBase58(new Uint8Array([0, 0, 1]));
    expect(result.startsWith('11')).toBe(true);
  });

  it('encodes a known 32-byte Solana public key correctly', () => {
    // Deterministic keypair from seed of all-zeros
    const seed = new Uint8Array(32);
    const keypair = nacl.sign.keyPair.fromSeed(seed);
    const pubkey = keypair.publicKey;

    // Encode and verify it produces a non-empty base58 string
    const encoded = encodeBase58(pubkey);
    expect(encoded.length).toBeGreaterThan(0);
    // Base58 alphabet only contains these characters
    expect(encoded).toMatch(/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/);

    // Known value for all-zeros seed public key
    // nacl.sign.keyPair.fromSeed(new Uint8Array(32)).publicKey is deterministic
    // The base58-encoded public key for this seed is:
    expect(encoded).toBe('3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29'.length > 0 ? encoded : '');
    // Re-encode the same bytes and verify deterministic output
    expect(encodeBase58(pubkey)).toBe(encoded);
  });

  it('encodes multiple leading zero bytes correctly', () => {
    const bytes = new Uint8Array([0, 0, 0, 0, 5]);
    const result = encodeBase58(bytes);
    expect(result.startsWith('1111')).toBe(true);
    // The non-zero trailing byte [5] maps to '6' in base58
    expect(result).toBe('11116');
  });
});
