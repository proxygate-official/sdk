/** Well-known vault program and token addresses (mainnet). */
export const VAULT_CONSTANTS = {
  PROGRAM_ID: '7fe3uMMqrJjqmTy5rB4CVn1pvNxH6z5Snh8ULa3cQXmo',
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  TOKEN_PROGRAM_ID: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ASSOCIATED_TOKEN_PROGRAM_ID: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  SYSTEM_PROGRAM_ID: '11111111111111111111111111111111',
  CONFIG_SEED: 'config',
} as const;

/**
 * Anchor discriminators (first 8 bytes of sha256("global:{instruction}")).
 * These are stable as long as the instruction names don't change.
 */
export const DISCRIMINATORS = {
  deposit: Uint8Array.from([242, 35, 198, 137, 82, 225, 242, 182]),
  withdraw: Uint8Array.from([183, 18, 70, 156, 148, 109, 161, 34]),
} as const;

/** Default Solana mainnet-beta RPC. Pass a custom rpcUrl for devnet/testnet. */
export const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';

/** Default cooldown polling config. */
export const DEFAULT_POLL_INTERVAL_MS = 5000;
export const DEFAULT_MAX_WAIT_MS = 120_000;
