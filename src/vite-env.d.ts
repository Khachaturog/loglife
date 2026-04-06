/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Опционально: ссылка «Поддержать автора» (Kofi, Boosty и т.д.) */
  readonly VITE_SUPPORT_AUTHOR_URL?: string
  /** Опционально: URL репозитория на GitHub */
  readonly VITE_GITHUB_REPO_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
