import { NavLink, useLocation } from 'react-router-dom'
import { ClockIcon, HomeIcon, PersonIcon, ViewGridIcon } from '@radix-ui/react-icons'
import { triggerHaptic } from '@/lib/haptics'
import styles from './TabBar.module.css'

/** Панель скрыта на: логин, юридические страницы, виджет кликер, создание дела, редактирование дела, форма записи, просмотр/редактирование записи */
export function useTabBarVisible(): boolean {
  const path = useLocation().pathname
  if (path === '/login') return false
  if (path === '/privacy' || path === '/terms') return false
  if (path === '/deeds/new') return false
  if (path.match(/\/deeds\/[^/]+\/(edit|fill)/)) return false
  if (path === '/widgets/clicker') return false
  if (/^\/records\/[^/]+$/.test(path)) return false
  return true
}

/** Плавающая нижняя панель: 4 раздела (механика iOS 26, стиль Radix) */
export function TabBar() {
  const visible = useTabBarVisible()
  // В этой версии TabBar нет кнопки «Назад» — она должна быть единственным хедером/навигацией на странице.
  // Нижняя панель содержит только основные разделы приложения.

  if (!visible) return null

  return (
    <div className={styles.barWrapper}>
      <nav className={styles.tabBar}>
      <NavLink
        to="/"
        onClick={() => triggerHaptic('medium', { intensity: 1 })}
        className={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}
      >
        <HomeIcon width={20} height={20} />
        <span>Главная</span>
      </NavLink>
      <NavLink
        to="/widgets"
        end={false}
        onClick={() => triggerHaptic('medium', { intensity: 1 })}
        className={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}
      >
        <ViewGridIcon width={20} height={20} />
        <span>Виджеты</span>
      </NavLink>
      <NavLink
        to="/history"
        onClick={() => triggerHaptic('medium', { intensity: 1 })}
        className={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}
      >
        <ClockIcon width={20} height={20} />
        <span>История</span>
      </NavLink>
      <NavLink
        to="/profile"
        onClick={() => triggerHaptic('medium', { intensity: 1 })}
        className={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}
      >
        <PersonIcon width={20} height={20} />
        <span>Профиль</span>
      </NavLink>
    </nav>
    </div>
  )
}
