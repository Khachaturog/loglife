import { useEffect, useState } from 'react'
import { Box, Button, Dialog, Flex, Text } from '@radix-ui/themes'
import { CheckIcon, ArrowLeftIcon, ArrowRightIcon } from '@radix-ui/react-icons'
import type { OnboardingStep } from '@/onboarding/types'
import type { OnboardingFlowId } from '@/onboarding/flows'
import styles from './OnboardingSheet.module.css'

/** Путь к файлу в public/ (без ведущего слэша), с учётом Vite BASE_URL. */
function publicAssetUrl(relativePath: string): string {
  const path = relativePath.replace(/^\//, '')
  const b = import.meta.env.BASE_URL || '/'
  return b.endsWith('/') ? `${b}${path}` : `${b}/${path}`
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  flowId: OnboardingFlowId | null
  steps: OnboardingStep[]
}

/**
 * Многошаговая справка: закрытие сверху справа, блок под картинку, затем прогресс, заголовок, описание, кнопки на всю ширину.
 */
export function OnboardingSheet({ open, onOpenChange, flowId, steps }: Props) {
  const [stepIndex, setStepIndex] = useState(0)

  // Новый сценарий или повторное открытие — с первого слайда
  useEffect(() => {
    if (open) setStepIndex(0)
  }, [open, flowId])

  const lastIndex = steps.length - 1
  const step = steps[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex >= lastIndex

  if (!step) return null

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        className={`${styles.sheetContent} onboardingSheetContent`}
        size="3"
        width="100%"
        maxWidth="600px"
      >
        <Flex direction="column" gap="2">
          {/* Кнопка закрыть — справа вверху */}
          <div className={styles.sheetHeader}>
            {/* <Dialog.Close>
              <IconButton
                type="button"
                size="4"
                color="gray"
                variant="ghost"
                radius="full"
                aria-label="Закрыть"
              >
                <Cross2Icon />
              </IconButton>
            </Dialog.Close> */}
          </div>

          {/* Заглушка под иллюстрацию; при появлении imageSrc — реальное изображение */}
          {step.imageSrc ? (
            <Box className={styles.imageWrap}>
              <img
                src={publicAssetUrl(step.imageSrc)}
                alt={step.imageAlt ?? ''}
              />
            </Box>
          ) : (
            <Box className={styles.imagePlaceholder}>
              <Text size="2" color="gray">
                Иллюстрация появится позже
              </Text>
            </Box>
          )}

          <Text size="1" color="gray" aria-live="polite">
            Слайд {stepIndex + 1} из {steps.length}
          </Text>

          <Dialog.Title>{step.title}</Dialog.Title>
          <Dialog.Description size="3" color="gray">{step.description}</Dialog.Description>

          {/* Последний слайд: при нескольких шагах — «Назад» + «Готово»; один шаг — только «Готово» */}
          {isLast ? (
            lastIndex > 0 ? (
              <Flex width="100%" gap="2">
                <Button
                  type="button"
                  size="3"
                  color="gray"
                  variant="surface"
                  style={{ flex: '1 1 0', minWidth: 0 }}
                  onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                >
                  <ArrowLeftIcon aria-hidden />
                  Назад
                </Button>
                <Dialog.Close>
                  <Button
                    type="button"
                    size="3"
                    color="gray"
                    variant="surface"
                    style={{ flex: '1 1 0', minWidth: 0 }}
                  >
                    Готово
                    <CheckIcon aria-hidden />
                  </Button>
                </Dialog.Close>
              </Flex>
            ) : (
              <Dialog.Close>
                <Button
                  type="button"
                  size="3"
                  color="gray"
                  variant="surface"
                  style={{ width: '100%' }}
                >
                  <CheckIcon aria-hidden />
                  Готово
                </Button>
              </Dialog.Close>
            )
          ) : isFirst ? (
            <Button
              type="button"
              size="3"
              color="gray"
              variant="surface"
              style={{ width: '100%' }}
              onClick={() => setStepIndex((i) => Math.min(lastIndex, i + 1))}
            >
              Далее
              <ArrowRightIcon aria-hidden />
            </Button>
          ) : (
            <Flex width="100%" gap="2">
              <Button
                type="button"
                size="3"
                color="gray"
                variant="surface"
                style={{ flex: '1 1 0', minWidth: 0 }}
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              >
                <ArrowLeftIcon aria-hidden />
                Назад
              </Button>
              <Button
                type="button"
                size="3"
                color="gray"
                variant="surface"
                style={{ flex: '1 1 0', minWidth: 0 }}
                onClick={() => setStepIndex((i) => Math.min(lastIndex, i + 1))}
              >
                Далее
                <ArrowRightIcon aria-hidden />
              </Button>
            </Flex>
          )}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
