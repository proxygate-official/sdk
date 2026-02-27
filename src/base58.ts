const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const ALPHABET_MAP = new Map<string, number>();
for (let i = 0; i < ALPHABET.length; i++) {
  ALPHABET_MAP.set(ALPHABET[i], i);
}

/**
 * Decode a base58 string to a byte array (Solana/Bitcoin alphabet).
 *
 * Used to convert Solana address strings back to 32-byte public keys.
 */
export function decodeBase58(str: string): Uint8Array {
  // Count leading '1' characters (they map to 0x00 bytes)
  let leadingOnes = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    leadingOnes++;
  }

  // Convert base58 string to BigInt
  let num = BigInt(0);
  for (let i = 0; i < str.length; i++) {
    const charValue = ALPHABET_MAP.get(str[i]);
    if (charValue === undefined) {
      throw new Error(`Invalid base58 character: ${str[i]}`);
    }
    num = num * BigInt(58) + BigInt(charValue);
  }

  // Convert BigInt to byte array
  const bytes: number[] = [];
  while (num > BigInt(0)) {
    bytes.unshift(Number(num % BigInt(256)));
    num = num / BigInt(256);
  }

  // Prepend zero bytes for leading '1' characters
  for (let i = 0; i < leadingOnes; i++) {
    bytes.unshift(0);
  }

  return Uint8Array.from(bytes);
}

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
