import type { ethers } from "ethers";
import type { FhevmInstance } from "./fhevm";

/** Convert a Uint8Array (or hex-ish string) to a 0x-prefixed hex string. */
export function toHex(value: Uint8Array | string): `0x${string}` {
  if (typeof value === "string") {
    return (value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`;
  }
  let out = "0x";
  for (const b of value) out += b.toString(16).padStart(2, "0");
  return out as `0x${string}`;
}

type DecryptionSignature = {
  privateKey: string;
  publicKey: string;
  signature: string;
  contractAddresses: string[];
  userAddress: string;
  startTimestamp: number;
  durationDays: number;
};

// Cache the EIP-712 decryption grant for the session so repeated reveals do not
// re-prompt the wallet. Keyed by user + the set of contracts being decrypted.
const signatureCache = new Map<string, DecryptionSignature>();

async function getDecryptionSignature(
  instance: FhevmInstance,
  signer: ethers.JsonRpcSigner,
  contractAddresses: string[],
  userAddress: string,
): Promise<DecryptionSignature> {
  const key = `${userAddress.toLowerCase()}:${[...contractAddresses].map((a) => a.toLowerCase()).sort().join(",")}`;
  const cached = signatureCache.get(key);
  const now = Math.floor(Date.now() / 1000);
  if (cached && now < cached.startTimestamp + cached.durationDays * 86400 - 120) {
    return cached;
  }

  const { publicKey, privateKey } = instance.generateKeypair();
  const startTimestamp = now;
  const durationDays = 10;
  const eip712 = instance.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays);

  const signature = await signer.signTypedData(
    eip712.domain as ethers.TypedDataDomain,
    {
      UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification as unknown as ethers.TypedDataField[],
    },
    eip712.message as Record<string, unknown>,
  );

  const sig: DecryptionSignature = {
    privateKey,
    publicKey,
    signature,
    contractAddresses,
    userAddress,
    startTimestamp,
    durationDays,
  };
  signatureCache.set(key, sig);
  return sig;
}

/** User-decrypt a single euint64 ciphertext handle the caller is allowed to read. */
export async function userDecryptEuint(
  instance: FhevmInstance,
  signer: ethers.JsonRpcSigner,
  handle: string,
  contractAddress: string,
  userAddress: string,
): Promise<bigint> {
  const sig = await getDecryptionSignature(instance, signer, [contractAddress], userAddress);
  const results = await instance.userDecrypt(
    [{ handle, contractAddress }],
    sig.privateKey,
    sig.publicKey,
    sig.signature,
    sig.contractAddresses,
    sig.userAddress,
    sig.startTimestamp,
    sig.durationDays,
  );
  return BigInt(results[handle as `0x${string}`] as unknown as string | number | bigint);
}
