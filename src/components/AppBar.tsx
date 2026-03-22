import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Flex, IconButton, Text } from '@radix-ui/themes'
import { ArrowLeftIcon, Cross2Icon } from '@radix-ui/react-icons'
import styles from './AppBar.module.css'

/** При скролле страницы — true (для обводки и тени AppBar) */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 5)
    handleScroll() // начальное состояние
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  return scrolled
}

export interface AppBarProps {
  /** URL для кнопки «Назад» (Link) */
  backHref?: string
  /** Обработчик для кнопки «Назад» (Button с onClick), если нет backHref */
  onBack?: () => void
  /** Заголовок в центре */
  title?: string
  /** Кнопки и другие действия справа */
  actions?: React.ReactNode
  /**
   * Пока `title` пустой: невидимый резерв той же высоты, что и Text size="5",
   * чтобы при появлении заголовка не прыгал layout.
   */
  titleReserve?: boolean
  /**
   * Пока `actions` не переданы: столько невидимых слотов под IconButton size="3".
   */
  actionsReserveCount?: number
  /** Иконка слева: стрелка «назад» (по умолчанию) или крестик «закрыть» (модальные формы). */
  backButtonIcon?: 'arrow' | 'close'
}

/**
 * Верхняя панель для внутренних страниц и форм.
 * Показывает кнопку «Назад» и опционально заголовок.
 */
export function AppBar({
  backHref,
  onBack,
  title,
  actions,
  titleReserve = false,
  actionsReserveCount = 0,
  backButtonIcon = 'arrow',
}: AppBarProps) {
  const showBack = backHref != null || onBack != null
  const backAriaLabel = backButtonIcon === 'close' ? 'Закрыть' : 'Назад'
  const BackGlyph =
    backButtonIcon === 'close' ? (
      <Cross2Icon width={18} height={18} />
    ) : (
      <ArrowLeftIcon width={18} height={18} />
    )
  const scrolled = useScrolled()
  const hasTitle = Boolean(title)
  const showTitleReserve = !hasTitle && titleReserve
  const showActions = Boolean(actions)
  const showActionReserves = !showActions && actionsReserveCount > 0

  return (
    <Box className={`${styles.appBar} ${scrolled ? styles.appBarScrolled : ''}`} asChild>
      <header>
        <Flex align="center" gap="3" className={styles.row}>
          {/* Контейнер «Назад» рендерим только при наличии кнопки — иначе gap смещает заголовок */}
          {showBack && (
            <Flex align="center">
              {backHref != null ? (
                <IconButton 
                variant="classic"
                color="gray" 
                radius='full' 
                size="3" 
                asChild aria-label={backAriaLabel}>
                  <Link to={backHref}>{BackGlyph}</Link>
                </IconButton>
              ) : (
                <IconButton 
                type="button"
                variant="classic"
                color="gray" 
                radius='full' 
                size="3" 
                onClick={onBack} 
                aria-label={backAriaLabel}>
                  {BackGlyph}
                </IconButton>
              )}
            </Flex>
          )}
          {(hasTitle || showTitleReserve) &&
            (hasTitle ? (
              <Text size="5" weight="medium" className={styles.title} truncate>
                {title}
              </Text>
            ) : (
              // Резерв: nbsp даёт высоту строки как у обычного заголовка
              <Text
                size="5"
                weight="medium"
                className={`${styles.title} ${styles.titleReserve}`}
                aria-hidden
              >
                {'\u00a0'}
              </Text>
            ))}
          {(showActions || showActionReserves) && (
            <Flex align="center" gap="2" style={{ flexShrink: 0 }} className={styles.actions}>
              {showActions
                ? actions
                : Array.from({ length: actionsReserveCount }, (_, i) => (
                    <IconButton
                      key={i}
                      variant="classic"
                      color="gray"
                      radius="full"
                      size="3"
                      className={styles.actionReserve}
                      aria-hidden
                      tabIndex={-1}
                    >
                      <ArrowLeftIcon width={18} height={18} />
                    </IconButton>
                  ))}
            </Flex>
          )}
        </Flex>
      </header>
    </Box>
  )
}
