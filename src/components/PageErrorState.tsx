import type { ReactNode } from 'react'
import { Box, Button, Flex, Heading, Text } from '@radix-ui/themes'
import layoutStyles from '@/styles/layout.module.css'
import styles from './PageErrorState.module.css'

/** Дефолтная иллюстрация: нейтральная, в тон accent/gray темы Radix */
function DefaultErrorIllustration() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" fill="none" viewBox="0 0 16 16">
      <path fill="currentColor" fill-rule="evenodd" d="M6 8c0 1.75-.335 3.094-.816 3.944C4.721 12.764 4.217 13 3.75 13s-.97-.237-1.434-1.056c-.272-.48-.496-1.116-.64-1.895.283.289.647.451 1.074.451C3.826 10.5 4.5 9.47 4.5 8s-.674-2.5-1.75-2.5a1.47 1.47 0 0 0-1.075.45c.145-.778.37-1.415.64-1.894C2.78 3.236 3.284 3 3.75 3s.97.237 1.434 1.056C5.665 4.906 6 6.25 6 8m1.5 0c0 3.822-1.445 6.5-3.75 6.5S0 11.822 0 8s1.445-6.5 3.75-6.5S7.5 4.178 7.5 8m7 0c0 1.75-.335 3.094-.816 3.944-.463.82-.967 1.056-1.434 1.056s-.97-.237-1.434-1.056c-.272-.48-.496-1.116-.64-1.895.283.289.647.451 1.074.451C12.326 10.5 13 9.47 13 8s-.674-2.5-1.75-2.5a1.47 1.47 0 0 0-1.075.45c.145-.778.37-1.415.64-1.894C11.28 3.236 11.784 3 12.25 3s.97.237 1.434 1.056c.481.85.816 2.195.816 3.944M16 8c0 3.822-1.445 6.5-3.75 6.5S8.5 11.822 8.5 8s1.445-6.5 3.75-6.5S16 4.178 16 8" clip-rule="evenodd"/>
    </svg>
  )
}

export type PageErrorStateProps = {
  /** Иллюстрация; по умолчанию — встроенная SVG */
  image?: ReactNode
  title: string
  description?: string
  /** Технический фрагмент (например message из Error или «Load failed») */
  code?: string
  /** Куда вести «На главную» (учитывает basename) */
  homeTo?: string
  /** Перезагрузка; по умолчанию — полный reload страницы */
  onRefresh?: () => void
  /**
   * false — только содержимое (без внешнего `pageContainer`), чтобы сверху вставить свой AppBar
   * и обернуть в общий `pageContainer` на странице.
   */
  withPageContainer?: boolean
}

/**
 * Общее состояние ошибки: иллюстрация, заголовок, текст, код, действия.
 * При `withPageContainer` (по умолчанию) — полная ширина по layout-стандарту.
 */
export function PageErrorState({
  image,
  title,
  description,
  code,
  homeTo: _homeTo = '/',
  onRefresh,
  withPageContainer = true,
}: PageErrorStateProps) {
  function handleRefresh() {
    if (onRefresh) onRefresh()
    else window.location.reload()
  }

  const body = (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="4"
      className={`${styles.wrap} ${withPageContainer ? '' : styles.embedded}`}
      role="alert"
    >
      <Box className={styles.imageWrap}>{image ?? <DefaultErrorIllustration />}</Box>

      <Flex direction="column" align="center" gap="2" style={{ maxWidth: '100%', textAlign: 'center' }}>
        <Heading as="h1" size="5">{title}</Heading>
        {description ? (
          <Text as="p" size="3" color="gray">{description}</Text>
        ) : null}
        {code ? <pre className={styles.code}>{code}</pre> : null}
      </Flex>

      <Flex direction="column" gap="2">
        <Button 
        type="button" 
        size="3" 
        variant="classic"
        onClick={handleRefresh}>
          Обновить страницу
        </Button>
      </Flex>
    </Flex>
  )

  if (!withPageContainer) return body

  return <Box className={layoutStyles.pageContainer}>{body}</Box>
}
