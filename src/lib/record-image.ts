/**
 * Картинка записи: квадрат WebP в бакете, в value_json только путь.
 * Оригинал с устройства на сервер не уходит.
 */
import { supabase } from '@/lib/supabase'

export const RECORD_IMAGE_BUCKET = 'record-images'
/** Сторона файла. На экране квадрат 100px, 200px — запас для ретины. */
export const RECORD_IMAGE_EDGE = 200
/** Жёсткий потолок после сжатия. Совпадает с лимитом бакета. */
export const RECORD_IMAGE_MAX_BYTES = 24 * 1024

const WEBP_QUALITIES = [0.82, 0.7, 0.58, 0.46, 0.34, 0.24, 0.16]
/** Если на 200px файл всё ещё больше потолка — уменьшаем сторону. */
const RECORD_IMAGE_EDGE_FALLBACKS = [160, 128, 96]
const SIGNED_URL_TTL_SEC = 60 * 60
const SIGNED_URL_CACHE_MS = 50 * 60 * 1000

/** Сжатый файл ещё не в Storage: превью через object URL. */
export type PendingRecordImage = {
  blob: Blob
  bytes: number
  previewUrl: string
}

export function recordImageObjectPath(userId: string, recordId: string, blockId: string): string {
  return `${userId}/${recordId}/${blockId}.webp`
}

/** Путь из ответа: три сегмента и расширение webp, без посторонних символов. */
export function imagePathFromValue(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = (value as { imagePath?: unknown }).imagePath
  if (typeof raw !== 'string') return null
  const path = raw.trim()
  if (!/^[^/]+\/[^/]+\/[^/]+\.webp$/.test(path)) return null
  return path
}

export function isOwnRecordImagePath(path: string, userId: string): boolean {
  return path.startsWith(`${userId}/`) && imagePathFromValue({ imagePath: path }) === path
}

/** Первая по sort_order картинка записи, у которой есть файл. Удалённые блоки не берём. */
export function firstRecordImagePath(
  blocks: {
    id: string
    block_type: string
    sort_order: number
    deleted_at?: string | null
    title?: string
    show_in_preview?: boolean
  }[],
  answers: { block_id: string; value_json: unknown }[],
): { path: string; title: string } | null {
  const images = blocks
    .filter((b) => !b.deleted_at && b.block_type === 'image' && b.show_in_preview !== false)
    .sort((a, b) => a.sort_order - b.sort_order)
  const byBlock = new Map(answers.map((a) => [a.block_id, a.value_json]))
  for (const block of images) {
    const path = imagePathFromValue(byBlock.get(block.id))
    if (path) return { path, title: block.title?.trim() || 'Картинка' }
  }
  return null
}

export function formatRecordImageKilobytes(bytes: number): string {
  const kb = bytes / 1024
  if (kb < 10) return `${kb.toFixed(1)} КБ`
  return `${Math.round(kb)} КБ`
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality)
  })
}

/**
 * Холст без альфы: иначе Chrome пишет WebP без потерь и игнорирует quality.
 * Если браузер не принимает alpha: false — обычный холст, перед кадром всё равно белая заливка.
 */
function drawOpaqueSquare(
  bitmap: ImageBitmap,
  sx: number,
  sy: number,
  side: number,
  edge: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = edge
  canvas.height = edge
  const ctx = canvas.getContext('2d', { alpha: false }) ?? canvas.getContext('2d')
  if (!ctx) throw new Error('Не получилось подготовить картинку.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, edge, edge)
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, edge, edge)
  return canvas
}

/**
 * Safari (айфон) на toBlob('image/webp') молча отдаёт PNG.
 * Качество на PNG не действует, поэтому файл не ужимается до 24 КБ.
 * null — ещё не проверяли, true — холст пишет настоящий WebP.
 */
let canvasWritesWebp: boolean | null = null

/** Качество вниз, пока файл не влезет в потолок. */
async function encodeUnderLimit(canvas: HTMLCanvasElement): Promise<Blob | undefined> {
  if (canvasWritesWebp !== false) {
    const native = await encodeNativeWebp(canvas)
    if (native !== 'unsupported') return native
    canvasWritesWebp = false
  }
  return encodeLibwebp(canvas)
}

async function encodeNativeWebp(canvas: HTMLCanvasElement): Promise<Blob | undefined | 'unsupported'> {
  let sawWebp = false
  for (const quality of WEBP_QUALITIES) {
    const blob = await canvasToWebp(canvas, quality)
    if (!blob || blob.type !== 'image/webp') return sawWebp ? undefined : 'unsupported'
    sawWebp = true
    canvasWritesWebp = true
    if (blob.size <= RECORD_IMAGE_MAX_BYTES) return blob
  }
  return undefined
}

/** Запасной кодировщик: libwebp, только когда холст сам WebP не пишет. */
async function encodeLibwebp(canvas: HTMLCanvasElement): Promise<Blob | undefined> {
  const ctx = canvas.getContext('2d', { alpha: false }) ?? canvas.getContext('2d')
  if (!ctx) return undefined
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { encode } = await import('@jsquash/webp')
  for (const quality of WEBP_QUALITIES) {
    const buffer = await encode(imageData, { quality: Math.round(quality * 100) })
    const blob = webpBlob(buffer)
    if (blob && blob.size <= RECORD_IMAGE_MAX_BYTES) return blob
  }
  return undefined
}

