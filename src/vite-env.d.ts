/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Short git SHA of the deploy (Vercel), or "local". Set in vite.config.ts. */
declare const __APP_RELEASE__: string;
