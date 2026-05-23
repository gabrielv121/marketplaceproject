/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** `waitlist` = entire site is the waitlist page (TikTok pre-launch). Default: full marketplace. */
  readonly VITE_SITE_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