/** Байты WebP с заголовка RIFF. Чужой буфер целиком не берём. */
function webpBlob(buffer: ArrayBuffer): Blob | null {
  if (buffer.byteLength < 12) return null
  const bytes = new Uint8Array(buffer)
  const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
  const webp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  if (!riff || !webp) return null
  const size = 8 + new DataView(buffer).getUint32(4, true)
  if (size < 12 || size > bytes.length) return null
  return new Blob([bytes.subarray(0, size)], { type: 'image/webp' })
}

const OPEN_ERROR = 'Не получилось открыть файл.'

/**
 * JPEG, PNG, WebP и HEIC в Safari открывает сам браузер.
 * HEIC в Chrome и Firefox — нет: createImageBitmap падает, хотя файл с айфона нормальный.
 * Декодер подгружается только в этом случае, чтобы обычные фото не тянули библиотеку.
 */
async function openRecordImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file)
  } catch {
    // Дальше пробуем HEIC.
  }
  let heic = false
  try {
    const { heicTo, isHeic } = await import('heic-to')
    heic = await isHeic(file)
    if (heic) return await heicTo({ blob: file, type: 'bitmap' })
  } catch {
    if (heic) throw new Error(OPEN_ERROR)
  }
  throw new Error(OPEN_ERROR)
}

/**
 * Центр кадра в квадрат WebP, обычно 200×200.
 * Если на этой стороне файл больше 24 КБ — сторона 160, 128, затем 96.
 */
export async function compressRecordImage(file: File): Promise<{ blob: Blob; bytes: number }> {
  const bitmap = await openRecordImage(file)
  try {
    const width = bitmap.width
    const height = bitmap.height
    if (!width || !height) throw new Error(OPEN_ERROR)
    const side = Math.min(width, height)
    const sx = (width - side) / 2
    const sy = (height - side) / 2
    const edges = [RECORD_IMAGE_EDGE, ...RECORD_IMAGE_EDGE_FALLBACKS]

    for (const edge of edges) {
      const canvas = drawOpaqueSquare(bitmap, sx, sy, side, edge)
      const blob = await encodeUnderLimit(canvas)
      if (blob) return { blob, bytes: blob.size }
    }
    throw new Error('Не получилось подготовить картинку.')
  } finally {
    bitmap.close()
  }
}

export async function uploadRecordImage(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from(RECORD_IMAGE_BUCKET).upload(path, blob, {
    contentType: 'image/webp',
    upsert: true,
    cacheControl: '3600',
  })
  if (error) throw new Error(error.message || 'Не удалось загрузить картинку')
  cache.delete(path)
}

export async function copyRecordImage(fromPath: string, toPath: string): Promise<void> {
  const { error } = await supabase.storage.from(RECORD_IMAGE_BUCKET).copy(fromPath, toPath)
  if (error) throw new Error(error.message || 'Не удалось скопировать картинку')
}

export async function deleteRecordImages(paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter((p) => p.length > 0))]
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const { error } = await supabase.storage.from(RECORD_IMAGE_BUCKET).remove(chunk)
    // Повторное удаление уже снятого файла не должно ронять удаление записи.
    if (error && !/not found/i.test(error.message)) {
      throw new Error(error.message || 'Не удалось удалить картинку')
    }
    for (const path of chunk) cache.delete(path)
  }
}

const cache = new Map<string, { url: string; at: number }>()
const pendingSign = new Map<string, Array<(url: string | null) => void>>()
let signTimer: ReturnType<typeof setTimeout> | null = null

/** Подписанный URL с короткой очередью: карточки списка подписываются одним запросом. */
export function requestRecordImageUrl(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < SIGNED_URL_CACHE_MS) return Promise.resolve(hit.url)
  return new Promise((resolve) => {
    const list = pendingSign.get(path) ?? []
    list.push(resolve)
    pendingSign.set(path, list)
    if (signTimer == null) {
      signTimer = setTimeout(() => {
        void flushSignedUrls()
      }, 30)
    }
  })
}

async function flushSignedUrls(): Promise<void> {
  signTimer = null
  const batch = new Map(pendingSign)
  pendingSign.clear()
  const paths = [...batch.keys()]
  if (paths.length === 0) return
  const { data, error } = await supabase.storage
    .from(RECORD_IMAGE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SEC)
  const byPath = new Map<string, string>()
  if (!error && data) {
    data.forEach((row, index) => {
      const path = row.path || paths[index]
      if (!path || row.error || !row.signedUrl) return
      byPath.set(path, row.signedUrl)
      cache.set(path, { url: row.signedUrl, at: Date.now() })
    })
  }
  for (const [path, waiters] of batch) {
    const url = byPath.get(path) ?? null
    for (const resolve of waiters) resolve(url)
  }
}
