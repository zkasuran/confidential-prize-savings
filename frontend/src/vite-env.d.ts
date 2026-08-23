/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOKEN_ADDRESS?: string;
  readonly VITE_POOL_ADDRESS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
