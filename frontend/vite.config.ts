import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Zama Relayer SDK ships its own WASM and must not be pre-bundled by esbuild.
// Cross-origin isolation headers let the SDK use threaded WASM where available.
export default defineConfig({
  plugins: [react()],
  base: "./",
  optimizeDeps: {
    exclude: ["@zama-fhe/relayer-sdk"],
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
