/**
 * Platform-defined pricing constants (read-only, informational).
 * The gateway enforces the actual values — these are display mirrors for UI.
 *
 * SYNC: keep in sync with apps/gateway/src/proxy/helpers.ts (enforced values).
 */

/** Platform fee rate (5% buyer-side, 5% seller-side = 10% total). */
export const PLATFORM_FEE_BPS = 500;

/** Shield Model Armor surcharge in micro-cents per request. */
export const SHIELD_SURCHARGE_MICRO_CENTS = 5000;

/** Shield surcharge as display string. */
export const SHIELD_SURCHARGE_DISPLAY = '$0.005';
