import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Box, Flex } from '@radix-ui/themes'
import { PageLoading } from '@/components/PageLoading'
import { useAuth } from '@/lib/auth-context'
import { TabBar, useTabBarVisible } from '@/components/TabBar'
import styles from './App.module.css'
// DeedsListPage — главная страница (маршрут /), импортируем напрямую чтобы не добавлять
// лишний HTTP-запрос и задержку lazy chunk на критическом пути загрузки
import { DeedsListPage } from '@/pages/DeedsListPage'

const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const DeedViewPage = lazy(() => import('@/pages/DeedViewPage').then((m) => ({ default: m.DeedViewPage })))
const DeedFormPage = lazy(() => import('@/pages/DeedFormPage').then((m) => ({ default: m.DeedFormPage })))
const FillFormPage = lazy(() => import('@/pages/FillFormPage').then((m) => ({ default: m.FillFormPage })))
const RecordViewPage = lazy(() => import('@/pages/RecordViewPage').then((m) => ({ default: m.RecordViewPage })))
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const HistoryPage = lazy(() => import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const WidgetsPage = lazy(() => import('@/pages/WidgetsPage').then((m) => ({ default: m.WidgetsPage })))
const ClickerPage = lazy(() => import('@/pages/ClickerPage').then((m) => ({ default: m.ClickerPage })))
const PageErrorPreviewPage = lazy(() =>
  import('@/pages/PageErrorPreviewPage').then((m) => ({ default: m.PageErrorPreviewPage })),
)
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage })))
const TermsOfUsePage = lazy(() => import('@/pages/TermsOfUsePage').then((m) => ({ default: m.TermsOfUsePage })))

// Маршруты, доступные без авторизации
const PUBLIC_PATHS = ['/login', '/privacy', '/terms']

function App() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const isPublicPage = PUBLIC_PATHS.some((p) => location.pathname === p)
  // До любых return: иначе при loading → false меняется число хуков (useTabBarVisible → useLocation).
  const showTabBar = useTabBarVisible()

  if (loading) {
    return <PageLoading />
  }

  if (!user && !isPublicPage) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }

  return (
    <Flex direction="column" className={styles.app}>
      <Box className={`${styles.main} ${showTabBar ? styles.mainWithTabBar : ''}`}>
        {/* Растягиваем маршрут на высоту main — чтобы страницы могли центрировать контент по вертикали */}
        <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<DeedsListPage />} />
              <Route path="/deeds/new" element={<DeedFormPage />} />
              <Route path="/deeds/:id" element={<DeedViewPage />} />
              <Route path="/deeds/:id/edit" element={<DeedFormPage />} />
              <Route path="/deeds/:id/fill" element={<FillFormPage />} />
              <Route path="/records/:id" element={<RecordViewPage />} />
              <Route path="/widgets" element={<WidgetsPage />} />
              <Route path="/widgets/clicker" element={<ClickerPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/error-preview" element={<PageErrorPreviewPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsOfUsePage />} />
            </Routes>
          </Suspense>
        </Box>
      </Box>

      <TabBar />
    </Flex>
  )
}

export default App
