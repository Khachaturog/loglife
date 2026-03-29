/**
 * Разбор текста описания дела на фрагменты «обычный текст» и «http(s) URL» для отображения.
 * Не используем внешний linkify — только безопасные схемы в href.
 */

export type DescriptionSegment =
  | { type: "text"; value: string }
  | { type: "url"; href: string };

/** Подходит под распознавание URL в тексте (без пробелов и угловых скобок) */
const URL_IN_TEXT_RE =
  /https?:\/\/[^\s<>"'`]+/gi;

/** Срезать типичный «хвост» пунктуации у совпадения из текста */
function trimTrailingPunctuationFromUrl(raw: string): string {
  return raw.replace(/[.,;:!?)\]}]+$/u, "");
}

function safeHttpUrl(href: string): string | null {
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Делит строку на чередование текста и распознанных URL.
 * Нераспознанные куски остаются текстом.
 */
export function parseDescriptionToSegments(text: string): DescriptionSegment[] {
  const segments: DescriptionSegment[] = [];
  let lastIndex = 0;
  const re = new RegExp(URL_IN_TEXT_RE.source, URL_IN_TEXT_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const start = m.index;
    if (start > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    const candidate = trimTrailingPunctuationFromUrl(raw);
    const href = safeHttpUrl(candidate);
    if (href) {
      segments.push({ type: "url", href });
    } else {
      segments.push({ type: "text", value: raw });
    }
    lastIndex = start + raw.length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}
