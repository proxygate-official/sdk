const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Encode a byte array as a base58 string (Solana/Bitcoin alphabet).
 *
 * Used to convert 32-byte ed25519 public keys to Solana address strings.
 */
export function encodeBase58(bytes: Uint8Array): string {
  // Count leading zeros (they map to '1' characters)
  let leadingZeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    leadingZeros++;
  }

  // Convert byte array to a single BigInt
  let num = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    num = num * BigInt(256) + BigInt(bytes[i]);
  }

  // Repeatedly divide by 58 to extract base58 digits
  const chars: string[] = [];
  while (num > BigInt(0)) {
    const remainder = Number(num % BigInt(58));
    num = num / BigInt(58);
    chars.unshift(ALPHABET[remainder]);
  }

  // Prepend '1' for each leading zero byte
  for (let i = 0; i < leadingZeros; i++) {
    chars.unshift('1');
  }

  return chars.join('');
}
