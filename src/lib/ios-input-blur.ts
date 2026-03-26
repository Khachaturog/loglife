import type { KeyboardEvent } from 'react'

/** Enter с цифровой клавиатуры / старый WebKit (key может быть пустым). */
function isEnterLike(e: KeyboardEvent<HTMLInputElement>): boolean {
  if (e.key === 'Enter' || e.key === 'NumpadEnter') return true
  if (e.code === 'Enter' || e.code === 'NumpadEnter') return true
  const ne = e.nativeEvent as unknown as { keyCode?: number; which?: number }
  return ne.keyCode === 13 || ne.which === 13
}

/**
 * iOS: «Готово» (✓) часто даёт Enter; в <form> Enter иначе уходит в неявный submit без blur.
 * Для type="number" WebKit часто вообще не шлёт keydown — см. поля с inputMode="decimal" и type="text".
 */
export function blurInputOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (!isEnterLike(e)) return
  e.preventDefault()
  e.currentTarget.blur()
}

/**
 * iOS: неявный submit по Enter/«Готово» иногда не снимает фокус с поля, хотя сработал onSubmit.
 * Снимаем фокус с input внутри этой формы сразу после preventDefault.
 */
export function blurActiveInputInForm(form: HTMLFormElement) {
  const ae = document.activeElement
  if (ae instanceof HTMLInputElement && form.contains(ae)) {
    ae.blur()
  }
}
