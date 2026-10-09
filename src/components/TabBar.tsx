import { NavLink, useLocation } from 'react-router-dom'
import { Clock, House, User, LayoutGrid } from 'lucide-react'
import { triggerHaptic } from '@/lib/haptics'
import styles from './TabBar.module.css'

/** Панель скрыта на: логин, юридические страницы, виджеты кликер, календарь и помодоро, создание дела, редактирование дела, форма записи, просмотр/редактирование записи */
export function useTabBarVisible(): boolean {
  const path = useLocation().pathname
  if (path === '/login') return false
  if (path === '/privacy' || path === '/terms') return false
  if (path === '/deeds/new') return false
  if (path.match(/\/deeds\/[^/]+\/(edit|fill)/)) return false
  if (path === '/widgets/clicker' || path === '/widgets/calendar' || path === '/widgets/pomodoro') return false
  if (/^\/records\/[^/]+$/.test(path)) return false
  return true
}

/** Нижняя панель на всю ширину, прижата к краю экрана: 4 раздела */
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
        <House width={20} height={20} />
        {/* <span>Главная</span> */}
      </NavLink>
      <NavLink
        to="/widgets"
        end={false}
        onClick={() => triggerHaptic('medium', { intensity: 1 })}
        className={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}
      >
        <LayoutGrid width={20} height={20} />
        {/* <span>Виджеты</span> */}
      </NavLink>
      <NavLink
        to="/history"
        onClick={() => triggerHaptic('medium', { intensity: 1 })}
        className={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}
      >
        <Clock width={20} height={20} />
        {/* <span>История</span> */}
      </NavLink>
      <NavLink
        to="/profile"
        onClick={() => triggerHaptic('medium', { intensity: 1 })}
        className={({ isActive }) => (isActive ? styles.tabActive : styles.tab)}
      >
        <User width={20} height={20} />
        {/* <span>Профиль</span> */}
      </NavLink>
    </nav>
    </div>
  )
}
