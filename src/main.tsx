import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
/* После темы: переопределения (в т.ч. font-size полей) должны побеждать специфичность Radix */
import '@/styles/global.css'
import 'air-datepicker/air-datepicker.css'
import '@/styles/air-datepicker-overrides.css'
import { AuthProvider } from '@/lib/auth-context'
import { Agentation } from 'agentation'
import App from './App'

/** Agentation только на десктопе с localhost (на туннеле/телефоне не грузим). */
function isAgentationHost(): boolean {
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1'
}

/** В dev не подключаем Agentation на мобильных — не нужен и ломает сеть к localhost:4747. */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true
  // iPad в desktop mode: Macintosh + touch
  return navigator.maxTouchPoints > 1 && window.matchMedia('(pointer: coarse)').matches
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" attribute="class" storageKey="log-life-theme">
      <Theme accentColor="indigo" grayColor="slate" radius="large" scaling="100%">
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AuthProvider>
            <App />
            {import.meta.env.DEV && isAgentationHost() && !isMobileDevice() && (
              <Agentation endpoint="http://localhost:4747" />
            )}
          </AuthProvider>
        </BrowserRouter>
      </Theme>
    </ThemeProvider>
  </StrictMode>,
)
