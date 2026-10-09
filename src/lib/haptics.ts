import { WebHaptics } from 'web-haptics'
import type { HapticInput, TriggerOptions } from 'web-haptics'

/**
 * Один экземпляр на приложение (без showSwitch).
 * `debug` у библиотеки не включаем — иначе при отсутствии Vibration API играет звуковой клик;
 * нужны только нативные вибрации там, где `navigator.vibrate` доступен.
 *
 * Ранний return при `!isSupported` не делаем: `trigger()` безопасен, лишний звук не включается.
 */
const haptics = new WebHaptics({
  debug: false,
})

/** Дефолт для вызова без аргумента — заметная отдача (см. пресеты web-haptics). */
const defaultTap: HapticInput = 'heavy'

const IOS_SWITCH_ID = 'loglife-haptic-switch'

/**
 * На iPhone нет Vibration API. Системный щелчок даёт скрытый checkbox[switch],
 * если его не прятать через display:none и кликнуть в том же жесте.
 */
function triggerIosSwitchHaptic() {
  let input = document.getElementById(IOS_SWITCH_ID) as HTMLInputElement | null
  if (!input) {
    const label = document.createElement('label')
    label.style.position = 'fixed'
    label.style.left = '0'
    label.style.bottom = '0'
    label.style.width = '1px'
    label.style.height = '1px'
    label.style.opacity = '0'
    label.style.overflow = 'hidden'
    input = document.createElement('input')
    input.type = 'checkbox'
    input.id = IOS_SWITCH_ID
    input.setAttribute('switch', '')
    label.appendChild(input)
    document.body.appendChild(label)
  }
  input.click()
}

export function triggerHaptic(input?: HapticInput, options?: TriggerOptions) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    void haptics.trigger(input ?? defaultTap, options)
    return
  }
  triggerIosSwitchHaptic()
}

export { WebHaptics }
