import { createInstance, initSDK, SepoliaConfig } from "@zama-fhe/relayer-sdk/web";
import type { Eip1193Provider } from "ethers";

export type FhevmInstance = Awaited<ReturnType<typeof createInstance>>;

let instancePromise: Promise<FhevmInstance> | null = null;

/**
 * Lazily initialize the Zama Relayer SDK (loads WASM once) and build a Sepolia
 * instance bound to the injected wallet provider. Cached for the session.
 */
export function getFhevmInstance(ethereum: Eip1193Provider): Promise<FhevmInstance> {
  if (!instancePromise) {
    instancePromise = (async () => {
      await initSDK();
      return createInstance({ ...SepoliaConfig, network: ethereum });
    })();
  }
  return instancePromise;
}
