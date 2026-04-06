import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link as RouterLink } from 'react-router-dom'
import { EyeClosedIcon, EyeOpenIcon } from '@radix-ui/react-icons'
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  IconButton,
  Link,
  Text,
  TextField,
} from '@radix-ui/themes'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

/**
 * Страница входа и регистрации.
 * Поддерживает переключение режима (вход/регистрация) и redirect после успешной авторизации.
 * Стили только через Radix Themes (без локальных оверрайдов).
 */
/**
 * Куда увести после успешного входа. Профиль не используем как цель — после логина открываем главную,
 * иначе при редиректе с /login?redirect=/profile пользователь снова попадал бы на вкладку «Профиль».
 */
function safeRedirectPath(raw: string | null): string {
  if (!raw) return '/'
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/') || trimmed.includes('//')) return '/'
  const pathOnly = (trimmed.split('?')[0] ?? '/').replace(/\/+$/, '') || '/'
  if (pathOnly === '/profile') return '/'
  return trimmed
}

/** Поле пароля с переключателем видимости (слот справа в TextField). */
function PasswordTextField({
  id,
  name,
  placeholder,
  value,
  onValueChange,
  autoComplete,
  disabled,
  minLength,
  color,
  visible,
  onToggleVisible,
}: {
  id: string
  name?: string
  placeholder: string
  value: string
  onValueChange: (next: string) => void
  autoComplete: string
  disabled: boolean
  minLength?: number
  color?: 'crimson'
  visible: boolean
  onToggleVisible: () => void
}) {
  return (
    <TextField.Root
      id={id}
      name={name}
      placeholder={placeholder}
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={(ev) => onValueChange(ev.target.value)}
      autoComplete={autoComplete}
      disabled={disabled}
      minLength={minLength}
      size="3"
      color={color}
    >
      <TextField.Slot side="right">
        <IconButton
          type="button"
          variant="ghost"
          color="gray"
          size="2"
          aria-pressed={visible}
          aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
          onClick={(ev) => {
            ev.preventDefault()
            onToggleVisible()
          }}
          disabled={disabled}
        >
          {visible ? <EyeClosedIcon /> : <EyeOpenIcon />}
        </IconButton>
      </TextField.Slot>
    </TextField.Root>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectTo = safeRedirectPath(searchParams.get('redirect'))
  const { user } = useAuth()

  useEffect(() => {
    if (user) navigate(redirectTo, { replace: true })
  }, [user, navigate, redirectTo])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [passwordConfirmVisible, setPasswordConfirmVisible] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Введите email и пароль')
      return
    }
    if (isSignUp) {
      if (!passwordConfirm) {
        setError('Введите пароль повторно')
        return
      }
      if (password !== passwordConfirm) {
        setError('Пароли не совпадают')
        return
      }
    }
    setError(null)
    setLoading(true)
    try {
      if (isSignUp) {
        const { error: err } = await supabase.auth.signUp({ email: email.trim(), password })
        if (err) throw err
        navigate(redirectTo)
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (err) throw err
        navigate(redirectTo)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  function toggleSignUp() {
    setError(null)
    setPasswordVisible(false)
    setPasswordConfirmVisible(false)
    setIsSignUp((v) => {
      const next = !v
      if (!next) setPasswordConfirm('')
      return next
    })
  }

  const fieldColor = error ? ('crimson' as const) : undefined

  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      minHeight="100vh"
      width="100%"
      pb="8"
    >
      <Box width="100%" maxWidth="400px">
        <Card>
          <form onSubmit={handleSubmit}>
            <Flex direction="column" gap="4" p="4">
              <Flex direction="column" align="center" gap="1" mb="3">
                <Heading as="h1" size="6" weight="bold" align="center">
                  {isSignUp ? 'Приветствуем тебя!' : 'С возвращением!'}
                </Heading>
                <Text size="2" color="gray" align="center">
                  {isSignUp ? 'Зарегистрируйся в Log Life' : 'Войди в аккаунт Log Life'}
                </Text>
              </Flex>

              <Flex direction="column" gap="1">
                <Text as="label" htmlFor="login-email" size="2" weight="medium" >
                  Электронная почта
                </Text>
                <TextField.Root
                  id="login-email"
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  autoComplete="email"
                  disabled={loading}
                  size="3"
                  color={fieldColor}
                />
              </Flex>

              <Flex direction="column" gap="1">
                <Flex justify="between" align="center" gap="2">
                  <Text as="label" htmlFor="login-password" size="2" weight="medium" >
                    Пароль
                  </Text>
                  {!isSignUp ? (
                    <Link href="#" size="2" underline="hover" onClick={(e) => e.preventDefault()}>
                      Забыли пароль?
                    </Link>
                  ) : null}
                </Flex>
                <PasswordTextField
                  id="login-password"
                  name="password"
                  placeholder={isSignUp ? 'Не менее 6 символов' : '••••••••'}
                  value={password}
                  onValueChange={setPassword}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  disabled={loading}
                  minLength={6}
                  color={fieldColor}
                  visible={passwordVisible}
                  onToggleVisible={() => setPasswordVisible((v) => !v)}
                />
              </Flex>

              {isSignUp ? (
                <Flex direction="column" gap="1">
                  <Text as="label" htmlFor="login-password-confirm" size="2" weight="medium">
                    Повторите пароль
                  </Text>
                  <PasswordTextField
                    id="login-password-confirm"
                    name="password-confirm"
                    placeholder="••••••••"
                    value={passwordConfirm}
                    onValueChange={setPasswordConfirm}
                    autoComplete="new-password"
                    disabled={loading}
                    minLength={6}
                    color={fieldColor}
                    visible={passwordConfirmVisible}
                    onToggleVisible={() => setPasswordConfirmVisible((v) => !v)}
                  />
                </Flex>
              ) : null}

              <Flex direction="column" gap="2" width="100%">
                <Button type="submit" size="3" disabled={loading} style={{ width: '100%' }}>
                  {loading ? 'Загрузка…' : isSignUp ? 'Зарегистрироваться' : 'Войти'}
                </Button>
                {error ? (
                  <Text color="crimson" size="2" role="alert">
                    {error}
                  </Text>
                ) : null}
              </Flex>

              <Text size="2" color="gray" align="center" mt="2" >
                {isSignUp ? (
                  <>
                    Уже есть аккаунт?{' '}
                    <Link ml="1" size="2" href="#" underline="hover" onClick={(e) => { e.preventDefault(); toggleSignUp() }}>
                      Войти
                    </Link>
                  </>
                ) : (
                  <>
                    Нет аккаунта?{' '}
                    <Link ml="1" size="2" href="#" underline="hover" onClick={(e) => { e.preventDefault(); toggleSignUp() }}>
                      Зарегистрироваться
                    </Link>
                  </>
                )}
              </Text>
            </Flex>
          </form>
        </Card>
      </Box>

      <Box maxWidth="400px" mt="5" px="2" width="100%">
        <Text as="p" size="2" color="gray" align="center">
          Продолжая пользоваться сервисом, ты&nbsp;соглашаешься
          <br />с&nbsp;
          <Link asChild size="2" underline="hover">
            <RouterLink to="/terms">Условиями использования</RouterLink>
          </Link>{' '}
          и&nbsp;
          <Link asChild size="2" underline="hover">
            <RouterLink to="/privacy">Политикой конфиденциальности</RouterLink>
          </Link>
        </Text>
      </Box>
    </Flex>
  )
}
