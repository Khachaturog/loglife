import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, Flex, Text } from '@radix-ui/themes'
import {
  compressRecordImage,
  formatRecordImageKilobytes,
  requestRecordImageUrl,
  type PendingRecordImage,
} from '@/lib/record-image'
import styles from './RecordImage.module.css'

/**
 * Квадрат 100×100 по пути в Storage. Пока URL не готов — серая плашка того же размера.
 * expandable — на просмотре записи: нажатие открывает ту же квадратную картинку
 * в квадратной модалке. Сторона — 90% меньшей стороны экрана, но не больше 500px.
 * Курсор на превью — zoom-in, на развёрнутой картинке — zoom-out.
 * Открытие и закрытие — масштаб с появлением и исчезновением.
 * Закрытие — любое нажатие: по фото, по затемнению вокруг, Escape.
 */
export function RecordImage({
  path,
  alt,
  expandable = false,
}: {
  path: string
  alt: string
  expandable?: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    setUrl(null)
    void requestRecordImageUrl(path).then((next) => {
      if (cancelled) return
      if (!next) setFailed(true)
      else setUrl(next)
    })
    return () => {
      cancelled = true
    }
  }, [path])

  if (failed) return null
  if (!url) return <span className={styles.thumb} aria-hidden />

  const thumb = (
    <img
      className={styles.thumb}
      src={url}
      alt={expandable ? '' : alt}
      onError={() => setFailed(true)}
    />
  )
  if (!expandable) return thumb

  return (
    <>
      <button type="button" className={styles.thumbButton} aria-label={`Открыть: ${alt}`} onClick={() => setOpen(true)}>
        {thumb}
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Content
          className={styles.viewer}
          width="min(90vw, 90vh, 500px)"
          maxWidth="min(90vw, 90vh, 500px)"
          height="min(90vw, 90vh, 500px)"
          maxHeight="min(90vw, 90vh, 500px)"
          aria-label="Закрыть картинку"
          onClick={() => setOpen(false)}
        >
          <Dialog.Title className={styles.srOnly}>{alt}</Dialog.Title>
          <Dialog.Description className={styles.srOnly}>Нажмите, чтобы закрыть</Dialog.Description>
          <img className={styles.viewerImage} src={url} alt={alt} />
        </Dialog.Content>
      </Dialog.Root>
    </>
  )
}

/**
 * Выбор фото на форме: сжатие в браузере, превью и размер.
 * «Удалить» убирает и новый файл, и уже сохранённый путь — удаление из Storage делает сохранение.
 * Кнопки справа от квадрата, чтобы не добавлять ряд под картинкой.
 */
export function RecordImageField({
  alt,
  storedPath,
  pending,
  disabled,
  onPending,
  onClear,
}: {
  alt: string
  storedPath?: string | null
  pending?: PendingRecordImage | null
  disabled?: boolean
  onPending: (next: PendingRecordImage) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [compressing, setCompressing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasImage = !!pending || !!storedPath

  async function onFile(file: File | undefined) {
    if (!file) return
    setCompressing(true)
    setError(null)
    try {
      const { blob, bytes } = await compressRecordImage(file)
      onPending({ blob, bytes, previewUrl: URL.createObjectURL(blob) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось подготовить картинку')
    } finally {
      setCompressing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <Flex direction="column" gap="2" align="start">
      <Flex align="center" gap="3">
        {pending ? (
          <img className={styles.thumb} src={pending.previewUrl} alt={alt} />
        ) : storedPath ? (
          <RecordImage path={storedPath} alt={alt} />
        ) : null}
        <Flex direction="column" gap="2" align="start">
          {pending ? (
            <Text size="1" color="gray">
              {formatRecordImageKilobytes(pending.bytes)}
            </Text>
          ) : null}
          <Button
            type="button"
            size="3"
            color="gray"
            variant="surface"
            disabled={disabled || compressing}
            onClick={() => inputRef.current?.click()}
          >
            {compressing ? 'Сжимаем…' : hasImage ? 'Заменить' : 'Выбрать фото'}
          </Button>
          {hasImage ? (
            <Button
              type="button"
              size="3"
              color="red"
              variant="surface"
              disabled={disabled || compressing}
              onClick={() => {
                setError(null)
                onClear()
              }}
            >
              Удалить
            </Button>
          ) : null}
        </Flex>
      </Flex>
      {/* .heic/.heif: в Chrome image/* не показывает снимки айфона в диалоге */}
      <input
        ref={inputRef}
        className={styles.fileInput}
        type="file"
        accept="image/*,.heic,.heif"
        aria-label={alt}
        disabled={disabled || compressing}
        onChange={(e) => {
          void onFile(e.target.files?.[0])
        }}
      />
      {error ? (
        <Text size="1" color="crimson" role="alert">
          {error}
        </Text>
      ) : null}
    </Flex>
  )
}
