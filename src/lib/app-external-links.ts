/**
 * Внешние URL без хардкода репозитория/доната в коде — задаются в .env при деплое.
 * Если переменная не задана, соответствующий пункт в UI не показываем.
 */
export function getSupportAuthorUrl(): string | undefined {
  const u = import.meta.env.VITE_SUPPORT_AUTHOR_URL as string | undefined
  const t = u?.trim()
  return t || undefined
}

export function getGithubRepoUrl(): string | undefined {
  const u = import.meta.env.VITE_GITHUB_REPO_URL as string | undefined
  const t = u?.trim()
  return t || undefined
}
