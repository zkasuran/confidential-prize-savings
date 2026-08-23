// Deployment configuration. Addresses default to the live Sepolia deployment and can
// be overridden at build time via Vite env (VITE_TOKEN_ADDRESS / VITE_POOL_ADDRESS).

export const CHAIN_ID = 11155111; // Sepolia
export const CHAIN_ID_HEX = "0xaa36a7";
export const DECIMALS = 6;

const DEFAULT_TOKEN = "0x57aF4e4B482Ab1bb4f9d1aeb5206258a7Def0eaf";
const DEFAULT_POOL = "0x89EE395e44bD7F7401D47805550f9dc424b9D553";

export const TOKEN_ADDRESS = import.meta.env.VITE_TOKEN_ADDRESS ?? DEFAULT_TOKEN;
export const POOL_ADDRESS = import.meta.env.VITE_POOL_ADDRESS ?? DEFAULT_POOL;

/** Format a base-unit bigint as a human cUSD string. */
export function formatUnits(amount: bigint): string {
  const base = 10n ** BigInt(DECIMALS);
  const whole = amount / base;
  const frac = amount % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

/** Parse a human cUSD string into a base-unit bigint. */
export function parseUnits(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed) return 0n;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "0".repeat(DECIMALS)).slice(0, DECIMALS);
  return BigInt(whole || "0") * 10n ** BigInt(DECIMALS) + BigInt(fracPadded || "0");
}
