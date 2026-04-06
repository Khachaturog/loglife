import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Box, Button, Flex, Heading, IconButton, Link, RadioGroup, Separator, Text, TextField } from '@radix-ui/themes'
import { AppBar } from '@/components/AppBar'
import { ExitIcon } from '@radix-ui/react-icons'
import { DatePicker } from '@/components/DatePicker'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { exportAllToCsv, downloadCsv } from '@/lib/export-csv'
import { todayLocalISO } from '@/lib/format-utils'
import { getGithubRepoUrl, getSupportAuthorUrl } from '@/lib/app-external-links'
import layoutStyles from '@/styles/layout.module.css'
import styles from './ProfilePage.module.css'

const MIN_PASSWORD_LENGTH = 6

function monthAgo(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Страница профиля.
 * Аккаунт, смена пароля, экспорт в CSV.
 */
export function ProfilePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const supportUrl = getSupportAuthorUrl()
  const githubUrl = getGithubRepoUrl()

  // --- Состояние ---
  const [exporting, setExporting] = useState(false)
  const [periodMode, setPeriodMode] = useState<'all' | 'custom'>('all')
  const [startDate, setStartDate] = useState(monthAgo())
  const [endDate, setEndDate] = useState(todayLocalISO())

  // Смена пароля
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordChanging, setPasswordChanging] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  async function handleExportCsv() {
    setExporting(true)
    try {
      const period =
        periodMode === 'custom' && startDate && endDate
          ? { startDate, endDate }
          : undefined
      const csv = await exportAllToCsv(period)
      const name = `log-life-export-${todayLocalISO()}.csv`
      downloadCsv(csv, name)
    } catch (e) {
      console.error(e instanceof Error ? e.message : 'Ошибка экспорта')
    } finally {
      setExporting(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordMessage(null)
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordMessage({ type: 'error', text: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов` })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Пароли не совпадают' })
      return
    }
    setPasswordChanging(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setPasswordMessage({ type: 'error', text: error.message })
        return
      }
      setPasswordMessage({ type: 'success', text: 'Пароль успешно изменён' })
      setNewPassword('')
      setConfirmPassword('')
    } catch (e) {
      setPasswordMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Не удалось изменить пароль',
      })
    } finally {
      setPasswordChanging(false)
    }
  }

  return (
    <Box
      className={layoutStyles.pageContainer}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <AppBar
        title="Профиль"
        actions={
          <IconButton
            variant="classic"
            color="red"
            size="3"
            radius="full"
            onClick={handleSignOut}
            aria-label="Выйти"
          >
            <ExitIcon width={18} height={18} />
          </IconButton>
        }
      />

      {/* Скролл только здесь: иначе sticky в AppBar ломается (предок с flex + minHeight:0 в App — не тот scrollport) */}
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Flex direction="column" gap="5" mt="-5" pb="4">
      {/* Аккаунт */}
      <Flex direction="column" gap="1">
        <Heading size="3" >
          Аккаунт
        </Heading>
        {user?.email && (
          <Text as="p" size="2" >
            {user.email}
          </Text>
        )}
      </Flex>

      {/* Смена пароля */}
      <Flex direction="column" gap="2">
        <Heading size="3" >
          Смена пароля
        </Heading>
        <form onSubmit={handleChangePassword}>
          <Flex direction="column" gap="2">
            <TextField.Root
              size="3"
              placeholder="Новый пароль (минимум 6 символов)"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              disabled={passwordChanging}
            />
            <TextField.Root
              size="3"
              placeholder="Подтвердите пароль"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={passwordChanging}
            />
            {passwordMessage && (
              <Text
                size="2"
                color={passwordMessage.type === 'error' ? 'crimson' : 'green'}
              >
                {passwordMessage.text}
              </Text>
            )}
            
            <Flex align="start">
              <Button 
              size="3"
              color="gray"
              variant="soft"
              type="submit" 
              disabled={passwordChanging}
              >
                {passwordChanging ? 'Сохранение…' : 'Сменить пароль'}
              </Button>
            </Flex>
          </Flex>
        </form>
      </Flex>
      
      {/* Экспорт в CSV */}
      <Flex direction="column" gap="2">
        <Flex direction="column" gap="1">
          <Heading size="3">
            Экспорт в CSV
          </Heading>
          <Text as="p" size="2" color="gray">
            Скачать дела и записи в один CSV‑файл
          </Text>
        </Flex>
        <RadioGroup.Root 
        value={periodMode} 
        onValueChange={(v) => setPeriodMode(v as 'all' | 'custom')}
        size="3"
        >
          <Flex direction="column" gap="2">
            <Text as="label" size="3" className={styles.radioLabel}>
              <RadioGroup.Item value="all" />
              Весь период
            </Text>
            <Text as="label" size="3" className={styles.radioLabel}>
              <RadioGroup.Item value="custom" />
              Свой период
            </Text>
          </Flex>
        </RadioGroup.Root>
        {periodMode === 'custom' && (
          <Flex gap="2" >
            <Flex align="center" gap="2">
              <Text size="2">С</Text>
              <DatePicker value={startDate} onChange={setStartDate} maxDate={endDate} />
            </Flex>
            <Flex align="center" gap="2">
              <Text size="2">по</Text>
              <DatePicker value={endDate} onChange={setEndDate} minDate={startDate} />
            </Flex>
          </Flex>
        )}
        <Flex align="start">
          <Button 
          size="3" 
          color="gray" 
          variant="soft"
          onClick={handleExportCsv} 
          disabled={exporting}>
            {exporting ? 'Экспорт…' : 'Скачать CSV'}
          </Button>
        </Flex>
      </Flex>

      {/* Футер: юридические и внешние ссылки (как в типичных мобильных настройках) */}
      <Separator size="4" />
      <Flex direction="column" gap="3" align="stretch" pt="1" pb="6">
        <Text size="1" color="gray" weight="medium">
          О приложении
        </Text>
        <Flex direction="column" gap="2" align="stretch">
          {supportUrl && (
            <Link href={supportUrl} size="2" underline="hover" target="_blank" rel="noopener noreferrer">
              Поддержать автора
            </Link>
          )}
          <Link asChild size="2" underline="hover">
            <RouterLink to="/terms">Условия использования</RouterLink>
          </Link>
          <Link asChild size="2" underline="hover">
            <RouterLink to="/privacy">Политика конфиденциальности</RouterLink>
          </Link>
          {githubUrl && (
            <Link href={githubUrl} size="2" underline="hover" target="_blank" rel="noopener noreferrer">
              Проект на GitHub
            </Link>
          )}
        </Flex>
      </Flex>
        </Flex>
      </Box>
    </Box>
  )
}
