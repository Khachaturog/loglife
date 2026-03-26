import { WebHaptics } from 'web-haptics'
import type { HapticInput, TriggerOptions } from 'web-haptics'

const supported = WebHaptics.isSupported

/**
 * Один экземпляр на приложение (без showSwitch).
 *
 * - Не делаем ранний return при `!isSupported`: библиотека сама обрабатывает отсутствие API
 *   (скрытый DOM-клик; при `debug` — звук на десктопе / без vibrate).
 * - В dev, если Vibration API нет (iOS Safari, десктоп), `debug` даёт слышимый клик — так видно,
 *   что вызовы доходят (на iPhone в Safari веб-вибрации по-прежнему нет — это ограничение ОС).
 */
const haptics = new WebHaptics({
  debug: import.meta.env.DEV && !supported,
})

/** Чуть заметнее дефолта библиотеки для обычных тапов. */
const defaultTap: HapticInput = 'light'

export function triggerHaptic(input?: HapticInput, options?: TriggerOptions) {
  void haptics.trigger(input ?? defaultTap, options)
}

export { WebHaptics }
