import { TextField } from '@radix-ui/themes'
import { blurInputOnEnter } from '@/lib/ios-input-blur'

/**
 * Input with 00:00:00 mask (hours:minutes:seconds).
 * Hours 00–99, minutes and seconds 00–59.
 * Использует TextField.Root из Radix Themes для единообразия.
 */
export function DurationInput({
  value,
  onChange,
  placeholder = '00:00:00',
  disabled,
  id,
}: {
  value: string
  onChange: (hms: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
}) {
  function formatHms(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    if (digits.length <= 2) return digits
    if (digits.length <= 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`
    return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`
  }

  function clampHms(hms: string): string {
    const parts = hms.split(':')
    const h = Math.min(99, Math.max(0, parseInt(parts[0] ?? '0', 10) || 0))
    const m = Math.min(59, Math.max(0, parseInt(parts[1] ?? '0', 10) || 0))
    const s = Math.min(59, Math.max(0, parseInt(parts[2] ?? '0', 10) || 0))
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatHms(e.target.value)
    onChange(formatted.length === 8 ? clampHms(formatted) : formatted)
  }

  function handleBlur() {
    if (!value || value.trim() === '') return
    const parts = value.split(':')
    const padded =
      parts.length === 1
        ? `${(parts[0] ?? '0').padStart(2, '0')}:00:00`
        : parts.length === 2
          ? `${(parts[0] ?? '0').padStart(2, '0')}:${(parts[1] ?? '0').padStart(2, '0')}:00`
          : value
    onChange(padded.length === 8 ? clampHms(padded) : padded)
  }

  return (
    <TextField.Root
      size="3"
      type="text"
      id={id}
      inputMode="numeric"
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={blurInputOnEnter}
      disabled={disabled}
      maxLength={8}
    />
  )
}
