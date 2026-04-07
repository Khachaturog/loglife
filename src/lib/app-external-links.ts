/**
 * Внешний URL репозитория — задаётся в .env при деплое.
 * Если не задан — пункт «Проект на GitHub» в профиле не показываем.
 */
export function getGithubRepoUrl(): string | undefined {
  const u = import.meta.env.VITE_GITHUB_REPO_URL as string | undefined
  const t = u?.trim()
  return t || undefined
}
