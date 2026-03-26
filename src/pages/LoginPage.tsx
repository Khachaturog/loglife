import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Flex, Heading, Link as RadixLink, Text, TextField } from '@radix-ui/themes'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import styles from './LoginPage.module.css'

/**
 * Страница входа и регистрации.
 * Поддерживает переключение режима (вход/регистрация) и redirect после успешной авторизации.
 */
function safeRedirectPath(raw: string | null): string {
  if (!raw) return '/'
  const trimmed = raw.trim()
  if (trimmed.startsWith('/') && !trimmed.includes('//')) return trimmed
  return '/'
}

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectTo = safeRedirectPath(searchParams.get('redirect'))
  const { user } = useAuth()

  // Уже есть сессия (например, зашли по закладке /login) — уводим на целевой маршрут без формы
  useEffect(() => {
    if (user) navigate(redirectTo, { replace: true })
  }, [user, navigate, redirectTo])

  // --- Состояние формы ---
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Введите email и пароль')
      return
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

  return (
    <Flex align="center" justify="center" className={styles.wrapper}>
      <Card className={styles.card}>
        <Heading size="4" mb="3">
          {isSignUp ? 'Регистрация' : 'Вход'}
        </Heading>
        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="3">
            <TextField.Root
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
              size="3"
            />
            <TextField.Root
              placeholder="Пароль"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              disabled={loading}
              minLength={6}
              size="3"
            />
          </Flex>
          {error && (
            <Text color="crimson" size="2" mt="2">
              {error}
            </Text>
          )}
          <Button type="submit" disabled={loading} mt="3">
            {loading ? 'Загрузка…' : isSignUp ? 'Зарегистрироваться' : 'Войти'}
          </Button>
        </form>
        <Text as="p" mt="3" size="2">
          {isSignUp ? 'Уже есть аккаунт?' : 'Нет аккаунта?'}{' '}
          <Button
            type="button"
            variant="ghost"
            size="2"
            onClick={() => setIsSignUp((v) => !v)}
          >
            {isSignUp ? 'Войти' : 'Регистрироваться'}
          </Button>
        </Text>
        <Text as="p" mt="2" size="2">
          <RadixLink asChild>
            <Link to="/">На главную</Link>
          </RadixLink>
        </Text>
      </Card>
    </Flex>
  )
}
