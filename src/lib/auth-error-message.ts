/**
 * Тексты ошибок Supabase Auth для форм входа, регистрации и смены пароля.
 * Опираемся на `code`: у части старых ответов он пустой, тогда узнаём ситуацию по `message`.
 * Незнакомый английский текст на экран не кладём — подставляем общую фразу формы.
 */

export type AuthErrorForm = 'login' | 'signup' | 'password'

const FALLBACK: Record<AuthErrorForm, string> = {
  login: 'Не получилось войти. Попробуйте ещё раз',
  signup: 'Не получилось зарегистрироваться. Попробуйте ещё раз',
  password: 'Не удалось изменить пароль',
}

function errorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('code' in err)) return undefined
  return typeof err.code === 'string' ? err.code : undefined
}

function errorName(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('name' in err)) return undefined
  return typeof err.name === 'string' ? err.name : undefined
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return ''
}

function weakPasswordReasons(err: unknown): string[] {
  if (!err || typeof err !== 'object' || !('reasons' in err) || !Array.isArray(err.reasons)) return []
  return err.reasons.filter((item): item is string => typeof item === 'string')
}

/** «1 секунду», «2 секунды», «5 секунд» — для лимита «подождите N секунд». */
function secondsLabel(total: number): string {
  const n = Math.max(0, Math.floor(total))
  const mod10 = n % 10
  const mod100 = n % 100
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'секунду'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'секунды'
        : 'секунд'
  return `${n} ${word}`
}

function rateLimitMessage(code: string | undefined, message: string): string {
  const seconds = message.match(/after (\d+) seconds/i)?.[1]
  if (seconds) {
    return `Слишком много попыток. Подождите ${secondsLabel(Number(seconds))} и попробуйте снова`
  }
  // Сервер пишет именно "email rate limit exceeded", когда писем на адрес уже слишком много.
  if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(message)) {
    return 'Слишком много писем на этот адрес. Подождите и попробуйте снова'
  }
  // "Rate limit exceeded" и "Request rate limit reached" — лимит запросов, не писем.
  return 'Слишком много попыток. Подождите немного и попробуйте снова'
}

function weakPasswordMessage(message: string, reasons: string[]): string {
  if (reasons.includes('pwned') || /easy to guess|known to be weak/i.test(message)) {
    return 'Этот пароль слишком простой. Придумайте другой'
  }
  const min = message.match(/at least (\d+)/i)?.[1]
  if (reasons.includes('length') || min) {
    return min ? `Пароль должен быть не короче ${min} символов` : 'Пароль слишком короткий'
  }
  if (reasons.includes('characters')) return 'В пароле не хватает разных символов'
  return 'Пароль слишком простой. Придумайте другой'
}

function knownAuthMessage(err: unknown, form: AuthErrorForm): string | null {
  const code = errorCode(err)
  const name = errorName(err)
  const message = errorMessage(err)
  const reasons = weakPasswordReasons(err)

  if (
    code === 'invalid_credentials' ||
    name === 'AuthInvalidCredentialsError' ||
    /^invalid login credentials$/i.test(message)
  ) {
    return 'Неверный email или пароль'
  }
  if (code === 'email_not_confirmed' || /^email not confirmed$/i.test(message)) {
    return 'Почта ещё не подтверждена. Откройте письмо и перейдите по ссылке'
  }
  if (code === 'user_banned' || /^user is banned$/i.test(message)) {
    return 'Этот аккаунт заблокирован'
  }
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    /user already registered|already been registered/i.test(message)
  ) {
    return 'Такой email уже зарегистрирован'
  }
  if (code === 'signup_disabled' || /signups not allowed/i.test(message)) {
    return 'Регистрация сейчас закрыта'
  }
  if (code === 'email_provider_disabled' || /email (signups|logins) are disabled/i.test(message)) {
    if (form === 'signup' || /signups are disabled/i.test(message)) {
      return 'Регистрация по почте сейчас недоступна'
    }
    return 'Вход по почте сейчас недоступен'
  }
  if (
    code === 'email_address_invalid' ||
    /unable to validate email address|email address .* is invalid/i.test(message)
  ) {
    return 'Эта почта не подходит. Укажите другой адрес'
  }
  if (
    code === 'weak_password' ||
    name === 'AuthWeakPasswordError' ||
    /password should be at least|known to be weak|easy to guess/i.test(message)
  ) {
    return weakPasswordMessage(message, reasons)
  }
  if (code === 'same_password' || /new password should be different/i.test(message)) {
    return 'Новый пароль должен отличаться от текущего'
  }
  if (code === 'reauthentication_needed' || /requires reauthentication/i.test(message)) {
    return 'Чтобы сменить пароль, войдите заново'
  }
  if (
    code === 'session_not_found' ||
    code === 'session_expired' ||
    name === 'AuthSessionMissingError' ||
    /auth session missing|auth session or user missing/i.test(message)
  ) {
    return 'Сессия истекла. Войдите заново'
  }
  if (
    code === 'current_password_required' ||
    code === 'current_password_mismatch' ||
    /current password required/i.test(message)
  ) {
    return 'Чтобы сменить пароль, нужен текущий пароль'
  }
  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    code === 'over_sms_send_rate_limit' ||
    /rate.?limit|for security purposes, you can only request this after/i.test(message)
  ) {
    return rateLimitMessage(code, message)
  }
  if (
    name === 'AuthRetryableFetchError' ||
    /failed to fetch|networkerror|network request failed|load failed/i.test(message)
  ) {
    return 'Не получилось связаться с сервером. Проверьте интернет и попробуйте снова'
  }
  return null
}

/** Фраза для пользователя. Уже русский текст (наши проверки формы) оставляем как есть. */
export function authErrorMessage(err: unknown, form: AuthErrorForm): string {
  const known = knownAuthMessage(err, form)
  if (known) return known
  const message = errorMessage(err)
  if (/[а-яё]/i.test(message)) return message
  return FALLBACK[form]
}
