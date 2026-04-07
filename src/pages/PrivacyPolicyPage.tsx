import { useNavigate } from 'react-router-dom'
import { Box, Flex, Heading, Text } from '@radix-ui/themes'
import { AppBar } from '@/components/AppBar'
import layoutStyles from '@/styles/layout.module.css'

/** Публичная страница — доступна без авторизации (маршрут /privacy). */
export function PrivacyPolicyPage() {
  const navigate = useNavigate()

  return (
    <Box
      className={layoutStyles.pageContainer}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <AppBar onBack={() => navigate(-1)} title="Политика конфиденциальности" />

      {/* Скролл здесь — как на профиле, чтобы sticky AppBar на мобилках не ломался */}
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Box pb="8">
          <Flex direction="column" gap="5">

          <Text size="2" color="gray">Последнее обновление: апрель 2026</Text>

          <Section title="1. Кто мы">
            <Text>
              Log Life — персональное приложение для трекинга привычек и действий.
              Сервис работает на базе Supabase (облачная PostgreSQL с хостингом в EU/US).
            </Text>
          </Section>

          <Section title="2. Какие данные мы собираем">
            <Text>При регистрации и использовании мы храним:</Text>
            <BulletList items={[
              'Email-адрес — для авторизации.',
              'Дела (deeds) — названия, описания, структура форм, которые вы создаёте.',
              'Записи (records) — ваши ответы на формы с датой и временем.',
              'Дату и время создания/изменения объектов.',
            ]} />
            <Text>Мы не собираем имя, телефон, платёжные данные или геолокацию.</Text>
          </Section>

          <Section title="3. Как мы используем данные">
            <Text>Ваши данные используются исключительно для работы приложения:</Text>
            <BulletList items={[
              'Отображение ваших дел и записей в интерфейсе.',
              'Авторизация и защита аккаунта.',
              'Аналитика внутри приложения (тепловая карта, статистика) — только для вас.',
            ]} />
            <Text>Мы не передаём ваши данные третьим лицам, не продаём и не используем в рекламных целях.</Text>
          </Section>

          <Section title="4. Изоляция данных">
            <Text>
              Каждый пользователь видит только свои данные. Это обеспечивается на уровне базы данных
              через Row Level Security (RLS) в Postgres: даже при технической ошибке в коде
              приложения запрос к чужим данным будет заблокирован базой данных.
            </Text>
          </Section>

          <Section title="5. Хранение и безопасность">
            <BulletList items={[
              'Данные хранятся в Supabase — облачная PostgreSQL с шифрованием at rest.',
              'Соединение с сервером всегда через HTTPS.',
              'Пароли никогда не хранятся в открытом виде — только bcrypt-хэш через Supabase Auth.',
              'Сессия хранится в localStorage вашего браузера в виде JWT-токена.',
            ]} />
          </Section>

          <Section title="6. Ваши права">
            <Text>Вы можете в любой момент:</Text>
            <BulletList items={[
              'Экспортировать свои данные (CSV) — через страницу Профиль.',
              'Удалить аккаунт и все данные — через страницу Профиль.',
              'Обратиться к нам по вопросам данных (см. контакты ниже).',
            ]} />
          </Section>

          <Section title="7. Файлы cookie">
            <Text>
              Приложение не использует рекламные или аналитические cookie.
              Supabase использует localStorage для хранения сессии авторизации.
            </Text>
          </Section>

          <Section title="8. Open Source">
            <Text>
              Код приложения открытый и доступен на GitHub. Вы можете развернуть Log Life
              самостоятельно на своём Supabase проекте — тогда ваши данные будут полностью
              под вашим контролем.
            </Text>
          </Section>

          <Section title="9. Изменения политики">
            <Text>
              При существенных изменениях мы обновим дату вверху этой страницы.
              Продолжение использования сервиса означает согласие с актуальной редакцией.
            </Text>
          </Section>
          
          </Flex>
        </Box>
      </Box>
    </Box>
  )
}

/** Секция с заголовком и содержимым. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Flex direction="column" gap="2">
      <Heading as="h2" size="3" weight="medium">{title}</Heading>
      {children}
    </Flex>
  )
}

/** Маркированный список. */
function BulletList({ items }: { items: string[] }) {
  return (
    <Flex direction="column" gap="1" pl="3">
      {items.map((item) => (
        <Text key={item} size="2">• {item}</Text>
      ))}
    </Flex>
  )
}
