import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { setApiUserId } from '@/lib/api'

type AuthContextValue = {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true })

/**
 * Извлекает project ref из VITE_SUPABASE_URL (поддомен вида https://<ref>.supabase.co).
 * Нужен для чтения ключа сессии из localStorage: sb-<ref>-auth-token.
 * Не хардкодим ref — иначе self-hosted пользователи читали бы чужой ключ.
 */
function getSupabaseProjectRef(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!url) return ''
  try {
    return new URL(url).hostname.split('.')[0]
  } catch {
    return ''
  }
}

/**
 * Синхронно читает пользователя из localStorage (Supabase JS v2 хранит сессию там).
 * Позволяет избежать блокирующего спиннера при первом рендере — getSession() проверит
 * токен в фоне и обновит состояние при необходимости.
 */
function getInitialUser(): User | null {
  try {
    const projectRef = getSupabaseProjectRef()
    if (!projectRef) return null
    const raw = localStorage.getItem(`sb-${projectRef}-auth-token`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { user?: User; expires_at?: number } | null
    // Если токен уже истёк — не используем кешированного пользователя
    if (parsed?.expires_at && parsed.expires_at * 1000 < Date.now()) return null
    return parsed?.user ?? null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Синхронный кеш из localStorage — только для начального состояния; истёкший access-токен
  // здесь обнуляется, но refresh по-прежнему сработает в getSession() ниже.
  const [user, setUser] = useState<User | null>(getInitialUser)
  // Пока не завершилась первая getSession(), App не решает «редирект на логин» — иначе при
  // просроченном access-токене и валидном refresh показывался бы лишний экран входа.
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function hydrateSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (cancelled) return
        const u = session?.user ?? null
        setUser(u)
        setApiUserId(u?.id ?? null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void hydrateSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      setApiUserId(u?.id ?? null)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({ user, loading }), [user, loading])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
