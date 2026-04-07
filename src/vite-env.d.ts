/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Опционально: URL репозитория на GitHub */
  readonly VITE_GITHUB_REPO_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
